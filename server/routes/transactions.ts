/**
 * server/routes/transactions.ts
 *
 * Transaction routes: fund transfers and transaction history.
 * All routes require JWT authentication.
 */

import { Router, Response } from "express";
import { AuthenticatedRequest, requireAuth } from "../middleware/auth.js";
import { validateBody, validateQuery } from "../validation/schemas.js";
import {
  transferSchema,
  transactionQuerySchema,
  TransferInput,
  TransactionQueryInput,
} from "../validation/schemas.js";
import * as transferService from "../services/transferService.js";
import { transferLimiter } from "../middleware/rateLimiter.js";

export const transactionsRouter = Router();

// All transaction routes require authentication
transactionsRouter.use(requireAuth);

/**
 * POST /api/transactions/transfer
 * Execute a fund transfer between accounts.
 * Rate limited to prevent abuse.
 */
transactionsRouter.post(
  "/transfer",
  transferLimiter,
  validateBody(transferSchema),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const input = req.body as TransferInput;

      const ipAddress = req.ip ?? req.connection.remoteAddress;
      const userAgent = req.headers["user-agent"];

      const result = await transferService.executeTransfer(userId, input, {
        ipAddress,
        userAgent,
      });

      res.status(201).json({
        message: "Transfer completed successfully",
        transaction: result,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";

      if (message === "NO_USD_ACCOUNT" || message.startsWith("NO_")) {
        res.status(400).json({
          error: `You don't have an account in ${message.replace("NO_", "").replace("_ACCOUNT", "")} currency`,
        });
        return;
      }

      if (message === "INSUFFICIENT_BALANCE") {
        res.status(400).json({ error: "Insufficient balance for this transfer" });
        return;
      }

      if (message === "RECEIVER_NOT_FOUND") {
        res.status(404).json({ error: "Recipient account not found" });
        return;
      }

      if (message === "SELF_TRANSFER_NOT_ALLOWED") {
        res.status(400).json({ error: "Cannot transfer to your own account" });
        return;
      }

      if (message === "CONCURRENT_MODIFICATION") {
        res.status(409).json({
          error: "Account was modified during transfer. Please try again.",
        });
        return;
      }

      console.error("[transactions] Transfer error:", err);
      res.status(500).json({ error: "Transfer failed. Please try again." });
    }
  }
);

/**
 * GET /api/transactions
 * Get transaction history for the authenticated user.
 */
transactionsRouter.get(
  "/",
  validateQuery(transactionQuerySchema),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const query = req.query as unknown as TransactionQueryInput;

      const { transactions, total } = await transferService.getTransactionHistory(
        userId,
        query
      );

      res.json({
        transactions,
        pagination: {
          page: query.page,
          limit: query.limit,
          total,
          totalPages: Math.ceil(total / query.limit),
        },
      });
    } catch (err) {
      console.error("[transactions] History error:", err);
      res.status(500).json({ error: "Failed to retrieve transaction history" });
    }
  }
);

/**
 * GET /api/transactions/:id
 * Get a single transaction by ID.
 */
transactionsRouter.get(
  "/:id",
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const transactionId = req.params.id;

      // For now, return not implemented - can be added if needed
      res.status(501).json({
        error: "Single transaction lookup not yet implemented. Use the history endpoint.",
      });
    } catch (err) {
      console.error("[transactions] Get error:", err);
      res.status(500).json({ error: "Failed to retrieve transaction" });
    }
  }
);
