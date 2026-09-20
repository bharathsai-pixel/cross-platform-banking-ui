/**
 * server/routes/notifications.ts
 *
 * Notification routes for user alerts and messages.
 * All routes require JWT authentication.
 */

import { Router, Response } from "express";
import { AuthenticatedRequest, requireAuth } from "../middleware/auth.js";
import { validateQuery } from "../validation/schemas.js";
import { notificationQuerySchema, NotificationQueryInput } from "../validation/schemas.js";
import * as notificationService from "../services/notificationService.js";

export const notificationsRouter = Router();

// All notification routes require authentication
notificationsRouter.use(requireAuth);

/**
 * GET /api/notifications
 * Get notifications for the authenticated user with pagination.
 */
notificationsRouter.get(
  "/",
  validateQuery(notificationQuerySchema),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const query = req.query as unknown as NotificationQueryInput;

      const { notifications, total, unreadCount } =
        await notificationService.getUserNotifications(userId, query);

      res.json({
        notifications,
        unreadCount,
        pagination: {
          page: query.page,
          limit: query.limit,
          total,
          totalPages: Math.ceil(total / query.limit),
        },
      });
    } catch (err) {
      console.error("[notifications] List error:", err);
      res.status(500).json({ error: "Failed to retrieve notifications" });
    }
  }
);

/**
 * POST /api/notifications/:id/read
 * Mark a specific notification as read.
 */
notificationsRouter.post(
  "/:id/read",
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const notificationId = req.params.id;

      await notificationService.markNotificationRead(notificationId, userId);

      res.json({ message: "Notification marked as read" });
    } catch (err) {
      console.error("[notifications] Mark read error:", err);
      res.status(500).json({ error: "Failed to mark notification as read" });
    }
  }
);

/**
 * POST /api/notifications/read-all
 * Mark all notifications as read for the authenticated user.
 */
notificationsRouter.post(
  "/read-all",
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;

      const count = await notificationService.markAllNotificationsRead(userId);

      res.json({
        message: "All notifications marked as read",
        count,
      });
    } catch (err) {
      console.error("[notifications] Mark all read error:", err);
      res.status(500).json({ error: "Failed to mark all notifications as read" });
    }
  }
);

/**
 * DELETE /api/notifications/:id
 * Archive (soft delete) a notification.
 */
notificationsRouter.delete(
  "/:id",
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const notificationId = req.params.id;

      await notificationService.archiveNotification(notificationId, userId);

      res.json({ message: "Notification archived" });
    } catch (err) {
      console.error("[notifications] Archive error:", err);
      res.status(500).json({ error: "Failed to archive notification" });
    }
  }
);
