# Implementation Plan: Hybrid DB Backend

## Overview

Replace and extend the existing SQLite authentication layer with a production-grade dual-database architecture. MySQL 8+ (Sequelize v6) handles ACID-critical relational data — users, multi-currency accounts, and the immutable transaction ledger. MongoDB 6+ (Mongoose v8) handles high-throughput semi-structured operational data — device sessions, append-only audit logs, and raw payment gateway payloads. The SQLite layer coexists during a migration window, after which the auth routes are re-pointed at MySQL with no change to the request/response contract.

Three additional algorithm services are implemented alongside the core backend: a cursor-based transaction search engine, a daily ledger reconciliation script with Merkle-style tamper detection, and a Bellman-Ford FX routing service with arbitrage detection.

---

## Tasks

- [x] 1. Install dependencies and configure environment
  - [x] 1.1 Install production dependencies: `sequelize`, `mysql2`, `mongoose`, `uuid`, `decimal.js`, `nanoid`
    - Run: `pnpm add sequelize mysql2 mongoose uuid decimal.js nanoid`
    - Verify the packages appear under `dependencies` in `package.json`
    - _Requirements: 1.1, 5.1, 13.1, 13.2_

  - [x] 1.2 Install dev/type dependencies: `@types/uuid`, `sequelize-typescript`, `fast-check`, `@types/node`
    - Run: `pnpm add -D @types/uuid fast-check`
    - `tsx` and `vitest` are already present; confirm `vitest` version ≥ 2.x supports property tests
    - _Requirements: 13.1, 13.2_

  - [x] 1.3 Update `.env.example` with all new environment variables
    - Add all MySQL, MongoDB, JWT, and audit-retention variables with placeholder values and inline comments
    - Ensure no variable containing `PASSWORD`, `SECRET`, `KEY`, or `TOKEN` has a real value
    - _Requirements: 13.5, 13.6_

- [x] 2. Environment validation and startup guard
  - [x] 2.1 Create `server/config/env.ts` — startup environment validation module
    - Read and validate all required env vars: `DB_MYSQL_HOST`, `DB_MYSQL_PORT`, `DB_MYSQL_USER`, `DB_MYSQL_PASSWORD`, `DB_MYSQL_NAME`, `DB_MONGO_URI`, `JWT_SECRET`
    - Log each missing variable with prefix `[config]` and call `process.exit(1)` if any are absent
    - Validate `JWT_SECRET` is at least 32 characters; exit with code 1 if shorter
    - Validate conditional vars: `DB_MYSQL_SSL_CA` required when `DB_MYSQL_SSL=true`; `DB_MONGO_TLS_CA` required when `DB_MONGO_TLS=true`
    - MUST NOT log the value of any variable whose name contains `PASSWORD`, `SECRET`, `KEY`, or `TOKEN`
    - _Requirements: 13.3, 13.4, 13.6_

  - [ ]* 2.2 Write property test for sensitive value log exclusion
    - **Property 9: Sensitive Value Log Exclusion**
    - **Validates: Requirements 13.6**
    - Use `fc.string()` to generate arbitrary sensitive variable values; spy on `console.error`/`console.warn`/`console.log`; assert none contain the generated value after `validateEnv()` runs
    - Tag: `Feature: hybrid-db-backend, Property 9`

- [x] 3. MySQL connection layer
  - [x] 3.1 Create `server/db/mysql.ts` — Sequelize connection pool and `initMySQL()`
    - Implement `getPoolMax()`: parse `DB_MYSQL_POOL_MAX`, clamp to [1, 100], default to 10 for absent/invalid input
    - Build `sslOptions` from `DB_MYSQL_SSL` + `DB_MYSQL_SSL_CA`; use `readFileSync` to load CA; call `process.exit(1)` with `[mysql]` prefix if file unreadable
    - Instantiate `Sequelize` with `dialect: 'mysql'`, `timezone: 'Z'`, `logging: false`, and the computed pool config
    - Implement `initMySQL()`: set a 10-second timeout that logs `[mysql]` and exits with code 1 on breach; call `sequelize.authenticate()`; call `sequelize.sync({ alter: NODE_ENV !== 'production' })`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8_

  - [ ]* 3.2 Write property test for pool max clamping
    - **Property 5: Pool Max Clamping**
    - **Validates: Requirements 1.7**
    - Use `fc.anything()` to generate arbitrary `DB_MYSQL_POOL_MAX` values; assert resolved pool max is the input value when it is an integer in [1, 100], and 10 otherwise
    - Tag: `Feature: hybrid-db-backend, Property 5`

- [x] 4. MySQL DDL migration file
  - [x] 4.1 Create `server/db/migrations/001_initial_schema.sql`
    - Include `CREATE DATABASE IF NOT EXISTS nexuspay` with `utf8mb4_unicode_ci`
    - Define `users` table: `BINARY(16)` PK, unique constraints on `email` and `username` with `utf8mb4_unicode_ci` collation, `BTREE` index on `email`, `ENUM` for `kyc_status`, `DATETIME` timestamps
    - Define `accounts` table: `BINARY(16)` PK, `DECIMAL(15,4)` balance with `CHECK (balance >= 0)`, `version_id INT UNSIGNED`, composite unique on `(user_id, currency)`, `BTREE` index on `user_id`, FK to `users` with `ON DELETE RESTRICT ON UPDATE CASCADE`
    - Define `transactions` table: `BINARY(16)` PK, FKs to `accounts` with `ON DELETE RESTRICT`, `CHECK (amount > 0)`, composite BTREE indexes on `(sender_account_id, created_at)` and `(receiver_account_id, created_at)`, `ENUM` for type and status
    - _Requirements: 2.1–2.8, 3.1–3.10, 4.1–4.11_

- [ ] 5. Sequelize models
  - [-] 5.1 Create `server/db/models/User.ts` — Sequelize User model
    - Declare all columns matching the DDL: `id: BINARY(16)`, `username`, `first_name`, `last_name`, `email`, `password_hash`, `pin_hash`, `kyc_status` ENUM, `reset_token`, `reset_token_expires`, `created_at`, `updated_at`
    - Set `timestamps: true`, `createdAt: 'created_at'`, `updatedAt: 'updated_at'`
    - Add `indexes: [{ fields: ['email'], using: 'BTREE' }]`
    - _Requirements: 2.1–2.8_

  - [-] 5.2 Create `server/db/models/Account.ts` — Sequelize Account model with optimistic lock
    - Declare columns: `id`, `user_id` (FK reference to `users`), `account_number` (unique), `balance: DECIMAL(15,4)` stored as string, `currency: CHAR(3)`, `version_id: INTEGER.UNSIGNED`
    - Add `indexes` for `user_id` BTREE and composite unique `(user_id, currency)`
    - _Requirements: 3.1–3.10_

  - [-] 5.3 Create `server/db/models/Transaction.ts` — append-only Sequelize Transaction model
    - Declare all columns; set `timestamps: false` (only `created_at` set at insert time)
    - Add composite BTREE indexes on `(sender_account_id, created_at)` and `(receiver_account_id, created_at)`
    - Register `Transaction.beforeBulkUpdate` and `Transaction.beforeBulkDestroy` hooks that throw errors to prevent ORM-level bulk mutations
    - _Requirements: 4.1–4.11_

  - [ ]* 5.4 Write unit tests for model hooks and constraints
    - Test that `beforeBulkUpdate` hook throws when triggered
    - Test that `beforeBulkDestroy` hook throws when triggered
    - _Requirements: 4.9_

- [ ] 6. MongoDB connection layer
  - [-] 6.1 Create `server/db/mongodb.ts` — Mongoose connection and `initMongoDB()`
    - Build TLS options from `DB_MONGO_TLS` + `DB_MONGO_TLS_CA`
    - Implement `initMongoDB()`: set a 10-second timeout that logs `[mongo]` and exits with code 1 on breach
    - Call `mongoose.connect()` with `serverSelectionTimeoutMS: 5000` and `socketTimeoutMS: 45000`
    - Register `mongoose.connection.on('error', ...)` handler: log with `[mongo]` prefix, do not crash
    - Register `mongoose.connection.on('disconnected', ...)` handler: log warning, let Mongoose reconnect
    - _Requirements: 5.1–5.6_

- [ ] 7. Mongoose models
  - [-] 7.1 Create `server/db/mongo-models/DeviceSession.ts` — DeviceSession schema with TTL index
    - Define all fields: `userId` (required String), `platform` (enum ios/android/web), `deviceFingerprint`, `fcmToken` (optional), `osVersion`, `refreshToken` (unique, required), `refreshTokenExpiresAt` (Date, required), `ipAddress`, `userAgent`, `lastSeenAt`
    - Set `timestamps: true` and `collection: 'devices_and_sessions'`
    - Create TTL index on `refreshTokenExpiresAt` with `expireAfterSeconds: 0`
    - Create non-unique index on `userId`
    - _Requirements: 6.1–6.11_

  - [~] 7.2 Create `server/db/mongo-models/AuditLog.ts` — append-only AuditLog schema
    - Define all fields: `userId`, `action` (enum of 10 actions), `ipAddress`, `userAgent`, `geoCoordinates` sub-document, `payloadSnapshot` (Mixed with `stripSensitive` setter), `severity` (enum info/warning/critical, default info)
    - Set `timestamps: true` and `collection: 'activity_audit_logs'`
    - Add compound index `{ userId: 1, createdAt: -1 }` and `{ severity: 1, createdAt: -1 }`
    - If `AUDIT_LOG_RETENTION_DAYS` is set, add TTL index on `createdAt`
    - Register `pre` hooks on `findOneAndUpdate`, `updateOne`, `deleteOne`, `deleteMany` that throw to enforce append-only
    - _Requirements: 7.1–7.11_

  - [~] 7.3 Create `server/db/mongo-models/GatewayPayload.ts` — GatewayPayload schema
    - Define all fields: `processor` (enum stripe/razorpay/plaid/other), `transactionId` (required String), `rawPayload` (Mixed), `httpStatusCode`, `eventType`, `processorTransactionId`
    - Set `timestamps: true` and `collection: 'gateway_payloads'`
    - Add indexes on `{ transactionId: 1 }` and `{ processor: 1, createdAt: -1 }`
    - _Requirements: 8.1–8.10_

  - [ ]* 7.4 Write unit tests for AuditLog append-only enforcement
    - Test that `updateOne` pre-hook throws `'AuditLog is append-only'`
    - Test that `deleteOne` and `deleteMany` pre-hooks throw
    - Test that `stripSensitive` removes `password`, `passwordHash`, `pinHash`, `resetToken`, `refreshToken`, `rawPayload` from `payloadSnapshot`
    - _Requirements: 7.8, 15.3_

- [~] 8. Checkpoint — Database layer complete
  - Ensure TypeScript compiles with `pnpm check` (no errors in models or connection files)
  - Ensure all tests written so far pass with `pnpm vitest --run`
  - Ask the user if questions arise before proceeding to services.

- [ ] 9. Audit service
  - [~] 9.1 Create `server/services/audit.service.ts` — `appendAudit()` with in-process retry queue
    - Implement `AppendAuditOptions` interface and `appendAudit()` function
    - On `AuditLog.create()` failure: generate `nanoid()` correlationId, log with `[audit]` prefix, push to `retryQueue`
    - Implement `flushRetryQueue()`: retry up to 3 total attempts per entry; after 3 failures log permanently failed with correlationId
    - Start `setInterval(flushRetryQueue, 5_000).unref()` so the interval doesn't block process exit
    - Strip sensitive fields from `payloadSnapshot` before calling `AuditLog.create()`
    - _Requirements: 9.7, 9.10, 9.13, 15.3_

  - [ ]* 9.2 Write unit tests for audit retry queue
    - Mock `AuditLog.create` to fail on first N calls then succeed
    - Assert entry is enqueued after first failure
    - Assert entry is removed from queue after successful retry
    - Assert permanent failure is logged after 3 attempts
    - _Requirements: 9.13_

- [ ] 10. Transfer service
  - [~] 10.1 Create `server/services/transfer.service.ts` — atomic transfer with optimistic lock retry
    - Implement `TransferInput` and `TransferResult` types
    - Implement `validateInput()`: check all required fields non-null, `senderAccountId !== receiverAccountId`, amount in [0.01, 999_999_999.99] with ≤ 2 decimal places, valid ISO 4217 currency, valid `transactionType`
    - Implement `hexToBuffer()` and `bufferToHex()` UUID helpers
    - Implement `attemptTransfer()`: open SERIALIZABLE Sequelize transaction; debit sender with `WHERE version_id = :v` UPDATE; check `affectedRows === 0` → throw `OptimisticLockError`; credit receiver with same pattern; insert `transactions` row as `'pending'`; commit; post-commit status UPDATE with retry-on-fail pattern; read back new balances
    - Implement `executeTransfer()`: validate input first (return `INVALID_INPUT` without touching DB); retry loop up to 3 times with 50/100/200 ms back-off on `OptimisticLockError`; call `appendAudit` with `transfer_completed` on success; call `appendAudit` with `transfer_failed` on all failure paths
    - _Requirements: 3.7, 3.8, 9.1–9.14_

  - [ ]* 10.2 Write property test for fund conservation
    - **Property 1: Conservation of Funds**
    - **Validates: Requirements 9.3, 9.4, 9.5**
    - Use `fc.float({ min: 0.01, max: 1_000_000 })` for balances and amount; mock Sequelize transaction; assert `senderBalanceBefore + receiverBalanceBefore === senderBalanceAfter + receiverBalanceAfter`
    - Tag: `Feature: hybrid-db-backend, Property 1`

  - [ ]* 10.3 Write property test for version_id monotonic increment
    - **Property 2: version_id Monotonic Increment**
    - **Validates: Requirements 3.7, 9.3, 9.4**
    - Use `fc.array(fc.float({ min: 0.01 }), { minLength: 1, maxLength: 20 })` for a sequence of transfer amounts; apply each to a mock account; assert `version_id_after === version_id_before + N` and version never decreases
    - Tag: `Feature: hybrid-db-backend, Property 2`

  - [ ]* 10.4 Write property test for transfer input validation completeness
    - **Property 3: Transfer Input Validation Completeness**
    - **Validates: Requirements 9.1, 9.9, 10.2, 10.3, 10.4, 10.5**
    - Generate invalid inputs using `fc.record`: null fields, out-of-range amounts, amounts with >2 decimal places, identical sender/receiver IDs; assert `validateInput()` returns a non-null error string for every generated case and no DB call is made
    - Tag: `Feature: hybrid-db-backend, Property 3`

  - [ ]* 10.5 Write property test for insufficient funds leaving state unchanged
    - **Property 4: Insufficient Funds Leaves State Unchanged**
    - **Validates: Requirements 9.8**
    - Use `fc.float` to generate balance B and amount A where `A > B`; mock the UPDATE to return `affectedRows = 0` due to insufficient balance check; assert sender balance, receiver balance, and `transactions` row count are unchanged after the call
    - Tag: `Feature: hybrid-db-backend, Property 4`

- [ ] 11. Transfer API route
  - [~] 11.1 Create `server/routes/transactions.ts` — `POST /api/transactions/transfer`
    - Apply `express.json({ limit: '1mb' })` middleware
    - Validate request body fields: `senderAccountId`, `receiverAccountId`, `amount`, `currency`, `transactionType` — return HTTP 400 listing missing fields if any absent
    - Validate `amount` is positive with ≤ 4 decimal places → HTTP 400 `INVALID_AMOUNT` if not
    - Validate `currency` is 3-character uppercase → HTTP 400 `INVALID_CURRENCY` if not
    - Validate `transactionType` is one of `internal`, `wire`, `billpay` → HTTP 400 `INVALID_TRANSACTION_TYPE` if not
    - Call `executeTransfer()`; map result codes to HTTP responses: 200 on success, 422 on `INSUFFICIENT_FUNDS`, 500 on `TRANSFER_FAILED`/`LOCK_CONFLICT_MAX_RETRIES`
    - Record `ipAddress` from `req.ip` and `userAgent` from `req.headers['user-agent']` in every transfer call
    - _Requirements: 10.1–10.9_

  - [ ]* 11.2 Write unit tests for transfer route validation
    - Test HTTP 400 for each missing required field
    - Test HTTP 400 with `INVALID_AMOUNT` for invalid amount formats
    - Test HTTP 400 with `INVALID_CURRENCY` for non-3-char currency
    - Test HTTP 400 with `INVALID_TRANSACTION_TYPE` for invalid type
    - Test HTTP 422 for `INSUFFICIENT_FUNDS` response from service
    - Test HTTP 500 with correlationId for `TRANSFER_FAILED`
    - _Requirements: 10.2–10.8_

- [ ] 12. Session management routes
  - [~] 12.1 Create `server/routes/sessions.ts` — DeviceSession CRUD endpoints
    - `POST /api/auth/session`: generate a cryptographically random raw refresh token; hash it with SHA-256; create `DeviceSession` document; return raw token to caller (never store raw token)
    - `DELETE /api/auth/session/:sessionId`: find and delete the document; if not found return HTTP 404; append `AuditLog` with `action = 'session_revoked'`
    - `DELETE /api/auth/sessions`: delete all DeviceSession documents for `userId`; append single `AuditLog` with `action = 'session_revoked'` and count in `payloadSnapshot`
    - `PATCH /api/auth/session/:sessionId/heartbeat`: update `lastSeenAt` to `new Date()`; respond within 50 ms; return HTTP 404 if not found
    - Apply `express.json({ limit: '1mb' })` middleware
    - _Requirements: 11.1–11.6_

  - [ ]* 12.2 Write property test for refresh token hashing
    - **Property 7: Refresh Token Hashing Round Trip**
    - **Validates: Requirements 11.2**
    - Use `fc.string({ minLength: 1 })` to generate raw tokens; assert `SHA-256(rawToken)` is stored in `refreshToken` field and `storedValue !== rawToken`
    - Tag: `Feature: hybrid-db-backend, Property 7`

  - [ ]* 12.3 Write unit tests for session revocation endpoints
    - Test HTTP 404 when `sessionId` does not exist
    - Test that DELETE `/sessions` appends a single AuditLog with correct count
    - _Requirements: 11.3–11.5_

- [ ] 13. Health check route
  - [~] 13.1 Create `server/routes/health.ts` — `GET /api/health`
    - Execute `sequelize.query('SELECT 1')` with 2-second timeout for MySQL ping
    - Execute `mongoose.connection.db.admin().ping()` with 2-second timeout for MongoDB ping
    - Return HTTP 200 with `{ status: 'ok', mysql: 'up', mongo: 'up' }` when both pass
    - Return HTTP 503 with correct degraded/down body for any combination of failures (per requirements 14.3–14.5)
    - Always respond within 3 seconds under all conditions
    - _Requirements: 14.1–14.6_

  - [ ]* 13.2 Write unit tests for health check degraded states
    - Mock `sequelize.query` to throw; assert HTTP 503 with `{ status: 'degraded', mysql: 'down', mongo: 'up' }`
    - Mock `mongoose.connection.db.admin().ping` to throw; assert HTTP 503 with `{ status: 'degraded', mysql: 'up', mongo: 'down' }`
    - Mock both to throw; assert HTTP 503 with `{ status: 'down', mysql: 'down', mongo: 'down' }`
    - _Requirements: 14.3–14.5_

- [~] 14. Checkpoint — Core services and routes complete
  - Ensure TypeScript compiles with `pnpm check` (no errors across all new files)
  - Ensure all vitest tests pass with `pnpm vitest --run`
  - Ask the user if questions arise before proceeding to migration and algorithm tasks.

- [ ] 15. SQLite-to-MySQL migration script
  - [~] 15.1 Create `server/scripts/migrate-sqlite-to-mysql.ts` — one-shot migration
    - Open the SQLite database at `data/banking.db` using `better-sqlite3`
    - Read all rows from the `users` table
    - For each row: derive a deterministic `BINARY(16)` UUID using UUID v5 with a fixed namespace constant and the original SQLite `id` string as the name
    - INSERT each user into MySQL `users` preserving `username`, `email`, `password_hash`, `first_name`, `last_name`; leave `pin_hash` as empty string and `kyc_status` as `'pending'`
    - INSERT a corresponding `accounts` row for each user using the existing `account_number` with `currency = 'USD'` and `balance = 0.0000`
    - On duplicate `email` or `username` (Sequelize `UniqueConstraintError`): log the conflict and skip without aborting
    - At completion: print summary: total rows processed, inserted, skipped, failed
    - _Requirements: 12.1–12.7_

  - [ ]* 15.2 Write property test for migration UUID determinism
    - **Property 8: Migration UUID Determinism**
    - **Validates: Requirements 12.3**
    - Use `fc.string({ minLength: 1 })` to generate arbitrary SQLite id strings; run the `deriveUUID()` helper twice with the same input; assert both calls return the same `Buffer` value
    - Tag: `Feature: hybrid-db-backend, Property 8`

  - [ ]* 15.3 Write unit tests for migration conflict handling
    - Simulate a `UniqueConstraintError` on a single row; assert migration continues and reports 1 skipped
    - Assert summary output matches actual counts
    - _Requirements: 12.5, 12.6_

- [ ] 16. Update server/index.ts to initialize both databases and mount all routes
  - [~] 16.1 Update `server/index.ts` to add parallel DB initialization and new route mounts
    - Import `initMySQL` from `./db/mysql.js` and `initMongoDB` from `./db/mongodb.js`
    - Import `validateEnv` from `./config/env.js` and call it before any DB initialization
    - Call `await Promise.all([initMySQL(), initMongoDB()])` during startup
    - Keep the existing SQLite import (`./db/database.js`) for the migration window
    - Mount `transactionsRouter` at `/api/transactions`
    - Mount `sessionsRouter` at `/api/auth` (so session routes become `/api/auth/session*`)
    - Mount `healthRouter` at `/api/health`
    - Apply `express.json({ limit: '1mb' })` globally before all routes
    - _Requirements: 1.1–1.8, 5.1–5.6, 13.1–13.4, 15.5_

- [ ] 17. Algorithm Task 1 — High-Performance Transaction Search & Filter
  - [~] 17.1 Create `server/services/transaction-search.service.ts` — cursor-based pagination engine
    - Define `TransactionSearchFilters` interface: `{ accountId: string; dateFrom?: Date; dateTo?: Date; transactionType?: 'internal' | 'wire' | 'billpay'; minAmount?: number; maxAmount?: number; merchantText?: string; cursor?: string; pageSize?: number }`
    - Define `TransactionSearchResult` interface: `{ data: Transaction[]; nextCursor: string | null; hasMore: boolean }`
    - Implement `encodeCursor(createdAt: Date, id: Buffer): string` → `Buffer.from(createdAt.toISOString() + '|' + id.toString('hex')).toString('base64')`
    - Implement `decodeCursor(cursor: string): { ts: string; id: string }` → parse base64, split on `|`
    - Implement core `searchTransactions(filters)` function:
      - Build a Sequelize `WHERE` clause combining `(sender_account_id = :accountId OR receiver_account_id = :accountId)`
      - If cursor present: add `AND (created_at < :cursor_ts OR (created_at = :cursor_ts AND id < :cursor_id))`
      - Apply optional filters: `created_at >= :dateFrom`, `created_at <= :dateTo`, `transaction_type = :type`, `amount >= :minAmount`, `amount <= :maxAmount`, `reference_id LIKE :merchantText`
      - Fetch `pageSize + 1` rows using `sequelize.query()` with a raw parameterized SQL leveraging the `(sender_account_id, created_at)` or `(receiver_account_id, created_at)` composite B-Tree index — ORDER BY `created_at DESC, id DESC`
      - If result length > pageSize: set `hasMore = true`, encode next cursor from last row in `data`, trim result to pageSize; otherwise `hasMore = false`, `nextCursor = null`
      - Time complexity: O(log N) per page via B-Tree index seek; Space complexity: O(K) where K = pageSize
    - _Requirements: 4.10, 3.10 (index reuse)_

  - [~] 17.2 Create `server/routes/transactions.ts` addition — `GET /api/transactions/search`
    - Add `GET /api/transactions/search` handler to the existing transactions router
    - Parse and validate query parameters: `accountId` (required), `dateFrom`, `dateTo`, `transactionType`, `minAmount`, `maxAmount`, `merchantText`, `cursor`, `pageSize` (default 20, max 100)
    - Return HTTP 400 if `accountId` is missing
    - Call `searchTransactions()` and return `{ data, nextCursor, hasMore }` as JSON
    - _Requirements: 4.10_

  - [ ]* 17.3 Write unit tests for transaction search pagination
    - Test cursor encoding/decoding round-trip produces original values
    - Test `hasMore = false` when result count ≤ pageSize
    - Test `hasMore = true` and correct `nextCursor` when result count > pageSize
    - Test that applying a cursor excludes rows at-or-before the cursor position
    - _Requirements: 4.10_

- [ ] 18. Algorithm Task 2 — Daily Ledger Reconciliation & Discrepancy Detection (Python)
  - [~] 18.1 Create `server/scripts/reconcile_ledger.py` — balance verification and hash-chain tamper detection
    - Install dependencies comment at top of file: `# pip install pandas mysql-connector-python`
    - Connect to MySQL using `mysql-connector-python` with credentials from environment variables (`DB_MYSQL_HOST`, `DB_MYSQL_PORT`, `DB_MYSQL_USER`, `DB_MYSQL_PASSWORD`, `DB_MYSQL_NAME`)
    - Accept `--date YYYY-MM-DD` CLI argument for the reconciliation date
    - **Part A — Balance Verification** (O(N) time, O(N) space for DataFrame):
      - Query: all `transactions` rows for the given date grouped by account; load into a pandas DataFrame
      - For each `account_id`: compute `starting_balance + sum(credits) - sum(debits)`; compare to `ending_balance` from `accounts` table
      - Collect all mismatches into `discrepancies: list[dict]`
    - **Part B — Hash-Chain Tamper Detection** (O(N) time, O(1) rolling state + O(N) DataFrame):
      - Query: all `transactions` for the date ordered by `created_at ASC, id ASC`; load into DataFrame
      - Walk the chain: `chain_hash[i] = hashlib.sha256((chain_hash[i-1] + str(tx_id) + str(amount) + str(timestamp)).encode()).hexdigest()`
      - Compare each computed hash to the stored `chain_hash` column value (if column absent, skip Part B with warning)
      - On first mismatch: append `{ tampered_at_index: i, transaction_id: tx_id }` to `tampered_transactions` and stop walking (fail-fast)
    - Output a JSON report to stdout: `{ date, accounts_checked, discrepancies: [], tampered_transactions: [] }`
    - Exit code 0 if no discrepancies or tampering detected; exit code 2 if discrepancies/tampering found
    - _Requirements: 4.8 (immutability), 4.9 (no delete/update via ORM)_

  - [ ]* 18.2 Write unit tests for reconciliation script (Python unittest or pytest)
    - Create `server/scripts/tests/test_reconcile_ledger.py`
    - Test Part A: mock DataFrame with known credit/debit values; assert discrepancy detected when balances don't match
    - Test Part A: assert no discrepancy when `starting + credits - debits == ending`
    - Test Part B: construct a valid chain and assert no tampering detected
    - Test Part B: mutate one row's `chain_hash` in the DataFrame and assert `tampered_at_index` is reported correctly
    - _Requirements: 4.8, 4.9_

- [ ] 19. Algorithm Task 3 — Real-Time Currency Exchange & Multi-Currency FX Routing
  - [~] 19.1 Create `server/services/fx-router.service.ts` — Bellman-Ford FX path finder
    - Define `ExchangeEdge` interface: `{ from: string; to: string; rate: number; feePercent: number }`
    - Define `FxRouteResult` type:
      ```typescript
      | { found: true; path: string[]; totalRate: number; totalFeePercent: number; hops: number }
      | { found: false; reason: 'NO_PATH' | 'ARBITRAGE_DETECTED' | 'MAX_HOPS_EXCEEDED' | 'SAME_CURRENCY' }
      ```
    - Implement `buildGraph(edges: ExchangeEdge[]): Map<string, number>` — build adjacency with weights = `-Math.log(rate * (1 - feePercent / 100))`; this converts max-product into min-sum for Bellman-Ford
    - Implement `findBestRoute(from: string, to: string, edges: ExchangeEdge[]): FxRouteResult`:
      - Return `{ found: false, reason: 'SAME_CURRENCY' }` if `from === to`
      - Initialize distance array: `dist[from] = 0`, all others `Infinity`; predecessor array for path reconstruction
      - Run **V−1 relaxations** (V = number of distinct currency nodes): for each edge `(u, v, w)` if `dist[u] + w < dist[v]` update dist and predecessor
      - Run **V-th relaxation** (negative cycle / arbitrage detection): if any edge still relaxes, return `{ found: false, reason: 'ARBITRAGE_DETECTED' }`
      - Reconstruct path by walking predecessor array from `to` back to `from`
      - If `path.length - 1 > 3` (more than 3 currency hops), return `{ found: false, reason: 'MAX_HOPS_EXCEEDED' }`
      - If `dist[to]` is still `Infinity`, return `{ found: false, reason: 'NO_PATH' }`
      - Compute `totalRate` by exponentiating back: `Math.exp(-dist[to])`; compute `totalFeePercent` as aggregate
      - Return `{ found: true, path, totalRate, totalFeePercent, hops: path.length - 1 }`
      - Time complexity: O(V × E); Space complexity: O(V)
    - _Requirements: (FX feature extension)_

  - [~] 19.2 Create `server/routes/fx.ts` — `POST /api/fx/best-route`
    - Accept JSON body: `{ fromCurrency: string; toCurrency: string; amount: number }`
    - Validate: `fromCurrency` and `toCurrency` must be 3-character uppercase strings; `amount` must be positive
    - Load current exchange rates from a configurable static JSON file (`server/data/exchange-rates.json`) or from `process.env.FX_RATES_JSON` if set
    - Call `findBestRoute()` with the loaded edges
    - On success: return HTTP 200 with `{ path, totalRate, effectiveAmount: amount * totalRate, totalFeePercent, hops }`
    - On `ARBITRAGE_DETECTED`: return HTTP 422 with error message
    - On `NO_PATH` or `MAX_HOPS_EXCEEDED`: return HTTP 404 with reason
    - On `SAME_CURRENCY`: return HTTP 400
    - Mount this router in `server/index.ts` at `/api/fx`
    - _Requirements: (FX feature extension)_

  - [~] 19.3 Create `server/data/exchange-rates.json` — seed exchange rate graph
    - Include at minimum 6 currencies: USD, EUR, INR, GBP, JPY, AED
    - Define bidirectional edges (e.g., USD→EUR and EUR→USD) with realistic rates and a 0.5% fee
    - Include one deliberately indirect path (e.g., USD→INR requires USD→GBP→INR or USD→EUR→INR) to exercise multi-hop routing
    - _Requirements: (FX feature extension)_

  - [ ]* 19.4 Write unit tests for Bellman-Ford FX router
    - Test direct path (USD→EUR): assert `found: true`, `hops = 1`
    - Test 2-hop path: assert correct intermediate currency in `path`
    - Test `SAME_CURRENCY` (USD→USD): assert `found: false, reason: 'SAME_CURRENCY'`
    - Test `NO_PATH`: remove all edges from USD to a currency; assert `found: false, reason: 'NO_PATH'`
    - Test `MAX_HOPS_EXCEEDED`: construct a valid 4-hop path; assert `found: false, reason: 'MAX_HOPS_EXCEEDED'`
    - Test `ARBITRAGE_DETECTED`: manually insert a negative cycle (USD→EUR→GBP→USD with product > 1.0 after fees); assert detection
    - _Requirements: (FX feature extension)_

  - [ ]* 19.5 Write property test for negative-log weight transformation
    - For any set of edges with positive rates and fee percentages in [0, 1), assert that `Math.exp(-weight)` recovers the original `rate * (1 - feePercent / 100)` within floating-point tolerance (1e-10)
    - Use `fc.record({ rate: fc.float({ min: 0.001, max: 1000 }), feePercent: fc.float({ min: 0, max: 0.99 }) })`
    - _Requirements: (FX feature extension)_

- [~] 20. Checkpoint — Algorithm implementations complete
  - Ensure TypeScript compiles with `pnpm check` (no errors in algorithm service files)
  - Ensure all vitest unit and property tests pass with `pnpm vitest --run`
  - Verify `server/scripts/reconcile_ledger.py` runs with `python server/scripts/reconcile_ledger.py --date 2024-01-01 --dry-run` (or equivalent) without syntax errors
  - Ask the user if questions arise before proceeding to final wiring.

- [ ] 21. Security hardening
  - [~] 21.1 Apply security hardening measures across all new database and route code
    - Audit all Sequelize queries in `transfer.service.ts` and `transaction-search.service.ts`: confirm exclusively parameterized replacements — no raw string interpolation in SQL
    - Add `sanitizeFilter: true` to all Mongoose query calls in session and audit routes
    - Verify `express.json({ limit: '1mb' })` is applied to `POST /api/transactions/transfer` and all `POST /api/auth/session*` endpoints
    - Add serialization interceptor: create `server/middleware/strip-sensitive.ts` that removes `password`, `passwordHash`, `pinHash`, `resetToken`, `refreshToken`, `rawPayload` from all API response objects before `res.json()` is called; apply as middleware to the transactions and sessions routers
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5_

  - [ ]* 21.2 Write unit tests for serialization interceptor
    - Test that `stripSensitiveFields()` removes all 6 restricted field names from a nested response object
    - Test that non-sensitive fields are preserved intact
    - _Requirements: 15.3_

- [ ] 22. Property-based tests — duplicate user rejection
  - [ ]* 22.1 Write property test for duplicate user rejection
    - **Property 6: Duplicate User Rejection**
    - **Validates: Requirements 2.2, 2.3, 2.7**
    - Use `fc.record({ email: fc.emailAddress(), username: fc.string({ minLength: 4, maxLength: 30 }) })` to generate user records; seed one user; attempt to INSERT a second with same email; assert HTTP 409 response identifies `email` as conflicting field and row count is unchanged; repeat for `username`
    - Tag: `Feature: hybrid-db-backend, Property 6`

- [ ] 23. Final integration wiring and smoke test
  - [~] 23.1 Wire all routers into `server/index.ts` and verify complete route surface
    - Mount `fxRouter` at `/api/fx`
    - Confirm all 7 route groups are mounted: `/api/auth` (existing + sessions), `/api/transactions`, `/api/health`, `/api/fx`
    - Confirm `validateEnv()` is the first call in `startServer()`
    - Confirm `initMySQL()` and `initMongoDB()` run in parallel via `Promise.all`
    - _Requirements: 1.1, 5.1, 13.4_

  - [~] 23.2 Write integration-style unit tests for server startup sequence
    - Mock `initMySQL` and `initMongoDB` to resolve; assert both are called during startup
    - Mock `validateEnv` to throw; assert server does not proceed to DB initialization
    - _Requirements: 13.4_

- [~] 24. Final checkpoint — All tests pass
  - Run `pnpm check` — zero TypeScript errors
  - Run `pnpm vitest --run` — all unit and property tests pass
  - Confirm `.env.example` is up to date with all variables from design.md environment variable table
  - Ask the user if questions arise.

---

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP delivery
- All property tests use [fast-check](https://github.com/dubzzz/fast-check) and are tagged `Feature: hybrid-db-backend, Property N`
- The Python reconciliation script (Task 18) operates independently of the Node.js server; it reads directly from MySQL
- The `chain_hash` column referenced in Task 18 Part B does not exist in the current schema — Task 18.1 includes a graceful skip with warning when the column is absent
- The SQLite layer (`server/db/database.ts`) is NOT removed during this task list; removal happens in a follow-up PR after the migration is verified
- `decimal.js` is used in the transfer service to avoid floating-point precision errors on monetary values
- All `BINARY(16)` UUIDs are stored as Buffers in Sequelize and must be hex-encoded/decoded at service boundaries
- The FX router (Task 19) uses a static JSON seed file; in production this would be replaced with a live rate feed

---

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3"] },
    { "id": 1, "tasks": ["2.1", "4.1"] },
    { "id": 2, "tasks": ["2.2", "3.1"] },
    { "id": 3, "tasks": ["3.2", "5.1", "5.2", "5.3", "6.1"] },
    { "id": 4, "tasks": ["5.4", "7.1", "7.2", "7.3"] },
    { "id": 5, "tasks": ["7.4", "9.1", "19.3"] },
    { "id": 6, "tasks": ["9.2", "10.1"] },
    { "id": 7, "tasks": ["10.2", "10.3", "10.4", "10.5", "11.1", "17.1"] },
    { "id": 8, "tasks": ["11.2", "12.1", "17.2", "18.1"] },
    { "id": 9, "tasks": ["12.2", "12.3", "13.1", "15.1", "17.3", "18.2", "19.1"] },
    { "id": 10, "tasks": ["13.2", "15.2", "15.3", "19.2", "21.1"] },
    { "id": 11, "tasks": ["16.1", "19.4", "19.5", "21.2"] },
    { "id": 12, "tasks": ["22.1", "23.1"] },
    { "id": 13, "tasks": ["23.2"] }
  ]
}
```
