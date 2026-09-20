/**
 * server/db/mongodb.ts
 *
 * Mongoose connection targeting MongoDB 6+.
 *
 * Exports:
 *   initMongoDB() — call once at startup; connects Mongoose to the URI
 *                   supplied via DB_MONGO_URI.
 *
 * Configuration is read exclusively from the `env` object exported by
 * `../config/env.ts`.  validateEnv() must have been called before this
 * module is first imported so that all required variables are guaranteed
 * to be present.
 */

import mongoose from "mongoose";
import { env } from "../config/env.js";

// ── initMongoDB ───────────────────────────────────────────────────────────────

/**
 * Connect Mongoose to MongoDB.
 *
 * - Sets a 10-second hard timeout: if `mongoose.connect()` has not resolved
 *   by then, logs `[mongo] Connection timeout after 10s` and exits with
 *   code 1.
 * - Registers a persistent `error` listener: logs with `[mongo]` prefix but
 *   does NOT crash the process (Mongoose handles reconnect).
 * - Registers a persistent `disconnected` listener: logs a warning and lets
 *   Mongoose attempt automatic reconnection.
 * - On startup connection error: logs with prefix `[mongo] Startup error:`
 *   and exits with code 1.
 */
export async function initMongoDB(): Promise<void> {
  const tlsOptions =
    env.mongoTls
      ? { tls: true, tlsCAFile: env.mongoTlsCa }
      : {};

  const timeout = setTimeout(() => {
    console.error("[mongo] Connection timeout after 10s");
    process.exit(1);
  }, 10_000);

  mongoose.connection.on("error", (err) => {
    console.error("[mongo] Connection error:", err);
  });

  mongoose.connection.on("disconnected", () => {
    console.warn("[mongo] Disconnected — Mongoose will attempt reconnect");
  });

  try {
    await mongoose.connect(env.mongoUri, {
      serverSelectionTimeoutMS: 5_000,
      socketTimeoutMS: 45_000,
      ...tlsOptions,
    });
    clearTimeout(timeout);
    console.log("[mongo] Connected");
  } catch (err) {
    clearTimeout(timeout);
    console.error("[mongo] Startup error:", err);
    process.exit(1);
  }
}
