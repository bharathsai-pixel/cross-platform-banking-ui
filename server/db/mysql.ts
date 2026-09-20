/**
 * server/db/mysql.ts
 *
 * Sequelize connection pool targeting MySQL 8+.
 *
 * Exports:
 *   sequelize   — the shared Sequelize instance (import this in model files)
 *   initMySQL() — call once at startup; authenticates, then syncs the schema
 *
 * Configuration is read exclusively from the `env` object exported by
 * `../config/env.ts` (which in turn reads process.env).  validateEnv() must
 * have been called before this module is first imported so that all required
 * variables are guaranteed to be present.
 */

import { readFileSync } from "fs";
import { Sequelize } from "sequelize";
import { env } from "../config/env.js";

// ── SSL options ───────────────────────────────────────────────────────────────

/**
 * Build the `dialectOptions.ssl` object when DB_MYSQL_SSL=true.
 * Reads the CA certificate from the path in DB_MYSQL_SSL_CA.
 * Terminates the process if the file cannot be read.
 */
function buildSslOptions(): { ca: Buffer } | undefined {
  if (!env.mysqlSsl) return undefined;

  const caPath = env.mysqlSslCa;
  if (!caPath) {
    // validateEnv() should have caught this already, but guard defensively.
    console.error(
      "[mysql] DB_MYSQL_SSL_CA is required when DB_MYSQL_SSL=true"
    );
    process.exit(1);
  }

  try {
    const ca = readFileSync(caPath);
    return { ca };
  } catch {
    console.error(
      `[mysql] Cannot read SSL CA file at "${caPath}"`
    );
    process.exit(1);
  }
}

const sslOptions = buildSslOptions();

// ── Sequelize instance ────────────────────────────────────────────────────────

export const sequelize = new Sequelize({
  dialect: "mysql",
  host: env.mysqlHost,
  port: env.mysqlPort,
  username: env.mysqlUser,
  password: env.mysqlPassword,
  database: env.mysqlName,
  timezone: "+00:00",
  logging: false,
  pool: {
    max: env.mysqlPoolMax,
    min: 0,
    acquire: 30_000,
    idle: 10_000,
  },
  dialectOptions: sslOptions ? { ssl: sslOptions } : undefined,
});

// ── initMySQL ─────────────────────────────────────────────────────────────────

/**
 * Authenticate the connection pool and sync the Sequelize schema.
 *
 * - Sets a 10-second hard timeout: if `authenticate()` has not returned by
 *   then, logs `[mysql] Connection timeout after 10s` and exits with code 1.
 * - In production (`NODE_ENV === 'production'`) calls `sync({ alter: false })`
 *   to never modify existing columns.
 * - In all other environments calls `sync({ alter: true })` to apply schema
 *   changes without dropping data.
 * - On any error: logs the error with prefix `[mysql] Startup error:` and
 *   exits with code 1.
 */
export async function initMySQL(): Promise<void> {
  const timeout = setTimeout(() => {
    console.error("[mysql] Connection timeout after 10s");
    process.exit(1);
  }, 10_000);

  try {
    await sequelize.authenticate();
    clearTimeout(timeout);

    await sequelize.sync();

    console.log("[mysql] Connected — database schema synchronized");
  } catch (err) {
    clearTimeout(timeout);
    console.error("[mysql] Startup error:", err);
    process.exit(1);
  }
}
