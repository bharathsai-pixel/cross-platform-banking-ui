# Design Document — Hybrid DB Backend

## Overview

This document describes the technical design for replacing the existing SQLite authentication layer with a production-grade dual-database backend:

- **MySQL 8+ (via Sequelize v6)** — relational data requiring strict ACID guarantees: user identity, multi-currency accounts, and the immutable transaction ledger.
- **MongoDB 6+ (via Mongoose v8)** — high-throughput semi-structured operational data: device sessions with TTL-based expiry, append-only security audit logs, and raw payment gateway payloads.

The SQLite layer (`server/db/database.ts`) remains in service during a migration window; once `migrate-sqlite-to-mysql.ts` has been run and verified, the existing auth routes are re-pointed at the MySQL layer. No breaking change is made to the `/api/auth/login` or `/api/auth/register` request/response contract.

---

## Architecture

### Component Diagram

```mermaid
graph TB
    subgraph Client
        FE[React + Vite SPA\nPort 3000 / 5173]
    end

    subgraph Express Server ["Express Server (server/index.ts)"]
        MW[Middleware\nexpress.json 1 MB limit]
        R_AUTH[/api/auth/*\nauth.ts]
        R_TXN[/api/transactions/*\ntransactions.ts]
        R_SES[/api/auth/session*\nsessions.ts]
        R_HEALTH[/api/health\nhealth.ts]
        TS[TransferService\ntransfer.service.ts]
        AS[AuditService\naudit.service.ts]
    end

    subgraph MySQL_Layer ["MySQL Layer (Sequelize v6)"]
        SEQ[Sequelize Connection Pool\nmysql.ts]
        M_USER[User model]
        M_ACC[Account model]
        M_TXN[Transaction model]
        DB_MY[(MySQL 8+\nACID / SERIALIZABLE)]
    end

    subgraph Mongo_Layer ["MongoDB Layer (Mongoose v8)"]
        MON[Mongoose Connection\nmongodb.ts]
        MM_DS[DeviceSession model\nTTL on refreshTokenExpiresAt]
        MM_AL[AuditLog model\nAppend-only]
        MM_GP[GatewayPayload model]
        DB_MO[(MongoDB 6+\nReplica Set / Standalone)]
    end

    subgraph Legacy ["Legacy (migration window only)"]
        SQ[better-sqlite3\ndatabase.ts]
        DB_SQ[(SQLite\ndata/banking.db)]
    end

    FE -->|HTTPS JSON| MW
    MW --> R_AUTH
    MW --> R_TXN
    MW --> R_SES
    MW --> R_HEALTH

    R_AUTH -->|login / register| SEQ
    R_AUTH -->|fallback during migration| SQ
    R_TXN --> TS
    R_SES --> MON
    R_HEALTH --> SEQ
    R_HEALTH --> MON

    TS --> SEQ
    TS --> AS
    AS --> MON

    SEQ --> M_USER --> DB_MY
    SEQ --> M_ACC --> DB_MY
    SEQ --> M_TXN --> DB_MY

    MON --> MM_DS --> DB_MO
    MON --> MM_AL --> DB_MO
    MON --> MM_GP --> DB_MO

    SQ --> DB_SQ
```

### Migration Coexistence Strategy

During the migration window the server mounts **both** the old SQLite auth helpers and the new MySQL helpers:

1. `server/db/database.ts` (SQLite) stays untouched — existing `/api/auth/*` routes continue working.
2. `server/db/mysql.ts` and `server/db/mongodb.ts` are initialised at startup in parallel with SQLite.
3. After `migrate-sqlite-to-mysql.ts` is executed and data is verified, `server/routes/auth.ts` is updated to import from the MySQL layer and the SQLite import is removed from `server/index.ts`.

---

## Components and Interfaces

### File Structure

```
server/
├── index.ts                          ← startup: init MySQL + MongoDB + routes
├── db/
│   ├── database.ts                   ← (existing) SQLite — kept during migration
│   ├── mysql.ts                      ← Sequelize connection + sync
│   ├── mongodb.ts                    ← Mongoose connection
│   └── models/
│       ├── User.ts                   ← Sequelize User model
│       ├── Account.ts                ← Sequelize Account model
│       └── Transaction.ts            ← Sequelize Transaction model
│   └── mongo-models/
│       ├── DeviceSession.ts          ← Mongoose DeviceSession + TTL index
│       ├── AuditLog.ts               ← Mongoose AuditLog (append-only)
│       └── GatewayPayload.ts         ← Mongoose GatewayPayload
├── services/
│   ├── transfer.service.ts           ← atomic transfer with optimistic-lock retry
│   └── audit.service.ts              ← audit log write + in-process retry queue
├── routes/
│   ├── auth.ts                       ← updated after migration to use MySQL
│   ├── transactions.ts               ← POST /api/transactions/transfer
│   ├── sessions.ts                   ← session CRUD endpoints
│   └── health.ts                     ← GET /api/health
└── scripts/
    └── migrate-sqlite-to-mysql.ts    ← one-shot migration script
```

### Key Interface Contracts

#### `TransferInput` (transfer.service.ts)

```typescript
interface TransferInput {
  senderAccountId: string;    // hex UUID
  receiverAccountId: string;  // hex UUID
  amount: number;             // 0.01 – 999_999_999.99, ≤ 2 decimal places
  currency: string;           // ISO 4217, e.g. "USD"
  transactionType: 'internal' | 'wire' | 'billpay';
  initiatorUserId: string;    // hex UUID
  ipAddress: string;
  geoCoordinates?: { latitude: number; longitude: number };
}

type TransferResult =
  | { ok: true;  transactionId: string; senderNewBalance: number; receiverNewBalance: number }
  | { ok: false; code: 'INSUFFICIENT_FUNDS' | 'LOCK_CONFLICT_MAX_RETRIES' | 'TRANSFER_FAILED' | 'INVALID_INPUT'; correlationId: string };
```

#### `AuditService` (audit.service.ts)

```typescript
interface AppendAuditOptions {
  userId: string;
  action: AuditAction;
  ipAddress?: string;
  userAgent?: string;
  geoCoordinates?: { latitude: number; longitude: number };
  payloadSnapshot?: Record<string, unknown>;
  severity?: 'info' | 'warning' | 'critical';
}

function appendAudit(opts: AppendAuditOptions): Promise<void>;
```

Sensitive fields (`password`, `passwordHash`, `pinHash`, `resetToken`, `refreshToken`, `rawPayload`) are stripped from `payloadSnapshot` before storage.

---

## Data Models

### MySQL DDL — Production-Ready Scripts (MySQL 8+)

```sql
-- ──────────────────────────────────────────────────────────────
-- Helpers
-- ──────────────────────────────────────────────────────────────
CREATE DATABASE IF NOT EXISTS nexuspay
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE nexuspay;

-- ──────────────────────────────────────────────────────────────
-- users
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id               BINARY(16)   NOT NULL,
  username         VARCHAR(30)  NOT NULL COLLATE utf8mb4_unicode_ci,
  first_name       VARCHAR(100) NOT NULL,
  last_name        VARCHAR(100) NOT NULL,
  email            VARCHAR(320) NOT NULL COLLATE utf8mb4_unicode_ci,
  password_hash    VARCHAR(255) NOT NULL,
  pin_hash         VARCHAR(255) NOT NULL DEFAULT '',
  kyc_status       ENUM('pending','verified','rejected') NOT NULL DEFAULT 'pending',
  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  reset_token      VARCHAR(64)           DEFAULT NULL,
  reset_token_expires BIGINT            DEFAULT NULL,

  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email    (email),
  UNIQUE KEY uq_users_username (username),
  KEY        idx_users_email   (email) USING BTREE
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

-- ──────────────────────────────────────────────────────────────
-- accounts
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS accounts (
  id             BINARY(16)        NOT NULL,
  user_id        BINARY(16)        NOT NULL,
  account_number VARCHAR(30)       NOT NULL,
  balance        DECIMAL(15,4)     NOT NULL DEFAULT 0.0000,
  currency       CHAR(3)           NOT NULL,
  version_id     INT UNSIGNED      NOT NULL DEFAULT 0,
  created_at     DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uq_accounts_number          (account_number),
  UNIQUE KEY uq_accounts_user_currency   (user_id, currency),
  KEY        idx_accounts_user_id        (user_id) USING BTREE,
  CONSTRAINT fk_accounts_user
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT chk_accounts_balance CHECK (balance >= 0)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

-- ──────────────────────────────────────────────────────────────
-- transactions  (append-only ledger — no UPDATE/DELETE via ORM)
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transactions (
  id                  BINARY(16)    NOT NULL,
  sender_account_id   BINARY(16)    NOT NULL,
  receiver_account_id BINARY(16)    NOT NULL,
  amount              DECIMAL(15,4) NOT NULL,
  currency            CHAR(3)       NOT NULL,
  transaction_type    ENUM('internal','wire','billpay') NOT NULL,
  status              ENUM('pending','completed','failed','reversed') NOT NULL DEFAULT 'pending',
  reference_id        VARCHAR(128)  DEFAULT NULL,
  created_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  KEY idx_txn_sender   (sender_account_id,   created_at) USING BTREE,
  KEY idx_txn_receiver (receiver_account_id, created_at) USING BTREE,
  KEY idx_txn_reference (reference_id),
  CONSTRAINT fk_txn_sender
    FOREIGN KEY (sender_account_id)   REFERENCES accounts (id) ON DELETE RESTRICT,
  CONSTRAINT fk_txn_receiver
    FOREIGN KEY (receiver_account_id) REFERENCES accounts (id) ON DELETE RESTRICT,
  CONSTRAINT chk_txn_amount CHECK (amount > 0)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;
```

### Sequelize Models (TypeScript)

#### `server/db/mysql.ts` — Connection + Sync

```typescript
import { Sequelize } from 'sequelize';
import { readFileSync } from 'fs';

function getPoolMax(): number {
  const raw = process.env.DB_MYSQL_POOL_MAX;
  if (!raw) return 10;
  const n = parseInt(raw, 10);
  if (!Number.isInteger(n) || n < 1 || n > 100) return 10;
  return n;
}

const sslOptions = (() => {
  if (process.env.DB_MYSQL_SSL !== 'true') return undefined;
  const caPath = process.env.DB_MYSQL_SSL_CA;
  if (!caPath) {
    console.error('[mysql] DB_MYSQL_SSL_CA is required when DB_MYSQL_SSL=true');
    process.exit(1);
  }
  try {
    return { ca: readFileSync(caPath) };
  } catch {
    console.error(`[mysql] Cannot read SSL CA file at "${caPath}"`);
    process.exit(1);
  }
})();

export const sequelize = new Sequelize({
  dialect: 'mysql',
  host:     process.env.DB_MYSQL_HOST     ?? 'localhost',
  port:     Number(process.env.DB_MYSQL_PORT ?? 3306),
  username: process.env.DB_MYSQL_USER,
  password: process.env.DB_MYSQL_PASSWORD,
  database: process.env.DB_MYSQL_NAME,
  timezone: 'Z',
  logging:  false,
  pool: { max: getPoolMax(), min: 0, acquire: 30_000, idle: 10_000 },
  dialectOptions: sslOptions ? { ssl: sslOptions } : undefined,
});

export async function initMySQL(): Promise<void> {
  const timeout = setTimeout(() => {
    console.error('[mysql] Connection timeout after 10s');
    process.exit(1);
  }, 10_000);

  try {
    await sequelize.authenticate();
    clearTimeout(timeout);
    const alter = process.env.NODE_ENV !== 'production';
    await sequelize.sync({ alter });
    console.log(`[mysql] Connected — sync({ alter: ${alter} })`);
  } catch (err) {
    clearTimeout(timeout);
    console.error('[mysql] Startup error:', err);
    process.exit(1);
  }
}
```

#### `server/db/models/User.ts`

```typescript
import { DataTypes, Model, InferAttributes, InferCreationAttributes } from 'sequelize';
import { sequelize } from '../mysql.js';

export class User extends Model<InferAttributes<User>, InferCreationAttributes<User>> {
  declare id: Buffer;            // BINARY(16) UUID
  declare username: string;
  declare first_name: string;
  declare last_name: string;
  declare email: string;
  declare password_hash: string;
  declare pin_hash: string;
  declare kyc_status: 'pending' | 'verified' | 'rejected';
  declare reset_token: string | null;
  declare reset_token_expires: number | null;
  declare readonly created_at: Date;
  declare readonly updated_at: Date;
}

User.init({
  id:           { type: DataTypes.BINARY(16), primaryKey: true },
  username:     { type: DataTypes.STRING(30), allowNull: false, unique: true },
  first_name:   { type: DataTypes.STRING(100), allowNull: false },
  last_name:    { type: DataTypes.STRING(100), allowNull: false },
  email:        { type: DataTypes.STRING(320), allowNull: false, unique: true },
  password_hash:{ type: DataTypes.STRING(255), allowNull: false },
  pin_hash:     { type: DataTypes.STRING(255), allowNull: false, defaultValue: '' },
  kyc_status:   { type: DataTypes.ENUM('pending','verified','rejected'), allowNull: false, defaultValue: 'pending' },
  reset_token:           { type: DataTypes.STRING(64), allowNull: true, defaultValue: null },
  reset_token_expires:   { type: DataTypes.BIGINT,     allowNull: true, defaultValue: null },
  created_at:   DataTypes.DATE,
  updated_at:   DataTypes.DATE,
}, {
  sequelize,
  tableName: 'users',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [{ fields: ['email'], using: 'BTREE' }],
});
```

#### `server/db/models/Account.ts`

```typescript
import { DataTypes, Model, InferAttributes, InferCreationAttributes } from 'sequelize';
import { sequelize } from '../mysql.js';

export class Account extends Model<InferAttributes<Account>, InferCreationAttributes<Account>> {
  declare id: Buffer;
  declare user_id: Buffer;
  declare account_number: string;
  declare balance: string;     // DECIMAL stored as string to preserve precision
  declare currency: string;    // ISO 4217
  declare version_id: number;
  declare readonly created_at: Date;
  declare readonly updated_at: Date;
}

Account.init({
  id:             { type: DataTypes.BINARY(16), primaryKey: true },
  user_id:        { type: DataTypes.BINARY(16), allowNull: false,
                    references: { model: 'users', key: 'id' } },
  account_number: { type: DataTypes.STRING(30), allowNull: false, unique: true },
  balance:        { type: DataTypes.DECIMAL(15, 4), allowNull: false, defaultValue: '0.0000' },
  currency:       { type: DataTypes.CHAR(3), allowNull: false },
  version_id:     { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
  created_at:     DataTypes.DATE,
  updated_at:     DataTypes.DATE,
}, {
  sequelize,
  tableName: 'accounts',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['user_id'], using: 'BTREE' },
    { unique: true, fields: ['user_id', 'currency'] },
  ],
});
```

#### `server/db/models/Transaction.ts`

```typescript
import { DataTypes, Model, InferAttributes, InferCreationAttributes } from 'sequelize';
import { sequelize } from '../mysql.js';

export type TransactionStatus = 'pending' | 'completed' | 'failed' | 'reversed';
export type TransactionType   = 'internal' | 'wire' | 'billpay';

export class Transaction extends Model<InferAttributes<Transaction>, InferCreationAttributes<Transaction>> {
  declare id: Buffer;
  declare sender_account_id: Buffer;
  declare receiver_account_id: Buffer;
  declare amount: string;
  declare currency: string;
  declare transaction_type: TransactionType;
  declare status: TransactionStatus;
  declare reference_id: string | null;
  declare readonly created_at: Date;
}

Transaction.init({
  id:                  { type: DataTypes.BINARY(16), primaryKey: true },
  sender_account_id:   { type: DataTypes.BINARY(16), allowNull: false },
  receiver_account_id: { type: DataTypes.BINARY(16), allowNull: false },
  amount:              { type: DataTypes.DECIMAL(15, 4), allowNull: false },
  currency:            { type: DataTypes.CHAR(3), allowNull: false },
  transaction_type:    { type: DataTypes.ENUM('internal','wire','billpay'), allowNull: false },
  status:              { type: DataTypes.ENUM('pending','completed','failed','reversed'),
                         allowNull: false, defaultValue: 'pending' },
  reference_id:        { type: DataTypes.STRING(128), allowNull: true, defaultValue: null },
  created_at:          { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, {
  sequelize,
  tableName: 'transactions',
  timestamps: false,   // created_at is set once; no updatedAt
  indexes: [
    { fields: ['sender_account_id',   'created_at'], using: 'BTREE' },
    { fields: ['receiver_account_id', 'created_at'], using: 'BTREE' },
  ],
});

// Prevent UPDATE/DELETE at the ORM level — status transitions go through
// a dedicated service method that issues a raw parameterised UPDATE.
Transaction.beforeBulkUpdate(() => { throw new Error('Transactions are immutable via ORM bulk ops'); });
Transaction.beforeBulkDestroy(() => { throw new Error('Transactions cannot be deleted'); });
```

### Mongoose Models (TypeScript)

#### `server/db/mongodb.ts` — Connection

```typescript
import mongoose from 'mongoose';

export async function initMongoDB(): Promise<void> {
  const uri = process.env.DB_MONGO_URI;
  if (!uri) {
    console.error('[mongo] DB_MONGO_URI is required');
    process.exit(1);
  }

  const tlsOptions = process.env.DB_MONGO_TLS === 'true'
    ? { tls: true, tlsCAFile: process.env.DB_MONGO_TLS_CA }
    : {};

  const timeout = setTimeout(() => {
    console.error('[mongo] Connection timeout after 10s');
    process.exit(1);
  }, 10_000);

  mongoose.connection.on('error', (err) => {
    console.error('[mongo] Connection error:', err);
  });
  mongoose.connection.on('disconnected', () => {
    console.warn('[mongo] Disconnected — Mongoose will attempt reconnect');
  });

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5_000,
      socketTimeoutMS: 45_000,
      ...tlsOptions,
    });
    clearTimeout(timeout);
    console.log('[mongo] Connected');
  } catch (err) {
    clearTimeout(timeout);
    console.error('[mongo] Startup error:', err);
    process.exit(1);
  }
}
```

#### `server/db/mongo-models/DeviceSession.ts`

```typescript
import { Schema, model, Document } from 'mongoose';

export interface IDeviceSession extends Document {
  userId: string;
  platform: 'ios' | 'android' | 'web';
  deviceFingerprint: string;
  fcmToken?: string;
  osVersion: string;
  refreshToken: string;          // SHA-256 hash of raw token
  refreshTokenExpiresAt: Date;   // TTL index — auto-deleted within 60s of expiry
  ipAddress: string;
  userAgent: string;
  lastSeenAt: Date;
  createdAt: Date;
}

const DeviceSessionSchema = new Schema<IDeviceSession>({
  userId:               { type: String, required: true, index: true },
  platform:             { type: String, enum: ['ios','android','web'], required: true },
  deviceFingerprint:    { type: String },
  fcmToken:             { type: String },
  osVersion:            { type: String },
  refreshToken:         { type: String, required: true, unique: true },
  refreshTokenExpiresAt:{ type: Date,   required: true },
  ipAddress:            { type: String },
  userAgent:            { type: String },
  lastSeenAt:           { type: Date, default: () => new Date() },
}, {
  timestamps: true,
  collection: 'devices_and_sessions',
  // Prevent operator-injection attacks
  strict: true,
});

// TTL index: MongoDB removes documents within 60s after refreshTokenExpiresAt
DeviceSessionSchema.index(
  { refreshTokenExpiresAt: 1 },
  { expireAfterSeconds: 0 }
);

export const DeviceSession = model<IDeviceSession>('DeviceSession', DeviceSessionSchema);
```

#### `server/db/mongo-models/AuditLog.ts`

```typescript
import { Schema, model, Document } from 'mongoose';

export type AuditAction =
  | 'login' | 'logout'
  | 'transfer_initiated' | 'transfer_completed' | 'transfer_failed'
  | 'password_changed' | 'pin_changed' | 'kyc_updated'
  | 'device_registered' | 'session_revoked';

export interface IAuditLog extends Document {
  userId: string;
  action: AuditAction;
  ipAddress?: string;
  userAgent?: string;
  geoCoordinates?: { latitude: number; longitude: number };
  payloadSnapshot?: Record<string, unknown>;
  severity: 'info' | 'warning' | 'critical';
  createdAt: Date;
}

const SENSITIVE_FIELDS = new Set([
  'password', 'passwordHash', 'pinHash',
  'resetToken', 'refreshToken', 'rawPayload',
]);

function stripSensitive(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(obj).filter(([k]) => !SENSITIVE_FIELDS.has(k))
  );
}

const AuditLogSchema = new Schema<IAuditLog>({
  userId:   { type: String, required: true },
  action:   {
    type: String,
    required: true,
    enum: ['login','logout','transfer_initiated','transfer_completed',
           'transfer_failed','password_changed','pin_changed',
           'kyc_updated','device_registered','session_revoked'],
  },
  ipAddress:        { type: String },
  userAgent:        { type: String },
  geoCoordinates:   {
    latitude:  { type: Number },
    longitude: { type: Number },
  },
  payloadSnapshot:  { type: Schema.Types.Mixed, set: stripSensitive },
  severity:         { type: String, enum: ['info','warning','critical'], default: 'info' },
}, {
  timestamps: true,
  collection: 'activity_audit_logs',
});

// Compound index for paginated audit history per user
AuditLogSchema.index({ userId: 1, createdAt: -1 });

// Index for security dashboard by severity
AuditLogSchema.index({ severity: 1, createdAt: -1 });

// Optional TTL — controlled by AUDIT_LOG_RETENTION_DAYS env var
const retentionDays = Number(process.env.AUDIT_LOG_RETENTION_DAYS);
if (Number.isFinite(retentionDays) && retentionDays > 0) {
  AuditLogSchema.index(
    { createdAt: 1 },
    { expireAfterSeconds: Math.floor(retentionDays * 86_400) }
  );
}

// Append-only enforcement: block all updates and deletes at the model level
AuditLogSchema.pre('findOneAndUpdate', function () {
  throw new Error('AuditLog is append-only');
});
AuditLogSchema.pre('updateOne', function () {
  throw new Error('AuditLog is append-only');
});
AuditLogSchema.pre('deleteOne', function () {
  throw new Error('AuditLog is append-only');
});
AuditLogSchema.pre('deleteMany', function () {
  throw new Error('AuditLog is append-only');
});

export const AuditLog = model<IAuditLog>('AuditLog', AuditLogSchema);
```

#### `server/db/mongo-models/GatewayPayload.ts`

```typescript
import { Schema, model, Document } from 'mongoose';
import mongoose from 'mongoose';

export interface IGatewayPayload extends Document {
  processor: 'stripe' | 'razorpay' | 'plaid' | 'other';
  transactionId: string;            // hex UUID — MySQL transactions.id
  rawPayload: Record<string, unknown> | string;   // Mixed; GridFS ref if oversized
  httpStatusCode?: number;
  eventType?: string;
  processorTransactionId?: string;
  createdAt: Date;
}

const GatewayPayloadSchema = new Schema<IGatewayPayload>({
  processor:              { type: String, enum: ['stripe','razorpay','plaid','other'], required: true },
  transactionId:          { type: String, required: true },
  rawPayload:             { type: Schema.Types.Mixed },
  httpStatusCode:         { type: Number },
  eventType:              { type: String },
  processorTransactionId: { type: String },
}, {
  timestamps: true,
  collection: 'gateway_payloads',
});

GatewayPayloadSchema.index({ transactionId: 1 });
GatewayPayloadSchema.index({ processor: 1, createdAt: -1 });

export const GatewayPayload = model<IGatewayPayload>('GatewayPayload', GatewayPayloadSchema);
```

---

## Transfer Service — Full TypeScript Implementation

### `server/services/audit.service.ts`

```typescript
import { AuditLog, AuditAction } from '../db/mongo-models/AuditLog.js';
import { nanoid } from 'nanoid';

interface AppendAuditOptions {
  userId: string;
  action: AuditAction;
  ipAddress?: string;
  userAgent?: string;
  geoCoordinates?: { latitude: number; longitude: number };
  payloadSnapshot?: Record<string, unknown>;
  severity?: 'info' | 'warning' | 'critical';
}

// Simple in-process retry queue — documents that failed on first write.
// In production, replace with a durable queue (BullMQ, SQS, etc.).
interface RetryEntry { opts: AppendAuditOptions; attempts: number; correlationId: string }
const retryQueue: RetryEntry[] = [];

async function flushRetryQueue(): Promise<void> {
  const pending = retryQueue.splice(0);
  for (const entry of pending) {
    try {
      await AuditLog.create(entry.opts);
    } catch {
      if (entry.attempts < 3) {
        retryQueue.push({ ...entry, attempts: entry.attempts + 1 });
      } else {
        console.error(`[audit] Permanently failed to write audit log — correlationId: ${entry.correlationId}`);
      }
    }
  }
}

// Flush every 5 seconds
setInterval(flushRetryQueue, 5_000).unref();

export async function appendAudit(opts: AppendAuditOptions): Promise<void> {
  try {
    await AuditLog.create(opts);
  } catch (err) {
    const correlationId = nanoid();
    console.error(`[audit] Write failed, enqueuing for retry — correlationId: ${correlationId}`, err);
    retryQueue.push({ opts, attempts: 1, correlationId });
  }
}
```

### `server/services/transfer.service.ts`

```typescript
import { Transaction as SeqTransaction } from 'sequelize';
import { v4 as uuidv4 } from 'uuid';
import { nanoid } from 'nanoid';
import Decimal from 'decimal.js';

import { sequelize } from '../db/mysql.js';
import { Account } from '../db/models/Account.js';
import { Transaction } from '../db/models/Transaction.js';
import { appendAudit } from './audit.service.js';

// ── Types ─────────────────────────────────────────────────────

export interface TransferInput {
  senderAccountId: string;
  receiverAccountId: string;
  amount: number;
  currency: string;
  transactionType: 'internal' | 'wire' | 'billpay';
  initiatorUserId: string;
  ipAddress: string;
  geoCoordinates?: { latitude: number; longitude: number };
}

export type TransferResult =
  | { ok: true;  transactionId: string; senderNewBalance: string; receiverNewBalance: string }
  | { ok: false; code: 'INSUFFICIENT_FUNDS' | 'LOCK_CONFLICT_MAX_RETRIES' | 'TRANSFER_FAILED' | 'INVALID_INPUT';
      correlationId: string; message?: string };

export class OptimisticLockError extends Error {}

// ── Validation ────────────────────────────────────────────────

const AMOUNT_REGEX = /^\d+(\.\d{1,2})?$/;
const CURRENCY_REGEX = /^[A-Z]{3}$/;
const TX_TYPES = new Set(['internal', 'wire', 'billpay']);

function validateInput(input: TransferInput): string | null {
  const { senderAccountId, receiverAccountId, amount, currency, transactionType,
          initiatorUserId, ipAddress } = input;

  if (!senderAccountId || !receiverAccountId || !initiatorUserId || !ipAddress)
    return 'Missing required field';
  if (senderAccountId === receiverAccountId)
    return 'senderAccountId and receiverAccountId must differ';
  if (!AMOUNT_REGEX.test(String(amount)) || amount < 0.01 || amount > 999_999_999.99)
    return 'amount must be between 0.01 and 999,999,999.99 with at most 2 decimal places';
  if (!CURRENCY_REGEX.test(currency))
    return 'currency must be a 3-character ISO 4217 code';
  if (!TX_TYPES.has(transactionType))
    return 'transactionType must be internal, wire, or billpay';

  return null;
}

// ── UUID helpers (hex ↔ Buffer) ───────────────────────────────

function hexToBuffer(hex: string): Buffer {
  return Buffer.from(hex.replace(/-/g, ''), 'hex');
}

function bufferToHex(buf: Buffer): string {
  return buf.toString('hex');
}

// ── Core transfer (single attempt) ───────────────────────────

async function attemptTransfer(input: TransferInput): Promise<
  { ok: true; transactionId: Buffer; senderNewBalance: string; receiverNewBalance: string }
> {
  const seqTx: SeqTransaction = await sequelize.transaction({
    isolationLevel: Transaction.ISOLATION_LEVELS.SERIALIZABLE as unknown as any,
  });

  try {
    // 1. Lock and read sender account
    const sender = await Account.findOne({
      where: { id: hexToBuffer(input.senderAccountId) },
      lock: seqTx.LOCK.UPDATE,
      transaction: seqTx,
    });
    if (!sender) throw Object.assign(new Error('SENDER_NOT_FOUND'), { code: 'SENDER_NOT_FOUND' });

    const senderBalance = new Decimal(sender.balance);
    const transferAmount = new Decimal(input.amount);

    if (senderBalance.lessThan(transferAmount)) {
      await seqTx.rollback();
      throw Object.assign(new Error('INSUFFICIENT_FUNDS'), { code: 'INSUFFICIENT_FUNDS' });
    }

    // 2. Debit sender with optimistic lock
    const senderCurrentVersion = sender.version_id;
    const [senderRows] = await sequelize.query(
      `UPDATE accounts
         SET balance     = balance - :amount,
             version_id  = version_id + 1,
             updated_at  = NOW()
       WHERE id         = :id
         AND version_id = :version`,
      { replacements: { amount: input.amount, id: hexToBuffer(input.senderAccountId), version: senderCurrentVersion },
        transaction: seqTx }
    ) as [unknown, number];

    if ((senderRows as any).affectedRows === 0) {
      await seqTx.rollback();
      throw new OptimisticLockError('Sender version mismatch');
    }

    // 3. Lock and read receiver account
    const receiver = await Account.findOne({
      where: { id: hexToBuffer(input.receiverAccountId) },
      lock: seqTx.LOCK.UPDATE,
      transaction: seqTx,
    });
    if (!receiver) {
      await seqTx.rollback();
      throw Object.assign(new Error('RECEIVER_NOT_FOUND'), { code: 'RECEIVER_NOT_FOUND' });
    }

    // 4. Credit receiver with optimistic lock
    const receiverCurrentVersion = receiver.version_id;
    const [receiverRows] = await sequelize.query(
      `UPDATE accounts
         SET balance     = balance + :amount,
             version_id  = version_id + 1,
             updated_at  = NOW()
       WHERE id         = :id
         AND version_id = :version`,
      { replacements: { amount: input.amount, id: hexToBuffer(input.receiverAccountId), version: receiverCurrentVersion },
        transaction: seqTx }
    ) as [unknown, number];

    if ((receiverRows as any).affectedRows === 0) {
      await seqTx.rollback();
      throw new OptimisticLockError('Receiver version mismatch');
    }

    // 5. Insert transaction row as pending
    const txnId = Buffer.from(uuidv4().replace(/-/g, ''), 'hex');
    await Transaction.create({
      id:                  txnId,
      sender_account_id:   hexToBuffer(input.senderAccountId),
      receiver_account_id: hexToBuffer(input.receiverAccountId),
      amount:              String(input.amount),
      currency:            input.currency,
      transaction_type:    input.transactionType,
      status:              'pending',
    }, { transaction: seqTx });

    // 6. Commit
    await seqTx.commit();

    // 7. Post-commit: mark transaction as completed (non-blocking; retry on failure)
    sequelize.query(
      `UPDATE transactions SET status = 'completed' WHERE id = :id`,
      { replacements: { id: txnId } }
    ).catch((err) => {
      console.error(`[transfer] Post-commit status update failed for txn ${bufferToHex(txnId)}`, err);
      // Enqueue for retry (implementation omitted for brevity — same pattern as audit retry queue)
    });

    // Read back new balances
    const [senderFinal] = await Account.findAll({ where: { id: hexToBuffer(input.senderAccountId) } });
    const [receiverFinal] = await Account.findAll({ where: { id: hexToBuffer(input.receiverAccountId) } });

    return {
      ok: true,
      transactionId: txnId,
      senderNewBalance:   senderFinal.balance,
      receiverNewBalance: receiverFinal.balance,
    };
  } catch (err) {
    // Rollback if still open
    if (!seqTx.finished) await seqTx.rollback().catch(() => undefined);
    throw err;
  }
}

// ── Public service function ───────────────────────────────────

const BACKOFFS = [50, 100, 200]; // ms

export async function executeTransfer(input: TransferInput): Promise<TransferResult> {
  const validationError = validateInput(input);
  if (validationError) {
    return { ok: false, code: 'INVALID_INPUT', correlationId: nanoid(), message: validationError };
  }

  let lastError: unknown;

  for (let attempt = 0; attempt <= 3; attempt++) {
    try {
      const result = await attemptTransfer(input);

      // Audit success — fire-and-forget with retry queue
      await appendAudit({
        userId: input.initiatorUserId,
        action: 'transfer_completed',
        ipAddress: input.ipAddress,
        geoCoordinates: input.geoCoordinates,
        payloadSnapshot: { transactionId: bufferToHex(result.transactionId) },
        severity: 'info',
      });

      return {
        ok: true,
        transactionId:    bufferToHex(result.transactionId),
        senderNewBalance:   result.senderNewBalance,
        receiverNewBalance: result.receiverNewBalance,
      };
    } catch (err: any) {
      lastError = err;

      if (err.code === 'INSUFFICIENT_FUNDS') {
        await appendAudit({
          userId: input.initiatorUserId, action: 'transfer_failed',
          ipAddress: input.ipAddress, severity: 'warning',
          payloadSnapshot: { reason: 'INSUFFICIENT_FUNDS' },
        });
        return { ok: false, code: 'INSUFFICIENT_FUNDS', correlationId: nanoid() };
      }

      if (err instanceof OptimisticLockError && attempt < 3) {
        await new Promise((r) => setTimeout(r, BACKOFFS[attempt]));
        continue;
      }

      // All other failures
      await appendAudit({
        userId: input.initiatorUserId, action: 'transfer_failed',
        ipAddress: input.ipAddress, severity: 'warning',
        payloadSnapshot: { reason: err.message ?? 'UNKNOWN' },
      });
      break;
    }
  }

  if (lastError instanceof OptimisticLockError) {
    return { ok: false, code: 'LOCK_CONFLICT_MAX_RETRIES', correlationId: nanoid() };
  }

  const correlationId = nanoid();
  console.error(`[transfer] Failed — correlationId: ${correlationId}`, lastError);
  return { ok: false, code: 'TRANSFER_FAILED', correlationId };
}
```

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Conservation of Funds

*For any* two accounts with balances B_s and B_r, and any valid transfer amount A, after a successful transfer the sum `(sender_balance_after + receiver_balance_after)` must equal `(B_s + B_r)` — no funds are created or destroyed.

**Validates: Requirements 9.3, 9.4, 9.5**

### Property 2: version_id Monotonic Increment

*For any* account and any sequence of N successful balance updates applied to that account, `version_id_after` must equal `version_id_before + N`. version_id never decreases and never skips a value under sequential updates.

**Validates: Requirements 3.7, 9.3, 9.4**

### Property 3: Transfer Input Validation Completeness

*For any* transfer input where at least one of the following is true — a required field is null/missing, `amount` is outside [0.01, 999,999,999.99], `amount` has more than 2 decimal places, or `senderAccountId` equals `receiverAccountId` — the transfer service must return an `INVALID_INPUT` error and no database row must be inserted or modified.

**Validates: Requirements 9.1, 9.9, 10.2, 10.3, 10.4, 10.5**

### Property 4: Insufficient Funds Leaves State Unchanged

*For any* sender account with balance B and any transfer amount A where A > B, after the failed transfer attempt: sender balance remains B, receiver balance remains unchanged, and no `transactions` row is inserted.

**Validates: Requirements 9.8**

### Property 5: Pool Max Clamping

*For any* value supplied as `DB_MYSQL_POOL_MAX` — including arbitrary integers, floats, negative values, zero, non-numeric strings, and absent — the resolved pool max must be the input value if it is an integer in [1, 100], and 10 otherwise.

**Validates: Requirements 1.7**

### Property 6: Duplicate User Rejection

*For any* user that already exists in the `users` table, attempting to insert another user with the same email must return an error identifying `email` as the conflicting field, and the table row count must remain unchanged. The same holds for `username`.

**Validates: Requirements 2.2, 2.3, 2.7**

### Property 7: Refresh Token Hashing Round Trip

*For any* raw refresh token string, the value stored in the `DeviceSession.refreshToken` field must equal `SHA-256(rawToken)` and must not equal `rawToken` (assuming non-empty inputs).

**Validates: Requirements 11.2**

### Property 8: Migration UUID Determinism

*For any* SQLite user id string, the UUID v5 derived from it using the fixed namespace must be identical across multiple invocations of the migration script — running the migration twice on the same source data produces the same `BINARY(16)` IDs.

**Validates: Requirements 12.3**

### Property 9: Sensitive Value Log Exclusion

*For any* environment variable whose name contains `PASSWORD`, `SECRET`, `KEY`, or `TOKEN`, its value must not appear as a substring in any string passed to the logger at any log level during startup, error handling, or normal operation.

**Validates: Requirements 13.6**

---

## Error Handling

### MySQL Startup Failures

| Condition | Behavior |
|---|---|
| Connection timeout (>10s) | Log `[mysql]` prefix + exit code 1 |
| Invalid SSL CA path | Log `[mysql]` prefix + exit code 1 |
| Missing required env var | Log `[config]` prefix for each missing var + exit code 1 |

### MongoDB Startup Failures

| Condition | Behavior |
|---|---|
| Connection timeout (>10s) | Log `[mongo]` prefix + exit code 1 |
| Post-startup disconnect | Log `[mongo]` warning; Mongoose handles reconnect |
| Post-startup error | Log `[mongo]` error; process stays alive |

### Transfer Operation Failures

| Condition | HTTP | Error Code |
|---|---|---|
| Invalid input | 400 | `INVALID_INPUT` |
| Missing fields | 400 | — (lists missing fields) |
| Invalid amount | 400 | `INVALID_AMOUNT` |
| Invalid currency | 400 | `INVALID_CURRENCY` |
| Invalid type | 400 | `INVALID_TRANSACTION_TYPE` |
| Insufficient balance | 422 | `INSUFFICIENT_FUNDS` |
| Exhausted retries | 500 | `LOCK_CONFLICT_MAX_RETRIES` |
| General DB failure | 500 | `TRANSFER_FAILED` + correlationId |

### Post-Commit Failures (non-reversing)

Both of these failures occur **after** the MySQL commit has been durably written and must **not** cause a rollback:

- **`transactions.status` update to `'completed'` fails** → log with transaction reference, enqueue for retry via in-process queue.
- **MongoDB AuditLog write fails** → log with `[audit]` prefix and transaction reference, enqueue for retry via `audit.service.ts` retry queue.

### Optimistic Lock Retry Strategy

```
Attempt 1: immediate
Attempt 2: wait 50ms
Attempt 3: wait 100ms
Attempt 4: wait 200ms → return LOCK_CONFLICT_MAX_RETRIES
```

---

## Testing Strategy

### Unit Tests (Vitest)

- **`transfer.service.ts`**: mock Sequelize and verify INSUFFICIENT_FUNDS path, post-commit audit failure path, and all `INVALID_INPUT` branches.
- **`audit.service.ts`**: verify retry queue enqueues on failure and flushes successfully on retry.
- **`mysql.ts`**: verify `getPoolMax()` clamping logic for all input classes (covered by Property 5 property test).
- **`AuditLog` model**: verify `stripSensitive` removes all restricted field names from payloadSnapshot.
- **Route handlers (`transactions.ts`, `sessions.ts`, `health.ts`)**: verify request validation and response shapes.

### Property-Based Tests (fast-check — minimum 100 iterations each)

The project uses [fast-check](https://github.com/dubzzz/fast-check) for property-based testing.

Each property test is tagged with:
> **Feature: hybrid-db-backend, Property N: {property_text}**

| Property | Test Description | fast-check Arbitraries |
|---|---|---|
| 1 — Fund Conservation | For any two balances and valid amount, debit + credit net = 0 | `fc.float`, `fc.integer` |
| 2 — version_id Monotonic | For any sequence of N updates, version_id = initial + N | `fc.array(fc.float)` |
| 3 — Input Validation Completeness | For any invalid input, no DB mutation + INVALID_INPUT returned | `fc.record` with invalid generators |
| 4 — Insufficient Funds State | For any amount > balance, state unchanged after failed transfer | `fc.float` |
| 5 — Pool Max Clamping | For any pool max input value, resolved value is in [1,100] or 10 | `fc.anything` |
| 6 — Duplicate User Rejection | For any existing user, re-inserting same email/username returns 409 | `fc.record` with string arbitraries |
| 7 — Refresh Token Hashing | For any token string, stored value = sha256(token) ≠ token | `fc.string` |
| 8 — Migration UUID Determinism | For any SQLite id string, uuid_v5 is idempotent | `fc.string` |
| 9 — Sensitive Log Exclusion | For any sensitive env var name, its value never appears in logs | `fc.string` |

### Integration Tests

- **MySQL connection**: verify schema is applied correctly (INFORMATION_SCHEMA checks).
- **MongoDB connection**: verify TTL indexes are created on DeviceSession.
- **Transfer end-to-end**: single round trip with real DB (test database), verifying balances and AuditLog insertion.
- **Health check**: mock MySQL/MongoDB down states and verify correct HTTP 503 bodies.
- **Migration script**: run against a test SQLite file, verify row counts and UUID stability.

---

## Environment Variables

Complete list of all required and optional environment variables. Update `.env.example` accordingly.

```dotenv
# ─────────────────────────────────────────────────────────────────────────
# NexusPay Environment Variables
# Copy this file to .env and fill in your values.
# NEVER commit .env to source control.
# ─────────────────────────────────────────────────────────────────────────

# ── Server ────────────────────────────────────────────────────────────────
PORT=3000
APP_URL=http://localhost:5173
NODE_ENV=development

# ── MySQL (Required) ──────────────────────────────────────────────────────
DB_MYSQL_HOST=127.0.0.1
DB_MYSQL_PORT=3306
DB_MYSQL_USER=nexuspay_app
DB_MYSQL_PASSWORD=your-mysql-password-here
DB_MYSQL_NAME=nexuspay

# MySQL connection pool — optional, defaults to 10; must be integer 1–100
DB_MYSQL_POOL_MAX=10

# MySQL SSL — optional; set both if enabling TLS to MySQL
DB_MYSQL_SSL=false
DB_MYSQL_SSL_CA=/path/to/mysql-ca.pem

# ── MongoDB (Required) ────────────────────────────────────────────────────
DB_MONGO_URI=mongodb://localhost:27017/nexuspay

# MongoDB TLS — optional; set both if enabling TLS to MongoDB
DB_MONGO_TLS=false
DB_MONGO_TLS_CA=/path/to/mongo-ca.pem

# ── Auth / Tokens (Required) ──────────────────────────────────────────────
# JWT signing secret — MUST be at least 32 characters
JWT_SECRET=change-me-to-a-random-32-plus-char-string

# ── Audit Log Retention (Optional) ───────────────────────────────────────
# Number of days after which audit log documents are auto-expired via TTL.
# Omit to retain logs indefinitely.
AUDIT_LOG_RETENTION_DAYS=365

# ── Email (SMTP) ──────────────────────────────────────────────────────────
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=you@gmail.com
EMAIL_PASS=your-app-password-here
EMAIL_FROM=NexusPay <no-reply@nexuspay.com>

# Set to "true" to log reset URLs to the console instead of sending email (dev only)
EMAIL_DEV_PREVIEW=true
```

### Startup Validation

At startup the server validates the following and exits with code 1 if any check fails (logging each missing variable with `[config]` prefix):

| Variable | Required | Validation |
|---|---|---|
| `DB_MYSQL_HOST` | Yes | non-empty string |
| `DB_MYSQL_PORT` | Yes | integer |
| `DB_MYSQL_USER` | Yes | non-empty string |
| `DB_MYSQL_PASSWORD` | Yes | non-empty string |
| `DB_MYSQL_NAME` | Yes | non-empty string |
| `DB_MONGO_URI` | Yes | non-empty string |
| `JWT_SECRET` | Yes | string, length ≥ 32 |
| `DB_MYSQL_SSL_CA` | Conditional | required when `DB_MYSQL_SSL=true` |
| `DB_MONGO_TLS_CA` | Conditional | required when `DB_MONGO_TLS=true` |
