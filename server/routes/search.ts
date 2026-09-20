/**
 * server/routes/search.ts
 *
 * Similarity-based search over transactions and activity logs.
 * Uses TF-IDF + cosine similarity for semantic matching.
 */

import { Router, Response } from "express";
import { AuthenticatedRequest, requireAuth } from "../middleware/auth.js";
import { validateQuery } from "../validation/schemas.js";
import { searchSchema, SearchInput } from "../validation/schemas.js";
import * as searchService from "../services/searchService.js";

export const searchRouter = Router();

// All search routes require authentication
searchRouter.use(requireAuth);

/**
 * GET /api/search
 * Search across transactions and activity logs.
 *
 * Query params:
 *   - q: search query (required)
 *   - type: "transactions" | "activity" | "all" (default: "all")
 *   - limit: max results (default: 20, max: 50)
 *   - threshold: similarity threshold 0-1 (default: 0.3)
 */
searchRouter.get(
  "/",
  validateQuery(searchSchema),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const query = req.query as unknown as SearchInput;

      const results = await searchService.searchAll(userId, query.q, {
        type: query.type,
        limit: query.limit,
        threshold: query.threshold,
      });

      res.json({
        query: query.q,
        count: results.length,
        results,
      });
    } catch (err) {
      console.error("[search] Search error:", err);
      res.status(500).json({ error: "Search failed. Please try again." });
    }
  }
);
