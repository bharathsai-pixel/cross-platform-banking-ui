/**
 * server/routes/accounts.ts
 *
 * Account management routes.
 * All routes require JWT authentication.
 */

import { Router, Response } from "express";
import { AuthenticatedRequest, requireAuth } from "../middleware/auth.js";
import { validateBody, validateQuery } from "../validation/schemas.js";
import {
  createAccountSchema,
  CreateAccountInput,
} from "../validation/schemas.js";
import * as accountService from "../services/accountService.js";
import { ActivityLog } from "../db/mongo-models/ActivityLog.js";

export const accountsRouter = Router();

// All account routes require authentication
accountsRouter.use(requireAuth);

/**
 * POST /api/accounts
 * Create a new account for the authenticated user.
 */
accountsRouter.post(
  "/",
  validateBody(createAccountSchema),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const input = req.body as CreateAccountInput;

      const account = await accountService.createAccount(userId, input);

      await ActivityLog.create({
        userId,
        eventType: "account.created",
        category: "account",
        metadata: { currency: input.currency, accountNumber: account.accountNumber },
      });

      res.status(201).json({
        message: "Account created successfully",
        account,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";

      if (message.startsWith("ACCOUNT_EXISTS_")) {
        res.status(409).json({
          error: `You already have a ${message.replace("ACCOUNT_EXISTS_", "")} account`,
        });
        return;
      }

      console.error("[accounts] Create error:", err);
      res.status(500).json({ error: "Failed to create account" });
    }
  }
);

/**
 * GET /api/accounts
 * List all accounts for the authenticated user.
 */
accountsRouter.get(
  "/",
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const accounts = await accountService.getUserAccounts(userId);

      await ActivityLog.create({
        userId,
        eventType: "account.viewed",
        category: "account",
        metadata: { count: accounts.length },
      });

      res.json({ accounts });
    } catch (err) {
      console.error("[accounts] List error:", err);
      res.status(500).json({ error: "Failed to retrieve accounts" });
    }
  }
);

/**
 * GET /api/accounts/:id
 * Get a specific account by ID.
 */
accountsRouter.get(
  "/:id",
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const accountId = req.params.id;

      const account = await accountService.getAccountById(accountId, userId);

      if (!account) {
        res.status(404).json({ error: "Account not found" });
        return;
      }

      res.json({ account });
    } catch (err) {
      console.error("[accounts] Get error:", err);
      res.status(500).json({ error: "Failed to retrieve account" });
    }
  }
);

/**
 * GET /api/accounts/:id/balance
 * Get the current balance for an account.
 */
accountsRouter.get(
  "/:id/balance",
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const accountId = req.params.id;

      const account = await accountService.getAccountById(accountId, userId);

      if (!account) {
        res.status(404).json({ error: "Account not found" });
        return;
      }

      res.json({
        accountId: account.id,
        accountNumber: account.accountNumber,
        balance: account.balance,
        currency: account.currency,
      });
    } catch (err) {
      console.error("[accounts] Balance error:", err);
      res.status(500).json({ error: "Failed to retrieve balance" });
    }
  }
);
