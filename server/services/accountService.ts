/**
 * server/services/accountService.ts
 *
 * Account management service. Handles account creation, balance queries,
 * and account listing for authenticated users.
 */

import { Account } from "../db/models/Account.js";
import { User } from "../db/models/User.js";
import { newUuid, uuidToBuffer, bufferToUuid } from "../utils/uuid.js";
import type { CreateAccountInput } from "../validation/schemas.js";

export interface AccountResponse {
  id: string;
  accountNumber: string;
  balance: string;
  currency: string;
  createdAt: Date;
}

/**
 * Create a new account for a user.
 * Optionally specify currency and initial balance.
 */
export async function createAccount(
  userId: string,
  input: CreateAccountInput
): Promise<AccountResponse> {
  const { currency, accountNumber, initialBalance } = input;

  // Check if user already has an account in this currency
  const existing = await Account.findOne({
    where: { user_id: uuidToBuffer(userId), currency },
  });

  if (existing) {
    throw new Error(`ACCOUNT_EXISTS_${currency}`);
  }

  const accountUuid = newUuid();
  const generatedAccountNumber =
    accountNumber || generateAccountNumber();

  const account = await Account.create({
    id: accountUuid.buffer,
    user_id: uuidToBuffer(userId),
    account_number: generatedAccountNumber,
    balance: initialBalance || "0.0000",
    currency,
    version_id: 0,
  });

  return {
    id: accountUuid.uuid,
    accountNumber: account.account_number,
    balance: account.balance,
    currency: account.currency,
    createdAt: account.created_at,
  };
}

/**
 * Get all accounts for a user.
 */
export async function getUserAccounts(userId: string): Promise<AccountResponse[]> {
  const accounts = await Account.findAll({
    where: { user_id: uuidToBuffer(userId) },
    order: [["created_at", "ASC"]],
  });

  return accounts.map((acc) => ({
    id: bufferToUuid(acc.id),
    accountNumber: acc.account_number,
    balance: acc.balance,
    currency: acc.currency,
    createdAt: acc.created_at,
  }));
}

/**
 * Get a single account by ID, ensuring it belongs to the user.
 */
export async function getAccountById(
  accountId: string,
  userId: string
): Promise<AccountResponse | null> {
  const account = await Account.findOne({
    where: {
      id: uuidToBuffer(accountId),
      user_id: uuidToBuffer(userId),
    },
  });

  if (!account) return null;

  return {
    id: bufferToUuid(account.id),
    accountNumber: account.account_number,
    balance: account.balance,
    currency: account.currency,
    createdAt: account.created_at,
  };
}

/**
 * Get account by account number (for transfers).
 * Returns account with user info.
 */
export async function getAccountByNumber(
  accountNumber: string
): Promise<{ id: string; userId: string; balance: string; currency: string } | null> {
  const account = await Account.findOne({
    where: { account_number: accountNumber.trim() },
  });

  if (!account) return null;

  return {
    id: bufferToUuid(account.id),
    userId: bufferToUuid(account.user_id),
    balance: account.balance,
    currency: account.currency,
  };
}

/**
 * Generate a random 16-digit account number formatted as XXXX-XXXX-XXXX-XXXX.
 */
function generateAccountNumber(): string {
  const rand4 = () => Math.floor(1000 + Math.random() * 9000).toString();
  return `${rand4()}-${rand4()}-${rand4()}-${rand4()}`;
}

// Re-export bufferToUuid for convenience
export { bufferToUuid };
