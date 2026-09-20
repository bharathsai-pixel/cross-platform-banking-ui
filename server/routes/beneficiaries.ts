/**
 * server/routes/beneficiaries.ts
 *
 * Beneficiary management routes.
 * All routes require JWT authentication.
 */

import { Router, Response } from "express";
import { AuthenticatedRequest, requireAuth } from "../middleware/auth.js";
import { validateBody } from "../validation/schemas.js";
import {
  createBeneficiarySchema,
  updateBeneficiarySchema,
  CreateBeneficiaryInput,
  UpdateBeneficiaryInput,
} from "../validation/schemas.js";
import * as beneficiaryService from "../services/beneficiaryService.js";
import { ActivityLog } from "../db/mongo-models/ActivityLog.js";

export const beneficiariesRouter = Router();

// All beneficiary routes require authentication
beneficiariesRouter.use(requireAuth);

/**
 * POST /api/beneficiaries
 * Create a new beneficiary.
 */
beneficiariesRouter.post(
  "/",
  validateBody(createBeneficiarySchema),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const input = req.body as CreateBeneficiaryInput;

      const beneficiary = await beneficiaryService.createBeneficiary(userId, input);

      await ActivityLog.create({
        userId,
        eventType: "beneficiary.added",
        category: "beneficiary",
        metadata: {
          beneficiaryId: beneficiary.id,
          name: beneficiary.name,
          accountNumber: beneficiary.accountNumber,
        },
      });

      res.status(201).json({
        message: "Beneficiary added successfully",
        beneficiary,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";

      if (message === "BENEFICIARY_EXISTS") {
        res.status(409).json({
          error: "This beneficiary is already in your list",
        });
        return;
      }

      console.error("[beneficiaries] Create error:", err);
      res.status(500).json({ error: "Failed to add beneficiary" });
    }
  }
);

/**
 * GET /api/beneficiaries
 * List all beneficiaries for the authenticated user.
 */
beneficiariesRouter.get(
  "/",
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const beneficiaries = await beneficiaryService.getUserBeneficiaries(userId);

      res.json({ beneficiaries });
    } catch (err) {
      console.error("[beneficiaries] List error:", err);
      res.status(500).json({ error: "Failed to retrieve beneficiaries" });
    }
  }
);

/**
 * GET /api/beneficiaries/:id
 * Get a specific beneficiary by ID.
 */
beneficiariesRouter.get(
  "/:id",
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const beneficiaryId = req.params.id;

      const beneficiary = await beneficiaryService.getBeneficiaryById(
        beneficiaryId,
        userId
      );

      if (!beneficiary) {
        res.status(404).json({ error: "Beneficiary not found" });
        return;
      }

      res.json({ beneficiary });
    } catch (err) {
      console.error("[beneficiaries] Get error:", err);
      res.status(500).json({ error: "Failed to retrieve beneficiary" });
    }
  }
);

/**
 * PUT /api/beneficiaries/:id
 * Update a beneficiary.
 */
beneficiariesRouter.put(
  "/:id",
  validateBody(updateBeneficiarySchema),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const beneficiaryId = req.params.id;
      const input = req.body as UpdateBeneficiaryInput;

      const beneficiary = await beneficiaryService.updateBeneficiary(
        beneficiaryId,
        userId,
        input
      );

      await ActivityLog.create({
        userId,
        eventType: "beneficiary.updated",
        category: "beneficiary",
        metadata: { beneficiaryId, updates: input },
      });

      res.json({
        message: "Beneficiary updated successfully",
        beneficiary,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";

      if (message === "BENEFICIARY_NOT_FOUND") {
        res.status(404).json({ error: "Beneficiary not found" });
        return;
      }

      console.error("[beneficiaries] Update error:", err);
      res.status(500).json({ error: "Failed to update beneficiary" });
    }
  }
);

/**
 * DELETE /api/beneficiaries/:id
 * Delete a beneficiary.
 */
beneficiariesRouter.delete(
  "/:id",
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const beneficiaryId = req.params.id;

      await beneficiaryService.deleteBeneficiary(beneficiaryId, userId);

      await ActivityLog.create({
        userId,
        eventType: "beneficiary.deleted",
        category: "beneficiary",
        metadata: { beneficiaryId },
      });

      res.json({ message: "Beneficiary deleted successfully" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";

      if (message === "BENEFICIARY_NOT_FOUND") {
        res.status(404).json({ error: "Beneficiary not found" });
        return;
      }

      console.error("[beneficiaries] Delete error:", err);
      res.status(500).json({ error: "Failed to delete beneficiary" });
    }
  }
);
