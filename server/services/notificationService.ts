/**
 * server/services/notificationService.ts
 *
 * Notification service for creating, fetching, and marking notifications as read.
 * Stored in MongoDB for flexibility.
 */

import { Notification, INotification } from "../db/mongo-models/Notification.js";
import type { NotificationType } from "../db/mongo-models/Notification.js";

export interface NotificationResponse {
  id: string;
  type: NotificationType;
  priority: string;
  title: string;
  message: string;
  data?: Record<string, unknown>;
  read: boolean;
  readAt?: Date;
  createdAt: Date;
}

/**
 * Create a new notification for a user.
 */
export async function createNotification(input: {
  userId: string;
  type: NotificationType;
  priority?: "low" | "normal" | "high" | "urgent";
  title: string;
  message: string;
  data?: Record<string, unknown>;
  expiresAt?: Date;
}): Promise<NotificationResponse> {
  const notification = await Notification.create({
    userId: input.userId,
    type: input.type,
    priority: input.priority || "normal",
    title: input.title,
    message: input.message,
    data: input.data,
    expiresAt: input.expiresAt,
  });

  return {
    id: notification._id.toString(),
    type: notification.type,
    priority: notification.priority,
    title: notification.title,
    message: notification.message,
    data: notification.data,
    read: notification.read,
    readAt: notification.readAt,
    createdAt: notification.createdAt,
  };
}

/**
 * Get notifications for a user with pagination.
 */
export async function getUserNotifications(
  userId: string,
  query: {
    page: number;
    limit: number;
    unreadOnly?: boolean;
    type?: NotificationType;
  }
): Promise<{ notifications: NotificationResponse[]; total: number; unreadCount: number }> {
  const { page, limit, unreadOnly, type } = query;
  const skip = (page - 1) * limit;

  const filter: Record<string, unknown> = {
    userId,
    archived: false,
  };

  if (unreadOnly) {
    filter.read = false;
  }

  if (type) {
    filter.type = type;
  }

  const [notifications, total, unreadCount] = await Promise.all([
    Notification.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Notification.countDocuments(filter),
    Notification.countDocuments({ userId, read: false, archived: false }),
  ]);

  return {
    notifications: notifications.map((n) => ({
      id: n._id.toString(),
      type: n.type,
      priority: n.priority,
      title: n.title,
      message: n.message,
      data: n.data,
      read: n.read,
      readAt: n.readAt,
      createdAt: n.createdAt,
    })),
    total,
    unreadCount,
  };
}

/**
 * Mark a notification as read.
 */
export async function markNotificationRead(
  notificationId: string,
  userId: string
): Promise<void> {
  await Notification.updateOne(
    { _id: notificationId, userId },
    { read: true, readAt: new Date() }
  );
}

/**
 * Mark all notifications as read for a user.
 */
export async function markAllNotificationsRead(userId: string): Promise<number> {
  const result = await Notification.updateMany(
    { userId, read: false },
    { read: true, readAt: new Date() }
  );
  return result.modifiedCount;
}

/**
 * Archive a notification (soft delete).
 */
export async function archiveNotification(
  notificationId: string,
  userId: string
): Promise<void> {
  await Notification.updateOne(
    { _id: notificationId, userId },
    { archived: true }
  );
}
