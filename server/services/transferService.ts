/**
 * server/services/transferService.ts
 *
 * Fund transfer service with atomic transaction guarantees.
 * Uses MySQL transactions to ensure debit + credit succeed together
 * or neither happens (ACID compliance).
 *
 * Implements optimistic locking via version_id to prevent lost updates
 * when concurrent transfers occur.
 */

import { sequelize } from "../db/mysql.js";
import { QueryTypes, Transaction as SeqlizeTransaction } from "sequelize";
import { Account } from "../db/models/Account.js";
import { Transaction } from "../db/models/Transaction.js";
import { Beneficiary } from "../db/models/Beneficiary.js";
import { Notification } from "../db/mongo-models/Notification.js";
import { ActivityLog } from "../db/mongo-models/ActivityLog.js";
import { newUuid, uuidToBuffer, bufferToUuid } from "../utils/uuid.js";
import type { TransferInput } from "../validation/schemas.js";

export type TransactionType = "internal" | "wire" | "billpay";
export type TransactionStatus = "pending" | "completed" | "failed" | "reversed";

export interface TransferResult {
  transactionId: string;
  status: TransactionStatus;
  amount: string;
  currency: string;
  senderAccountNumber: string;
  receiverAccountNumber: string;
  referenceId?: string;
  createdAt: Date;
}

export interface TransactionResponse {
  id: string;
  senderAccountId: string;
  receiverAccountId: string;
  amount: string;
  currency: string;
  transactionType: TransactionType;
  status: TransactionStatus;
  referenceId: string | null;
  createdAt: Date;
  direction: "outgoing" | "incoming";
  counterpartyAccountNumber?: string;
}

/**
 * Execute a fund transfer with atomic guarantee.
 * Returns the transaction record on success.
 */
export async function executeTransfer(
  senderUserId: string,
  input: TransferInput,
  reqMeta: { ipAddress?: string; userAgent?: string }
): Promise<TransferResult> {
  const { receiverAccountNumber, amount, currency, reference, beneficiaryId, note } = input;
  const amountDecimal = parseFloat(amount);

  // Find sender's account in the specified currency
  const senderAccount = await Account.findOne({
    where: {
      user_id: uuidToBuffer(senderUserId),
      currency,
    },
  });

  if (!senderAccount) {
    throw new Error(`NO_${currency}_ACCOUNT`);
  }

  // Check if sender has sufficient balance
  const senderBalance = parseFloat(senderAccount.balance);
  if (senderBalance < amountDecimal) {
    throw new Error("INSUFFICIENT_BALANCE");
  }

  // Find receiver account
  const receiverAccount = await Account.findOne({
    where: { account_number: receiverAccountNumber.trim() },
  });

  if (!receiverAccount) {
    throw new Error("RECEIVER_NOT_FOUND");
  }

  // Prevent self-transfer
  if (bufferToUuid(senderAccount.id) === bufferToUuid(receiverAccount.id)) {
    throw new Error("SELF_TRANSFER_NOT_ALLOWED");
  }

  const senderAccountId = bufferToUuid(senderAccount.id);
  const receiverAccountId = bufferToUuid(receiverAccount.id);
  const transactionUuid = newUuid();
  const referenceId = reference || generateReferenceId();

  // Execute transfer atomically using MySQL transaction
  const result = await sequelize.transaction(async (t) => {
    // Lock sender account row and get fresh balance
    const senderRows = await sequelize.query<{ balance: string; version_id: number }>(
      `SELECT balance, version_id FROM accounts WHERE id = UUID_TO_BIN(?) FOR UPDATE`,
      {
        replacements: [senderAccountId],
        transaction: t,
        type: QueryTypes.SELECT,
      }
    );

    if (!senderRows || senderRows.length === 0) {
      throw new Error("SENDER_ACCOUNT_NOT_FOUND");
    }

    const senderRow = senderRows[0];
    const freshBalance = parseFloat(senderRow.balance);
    if (freshBalance < amountDecimal) {
      throw new Error("INSUFFICIENT_BALANCE");
    }

    // Lock receiver account row
    const receiverRows = await sequelize.query<{ balance: string }>(
      `SELECT balance FROM accounts WHERE id = UUID_TO_BIN(?) FOR UPDATE`,
      {
        replacements: [receiverAccountId],
        transaction: t,
        type: QueryTypes.SELECT,
      }
    );

    if (!receiverRows || receiverRows.length === 0) {
      throw new Error("RECEIVER_ACCOUNT_NOT_FOUND");
    }

    // Create transaction record with status 'pending'
    await sequelize.query(
      `INSERT INTO transactions (id, sender_account_id, receiver_account_id, amount, currency, transaction_type, status, reference_id, created_at)
       VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?), UUID_TO_BIN(?), ?, ?, 'internal', 'pending', ?, NOW())`,
      {
        replacements: [
          transactionUuid.uuid,
          senderAccountId,
          receiverAccountId,
          amount,
          currency,
          referenceId,
        ],
        transaction: t,
      }
    );

    // Debit sender account (with optimistic lock check)
    const debitResult = await sequelize.query(
      `UPDATE accounts SET balance = balance - ?, version_id = version_id + 1, updated_at = NOW()
       WHERE id = UUID_TO_BIN(?) AND version_id = ?`,
      {
        replacements: [amount, senderAccountId, senderRow.version_id],
        transaction: t,
        type: QueryTypes.UPDATE,
      }
    ) as [unknown, number];

    if (!debitResult || debitResult[1] === 0) {
      throw new Error("CONCURRENT_MODIFICATION");
    }

    // Credit receiver account
    await sequelize.query(
      `UPDATE accounts SET balance = balance + ?, version_id = version_id + 1, updated_at = NOW()
       WHERE id = UUID_TO_BIN(?)`,
      {
        replacements: [amount, receiverAccountId],
        transaction: t,
      }
    );

    // Update transaction status to 'completed'
    await sequelize.query(
      `UPDATE transactions SET status = 'completed' WHERE id = UUID_TO_BIN(?)`,
      {
        replacements: [transactionUuid.uuid],
        transaction: t,
      }
    );

    return { status: "completed" as TransactionStatus };
  });

  // Log activity for sender
  await ActivityLog.create({
    userId: senderUserId,
    eventType: "transfer.completed",
    category: "transaction",
    metadata: {
      transactionId: transactionUuid.uuid,
      amount,
      currency,
      receiverAccountNumber,
      referenceId,
      note,
    },
    ipAddress: reqMeta.ipAddress,
    userAgent: reqMeta.userAgent,
  });

  // Log activity for receiver
  await ActivityLog.create({
    userId: bufferToUuid(receiverAccount.user_id),
    eventType: "transfer.completed",
    category: "transaction",
    metadata: {
      transactionId: transactionUuid.uuid,
      amount,
      currency,
      senderAccountNumber: senderAccount.account_number,
      referenceId,
    },
  });

  // Create notification for receiver
  await Notification.create({
    userId: bufferToUuid(receiverAccount.user_id),
    type: "transaction",
    priority: "normal",
    title: "Funds Received",
    message: `You received ${currency} ${amount} from account ending in ${senderAccount.account_number.slice(-4)}`,
    data: {
      transactionId: transactionUuid.uuid,
      amount,
      currency,
      senderAccountNumber: senderAccount.account_number,
    },
  });

  return {
    transactionId: transactionUuid.uuid,
    status: result.status,
    amount,
    currency,
    senderAccountNumber: senderAccount.account_number,
    receiverAccountNumber,
    referenceId,
    createdAt: new Date(),
  };
}

/**
 * Get transaction history for a user.
 */
export async function getTransactionHistory(
  userId: string,
  query: {
    page: number;
    limit: number;
    type?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
    minAmount?: string;
    maxAmount?: string;
  }
): Promise<{ transactions: TransactionResponse[]; total: number }> {
  const { page, limit, type, status, startDate, endDate, minAmount, maxAmount } = query;
  const offset = (page - 1) * limit;

  // Get user's account IDs
  const accounts = await Account.findAll({
    where: { user_id: uuidToBuffer(userId) },
    attributes: ["id"],
  });

  if (accounts.length === 0) {
    return { transactions: [], total: 0 };
  }

  const accountIds = accounts.map((a) => bufferToUuid(a.id));

  // Build query conditions
  const conditions: string[] = [];
  const replacements: any[] = [];

  conditions.push(`(BIN_TO_UUID(sender_account_id) IN (?) OR BIN_TO_UUID(receiver_account_id) IN (?))`);
  replacements.push(accountIds, accountIds);

  if (type) {
    conditions.push(`transaction_type = ?`);
    replacements.push(type);
  }

  if (status) {
    conditions.push(`status = ?`);
    replacements.push(status);
  }

  if (startDate) {
    conditions.push(`created_at >= ?`);
    replacements.push(startDate);
  }

  if (endDate) {
    conditions.push(`created_at <= ?`);
    replacements.push(endDate);
  }

  if (minAmount) {
    conditions.push(`amount >= ?`);
    replacements.push(minAmount);
  }

  if (maxAmount) {
    conditions.push(`amount <= ?`);
    replacements.push(maxAmount);
  }

  const whereClause = conditions.join(" AND ");

  // Get total count
  const countRows = await sequelize.query<{ total: number }>(
    `SELECT COUNT(*) as total FROM transactions WHERE ${whereClause}`,
    { replacements, type: QueryTypes.SELECT }
  );

  const total = countRows?.[0]?.total || 0;

  // Get transactions with account numbers
  const rows = await sequelize.query<any>(
    `SELECT
      t.id, t.sender_account_id, t.receiver_account_id, t.amount, t.currency,
      t.transaction_type, t.status, t.reference_id, t.created_at,
      sa.account_number as sender_account_number,
      ra.account_number as receiver_account_number
    FROM transactions t
    JOIN accounts sa ON t.sender_account_id = sa.id
    JOIN accounts ra ON t.receiver_account_id = ra.id
    WHERE ${whereClause}
    ORDER BY t.created_at DESC
    LIMIT ? OFFSET ?`,
    { replacements: [...replacements, limit, offset], type: QueryTypes.SELECT }
  );

  const transactions: TransactionResponse[] = rows.map((row: any) => {
    const senderId = bufferToUuid(row.sender_account_id);
    const isOutgoing = accountIds.includes(senderId);

    return {
      id: bufferToUuid(row.id),
      senderAccountId: senderId,
      receiverAccountId: bufferToUuid(row.receiver_account_id),
      amount: row.amount,
      currency: row.currency,
      transactionType: row.transaction_type,
      status: row.status,
      referenceId: row.reference_id,
      createdAt: row.created_at,
      direction: isOutgoing ? "outgoing" : "incoming",
      counterpartyAccountNumber: isOutgoing
        ? row.receiver_account_number
        : row.sender_account_number,
    };
  });

  return { transactions, total };
}

/**
 * Generate a unique reference ID.
 */
function generateReferenceId(): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `TXN-${timestamp}-${random}`;
}
