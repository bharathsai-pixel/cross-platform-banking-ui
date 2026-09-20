import { Schema, model, Document } from "mongoose";

export interface IDeviceSession extends Document {
  userId: string;
  platform: "ios" | "android" | "web";
  deviceFingerprint?: string;
  fcmToken?: string;
  osVersion?: string;
  refreshToken: string; // SHA-256 hex hash of the raw token
  refreshTokenExpiresAt: Date; // TTL index — auto-deleted within 60s of expiry
  ipAddress?: string;
  userAgent?: string;
  lastSeenAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const DeviceSessionSchema = new Schema<IDeviceSession>(
  {
    userId: { type: String, required: true },
    platform: {
      type: String,
      enum: ["ios", "android", "web"],
      required: true,
    },
    deviceFingerprint: { type: String },
    fcmToken: { type: String },
    osVersion: { type: String },
    refreshToken: { type: String, required: true, unique: true },
    refreshTokenExpiresAt: { type: Date, required: true },
    ipAddress: { type: String },
    userAgent: { type: String },
    lastSeenAt: { type: Date, default: () => new Date() },
  },
  {
    timestamps: true,
    collection: "devices_and_sessions",
    strict: true,
  }
);

// TTL index: MongoDB removes documents within 60s after refreshTokenExpiresAt
DeviceSessionSchema.index({ refreshTokenExpiresAt: 1 }, { expireAfterSeconds: 0 });

// Non-unique index for lookups by userId
DeviceSessionSchema.index({ userId: 1 });

export const DeviceSession = model<IDeviceSession>(
  "DeviceSession",
  DeviceSessionSchema
);
