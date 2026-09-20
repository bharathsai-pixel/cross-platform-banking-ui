/**
 * server/db/mongo-models/Notification.ts
 *
 * Mongoose model for user notifications stored in MongoDB.
 * Supports transaction alerts, security alerts, and system notifications.
 */

import { Schema, model, Document } from "mongoose";

export type NotificationType = "transaction" | "security" | "system" | "promo";
export type NotificationPriority = "low" | "normal" | "high" | "urgent";

export interface INotification extends Document {
  userId: string; // UUID string from MySQL users table
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  message: string;
  data?: Record<string, unknown>; // Additional context (transaction ID, etc.)
  readAt?: Date;
  read: boolean;
  archived: boolean;
  expiresAt?: Date; // Optional TTL for promotional notifications
  createdAt: Date;
  updatedAt: Date;
}

const NotificationSchema = new Schema<INotification>(
  {
    userId: { type: String, required: true, index: true },
    type: {
      type: String,
      enum: ["transaction", "security", "system", "promo"],
      required: true,
      index: true,
    },
    priority: {
      type: String,
      enum: ["low", "normal", "high", "urgent"],
      default: "normal",
    },
    title: { type: String, required: true, maxlength: 200 },
    message: { type: String, required: true, maxlength: 1000 },
    data: { type: Schema.Types.Mixed },
    readAt: { type: Date },
    read: { type: Boolean, default: false, index: true },
    archived: { type: Boolean, default: false },
    expiresAt: { type: Date },
  },
  {
    timestamps: true,
    collection: "notifications",
    strict: true,
  }
);

// Index for fetching unread notifications
NotificationSchema.index({ userId: 1, read: 1, createdAt: -1 });

// Index for fetching by type
NotificationSchema.index({ userId: 1, type: 1, createdAt: -1 });

// TTL index for auto-deleting expired notifications (checks every 60 seconds)
NotificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, sparse: true });

export const Notification = model<INotification>("Notification", NotificationSchema);
