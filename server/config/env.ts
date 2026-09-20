/**
 * server/config/env.ts
 *
 * Startup environment validation module.
 * Call validateEnv() once at the very start of server/index.ts before any
 * DB initialisation.  The module also exports a pre-validated `env` object
 * so the rest of the codebase can import typed env values instead of reading
 * process.env directly.
 *
 * Security contract
 * ─────────────────
 * This module MUST NOT log the VALUE of any variable whose name contains the
 * substrings PASSWORD, SECRET, KEY, or TOKEN (case-insensitive).
 * Only the variable NAME is ever written to the log.
 */

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Returns true if the variable name is considered sensitive. */
function isSensitiveName(name: string): boolean {
  const upper = name.toUpperCase();
  return (
    upper.includes("PASSWORD") ||
    upper.includes("SECRET") ||
    upper.includes("KEY") ||
    upper.includes("TOKEN")
  );
}

/**
 * Reads an env var and records it as missing when absent.
 * Never logs the value; only the name is used in error messages.
 */
function required(
  name: string,
  missing: string[]
): string | undefined {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") {
    missing.push(name);
    return undefined;
  }
  return value;
}

// ── validateEnv ───────────────────────────────────────────────────────────────

/**
 * Validates all required and conditional environment variables.
 * Logs missing variable NAMES (never values) with prefix [config] and calls
 * process.exit(1) if validation fails.
 *
 * Call this function before any database initialisation.
 */
export function validateEnv(): void {
  const missing: string[] = [];

  // ── Required variables ───────────────────────────────────────────────────
  const mysqlHost     = required("DB_MYSQL_HOST",     missing);
  const mysqlPortRaw  = required("DB_MYSQL_PORT",     missing);
  const mysqlUser     = required("DB_MYSQL_USER",     missing);
  const mysqlPassword = required("DB_MYSQL_PASSWORD", missing);
  const mysqlName     = required("DB_MYSQL_NAME",     missing);
  const mongoUri      = required("DB_MONGO_URI",      missing);
  const jwtSecret     = required("JWT_SECRET",        missing);

  // Report missing required vars before doing any further validation
  if (missing.length > 0) {
    for (const name of missing) {
      console.error(`[config] Missing required environment variable: ${name}`);
    }
    process.exit(1);
  }

  // ── JWT_SECRET length ────────────────────────────────────────────────────
  // At this point jwtSecret is guaranteed to be defined (missing check above).
  if ((jwtSecret as string).length < 32) {
    console.error(
      `[config] JWT_SECRET must be at least 32 characters long (got ${(jwtSecret as string).length})`
    );
    process.exit(1);
  }

  // ── Conditional: MySQL SSL ───────────────────────────────────────────────
  const mysqlSslRaw = process.env["DB_MYSQL_SSL"];
  if (mysqlSslRaw === "true") {
    const sslCa = process.env["DB_MYSQL_SSL_CA"];
    if (!sslCa || sslCa.trim() === "") {
      console.error(
        "[config] DB_MYSQL_SSL_CA is required when DB_MYSQL_SSL=true"
      );
      process.exit(1);
    }
  }

  // ── Conditional: MongoDB TLS ─────────────────────────────────────────────
  const mongoTlsRaw = process.env["DB_MONGO_TLS"];
  if (mongoTlsRaw === "true") {
    const tlsCa = process.env["DB_MONGO_TLS_CA"];
    if (!tlsCa || tlsCa.trim() === "") {
      console.error(
        "[config] DB_MONGO_TLS_CA is required when DB_MONGO_TLS=true"
      );
      process.exit(1);
    }
  }

  // ── Optional: DB_MYSQL_POOL_MAX ──────────────────────────────────────────
  const poolMaxRaw = process.env["DB_MYSQL_POOL_MAX"];
  if (poolMaxRaw !== undefined && poolMaxRaw.trim() !== "") {
    const poolMax = Number(poolMaxRaw);
    if (!Number.isInteger(poolMax) || poolMax < 1 || poolMax > 100) {
      console.warn(
        "[config] DB_MYSQL_POOL_MAX must be an integer between 1 and 100; defaulting to 10"
      );
      // Not a fatal error — getPoolMax() in mysql.ts applies the same default
    }
  }

  // ── Optional: AUDIT_LOG_RETENTION_DAYS ───────────────────────────────────
  const retentionRaw = process.env["AUDIT_LOG_RETENTION_DAYS"];
  if (retentionRaw !== undefined && retentionRaw.trim() !== "") {
    const days = Number(retentionRaw);
    if (!Number.isInteger(days) || days < 1) {
      console.warn(
        "[config] AUDIT_LOG_RETENTION_DAYS must be a positive integer; TTL index will not be created"
      );
    }
  }

  // All validations passed — no log needed (keep startup output clean)
  void mysqlHost;
  void mysqlPortRaw;
  void mysqlUser;
  void mysqlPassword;
  void mysqlName;
  void mongoUri;
}

// ── env — typed accessor object ───────────────────────────────────────────────

/**
 * Pre-parsed, typed environment values.
 *
 * ⚠ This object is populated lazily at module load time, AFTER validateEnv()
 *   has been called from server/index.ts.  If you import `env` before calling
 *   validateEnv() some fields may be empty strings, which is intentional —
 *   the startup guard will have already exited the process if required vars
 *   were missing.
 */
export const env = {
  // ── Node ────────────────────────────────────────────────────────────────
  get nodeEnv(): string {
    return process.env["NODE_ENV"] ?? "development";
  },

  // ── MySQL ────────────────────────────────────────────────────────────────
  get mysqlHost(): string {
    return process.env["DB_MYSQL_HOST"] ?? "";
  },
  get mysqlPort(): number {
    const raw = process.env["DB_MYSQL_PORT"];
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 3306;
  },
  get mysqlUser(): string {
    return process.env["DB_MYSQL_USER"] ?? "";
  },
  get mysqlPassword(): string {
    return process.env["DB_MYSQL_PASSWORD"] ?? "";
  },
  get mysqlName(): string {
    return process.env["DB_MYSQL_NAME"] ?? "";
  },
  get mysqlPoolMax(): number {
    const raw = process.env["DB_MYSQL_POOL_MAX"];
    if (raw === undefined || raw.trim() === "") return 10;
    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) return 10;
    return parsed;
  },
  get mysqlSsl(): boolean {
    return process.env["DB_MYSQL_SSL"] === "true";
  },
  get mysqlSslCa(): string | undefined {
    return process.env["DB_MYSQL_SSL_CA"] ?? undefined;
  },

  // ── MongoDB ──────────────────────────────────────────────────────────────
  get mongoUri(): string {
    return process.env["DB_MONGO_URI"] ?? "";
  },
  get mongoTls(): boolean {
    return process.env["DB_MONGO_TLS"] === "true";
  },
  get mongoTlsCa(): string | undefined {
    return process.env["DB_MONGO_TLS_CA"] ?? undefined;
  },

  // ── Auth ─────────────────────────────────────────────────────────────────
  get jwtSecret(): string {
    return process.env["JWT_SECRET"] ?? "";
  },

  // ── Audit ────────────────────────────────────────────────────────────────
  get auditLogRetentionDays(): number | undefined {
    const raw = process.env["AUDIT_LOG_RETENTION_DAYS"];
    if (raw === undefined || raw.trim() === "") return undefined;
    const parsed = Number(raw);
    return Number.isInteger(parsed) && parsed >= 1 ? parsed : undefined;
  },
} as const satisfies {
  nodeEnv: string;
  mysqlHost: string;
  mysqlPort: number;
  mysqlUser: string;
  mysqlPassword: string;
  mysqlName: string;
  mysqlPoolMax: number;
  mysqlSsl: boolean;
  mysqlSslCa?: string;
  mongoUri: string;
  mongoTls: boolean;
  mongoTlsCa?: string;
  jwtSecret: string;
  auditLogRetentionDays?: number;
};
