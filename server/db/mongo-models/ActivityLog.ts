/**
 * server/db/mongo-models/ActivityLog.ts
 *
 * Mongoose model for activity logs stored in MongoDB.
 * Flexible schema for capturing user actions, transaction events,
 * and system events for audit trails and analytics.
 */

import { Schema, model, Document, Types } from "mongoose";

export type ActivityEventType =
  | "user.login"
  | "user.logout"
  | "user.register"
  | "user.password_change"
  | "account.created"
  | "account.viewed"
  | "transfer.initiated"
  | "transfer.completed"
  | "transfer.failed"
  | "beneficiary.added"
  | "beneficiary.updated"
  | "beneficiary.deleted"
  | "security.device_new"
  | "security.alert";

export interface IActivityLog extends Document {
  userId: string; // UUID string from MySQL users table
  eventType: ActivityEventType;
  category: "auth" | "account" | "transaction" | "beneficiary" | "security" | "system";
  metadata: Record<string, unknown>; // Flexible JSON for event-specific data
  ipAddress?: string;
  userAgent?: string;
  deviceFingerprint?: string;
  createdAt: Date;
}

const ActivityLogSchema = new Schema<IActivityLog>(
  {
    userId: { type: String, required: true, index: true },
    eventType: { type: String, required: true, index: true },
    category: {
      type: String,
      enum: ["auth", "account", "transaction", "beneficiary", "security", "system"],
      required: true,
      index: true,
    },
    metadata: { type: Schema.Types.Mixed, default: {} },
    ipAddress: { type: String },
    userAgent: { type: String },
    deviceFingerprint: { type: String },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    collection: "activity_logs",
    strict: true,
  }
);

// Index for time-based queries (most recent first)
ActivityLogSchema.index({ userId: 1, createdAt: -1 });

// Compound index for filtering by category and time
ActivityLogSchema.index({ userId: 1, category: 1, createdAt: -1 });

// Text index for search functionality
ActivityLogSchema.index(
  { "metadata.description": "text", "metadata.reference": "text" },
  { weights: { "metadata.description": 2, "metadata.reference": 1 } }
);

export const ActivityLog = model<IActivityLog>("ActivityLog", ActivityLogSchema);
