# Requirements Document

## Introduction

This document defines the requirements for a hybrid database backend for the Cross-Platform Transaction Application for Banking & FinTech. The system replaces and extends the existing SQLite authentication layer with a production-grade dual-database architecture:

- **MySQL** handles all high-integrity relational data requiring strict ACID guarantees: user identity, multi-currency accounts, and the immutable transaction ledger.
- **MongoDB** handles high-throughput, semi-structured operational data: cross-platform device sessions, append-only security audit logs, and raw third-party payment gateway payloads.

The backend is implemented in Node.js/TypeScript (ESM) and integrates into the existing Express.js server at `server/index.ts`, coexisting with the current auth routes during a migration period.

---

## Glossary

- **System**: The Express.js backend server (`server/index.ts`) and all modules it imports.
- **MySQL_Layer**: The Sequelize ORM connection pool and model layer targeting a MySQL 8+ database.
- **MongoDB_Layer**: The Mongoose ODM connection and schema layer targeting a MongoDB 6+ replica set or standalone instance.
- **User**: A registered account holder with a verified identity in the `users` table.
- **Account**: A financial account row in the `accounts` table holding a balance in a specific currency, owned by a User.
- **Transaction**: An immutable ledger entry in the `transactions` table recording a fund movement between two Accounts.
- **Transfer**: The atomic cross-database operation that debits one Account, credits another Account in MySQL, and appends an audit record in MongoDB.
- **DeviceSession**: A document in the `devices_and_sessions` MongoDB collection representing one authenticated client session on a specific physical device.
- **AuditLog**: An append-only document in the `activity_audit_logs` MongoDB collection capturing a security-relevant event.
- **GatewayPayload**: A document in the `gateway_payloads` MongoDB collection storing the raw JSON response from an external payment processor.
- **Optimistic Lock**: A concurrency mechanism using the `version_id` integer column on `accounts` to detect and reject conflicting concurrent balance mutations.
- **KYC**: Know Your Customer â€” the regulatory verification status of a User.
- **ORM**: Object-Relational Mapper (Sequelize).
- **ODM**: Object-Document Mapper (Mongoose).
- **FCM**: Firebase Cloud Messaging â€” push notification service.
- **TTL**: Time-to-live â€” automatic document expiration enforced by a MongoDB index.
- **DECIMAL(15,4)**: MySQL fixed-precision numeric type storing up to 15 digits with 4 decimal places, used for all monetary values.
- **UUID**: Universally Unique Identifier â€” stored as `BINARY(16)` in MySQL for space efficiency.

---

## Requirements

### Requirement 1: MySQL Connection and Schema Initialization

**User Story:** As a backend engineer, I want Sequelize to connect to MySQL and enforce the complete relational schema on startup, so that the database is always consistent with the application model.

#### Acceptance Criteria

1. THE MySQL_Layer SHALL establish a connection pool to MySQL using credentials supplied exclusively via environment variables (`DB_MYSQL_HOST`, `DB_MYSQL_PORT`, `DB_MYSQL_USER`, `DB_MYSQL_PASSWORD`, `DB_MYSQL_NAME`).
2. WHEN the application starts and the `NODE_ENV` environment variable is set to `"production"`, THE MySQL_Layer SHALL execute `sync({ alter: false })` to apply the schema without modifying existing columns or data.
3. WHEN the application starts and the `NODE_ENV` environment variable is not set to `"production"`, THE MySQL_Layer SHALL execute `sync({ alter: true })` to apply schema changes without dropping data.
4. IF the MySQL connection cannot be established within 10 seconds of startup, THEN THE System SHALL log the error with the message prefix `[mysql]` and terminate the process with exit code 1.
5. IF the environment variable `DB_MYSQL_SSL` is set to `"true"`, THEN THE MySQL_Layer SHALL enable `dialectOptions.ssl` using the CA certificate file located at the path specified by `DB_MYSQL_SSL_CA`.
6. IF the environment variable `DB_MYSQL_SSL` is set to `"true"` and the path specified by `DB_MYSQL_SSL_CA` does not resolve to a readable file, THEN THE System SHALL log an error with the message prefix `[mysql]` and terminate the process with exit code 1.
7. THE MySQL_Layer SHALL set the connection pool `max` to the integer value of `DB_MYSQL_POOL_MAX` when that variable is present and contains a positive integer value in the range 1–100, defaulting to 10 if the variable is absent, non-integer, zero, or negative.
8. THE MySQL_Layer SHALL set `timezone: "Z"` so all datetime values are stored and retrieved in UTC.

---

### Requirement 2: MySQL `users` Table

**User Story:** As a backend engineer, I want a `users` table that stores identity, credentials, and KYC state with strict uniqueness and integrity constraints, so that no two users can share an email or username and all required fields are always present.

#### Acceptance Criteria

1. THE MySQL_Layer SHALL define a `users` table with primary key column `id` of type `BINARY(16)` storing a UUID value.
2. THE MySQL_Layer SHALL enforce a `UNIQUE` constraint on the `email` column with collation `utf8mb4_unicode_ci`.
3. THE MySQL_Layer SHALL enforce a `UNIQUE` constraint on the `username` column with collation `utf8mb4_unicode_ci`.
4. THE MySQL_Layer SHALL store `password_hash` and `pin_hash` as `VARCHAR(255) NOT NULL` columns.
5. THE MySQL_Layer SHALL store `kyc_status` as an `ENUM('pending', 'verified', 'rejected') NOT NULL DEFAULT 'pending'` column.
6. THE MySQL_Layer SHALL store `created_at` and `updated_at` as `DATETIME NOT NULL` columns managed automatically by Sequelize timestamps.
7. IF an INSERT to `users` violates the `email` or `username` unique constraint, THEN THE System SHALL return HTTP 409 with a structured JSON error body identifying the conflicting field.
8. THE MySQL_Layer SHALL index the `email` column with a `BTREE` index to support lookup by email within 5 ms for tables up to 1 million rows.

---

### Requirement 3: MySQL `accounts` Table

**User Story:** As a backend engineer, I want an `accounts` table with precise decimal balances, multi-currency support, and an Optimistic Lock version column, so that concurrent balance mutations are detected and rejected without table-level locking.

#### Acceptance Criteria

1. THE MySQL_Layer SHALL define an `accounts` table with primary key `id` of type `BINARY(16)`.
2. THE MySQL_Layer SHALL define a `user_id BINARY(16) NOT NULL` foreign key referencing `users(id)` with `ON DELETE RESTRICT ON UPDATE CASCADE`.
3. THE MySQL_Layer SHALL store `balance` as `DECIMAL(15,4) NOT NULL DEFAULT 0.0000` with a `CHECK (balance >= 0)` constraint.
4. THE MySQL_Layer SHALL store `currency` as `CHAR(3) NOT NULL` (ISO 4217 code, e.g., `"USD"`, `"INR"`, `"EUR"`).
5. THE MySQL_Layer SHALL store `version_id` as `INT UNSIGNED NOT NULL DEFAULT 0`.
6. THE MySQL_Layer SHALL enforce a `UNIQUE` constraint on the composite `(user_id, currency)` pair so each user has at most one account per currency.
7. WHEN a balance UPDATE is executed, THE MySQL_Layer SHALL include a `WHERE version_id = :currentVersion` predicate and increment `version_id` by 1 in the same statement.
8. IF a balance UPDATE affects 0 rows due to a version mismatch, THEN THE System SHALL raise an `OptimisticLockError` and retry the Transfer operation up to 3 times with exponential back-off starting at 50 ms.
9. THE MySQL_Layer SHALL store `account_number` as `VARCHAR(30) NOT NULL UNIQUE` for human-readable references.
10. THE MySQL_Layer SHALL index `user_id` with a `BTREE` index to support account lookup by owner within 5 ms for tables up to 10 million rows.

---

### Requirement 4: MySQL `transactions` Table

**User Story:** As a backend engineer, I want an append-only `transactions` ledger table so that every fund movement is permanently recorded and auditable without modification or deletion.

#### Acceptance Criteria

1. THE MySQL_Layer SHALL define a `transactions` table with primary key `id` of type `BINARY(16)`.
2. THE MySQL_Layer SHALL store `sender_account_id BINARY(16) NOT NULL` as a foreign key referencing `accounts(id)` with `ON DELETE RESTRICT`.
3. THE MySQL_Layer SHALL store `receiver_account_id BINARY(16) NOT NULL` as a foreign key referencing `accounts(id)` with `ON DELETE RESTRICT`.
4. THE MySQL_Layer SHALL store `amount` as `DECIMAL(15,4) NOT NULL` with a `CHECK (amount > 0)` constraint.
5. THE MySQL_Layer SHALL store `currency` as `CHAR(3) NOT NULL`.
6. THE MySQL_Layer SHALL store `transaction_type` as `ENUM('internal', 'wire', 'billpay') NOT NULL`.
7. THE MySQL_Layer SHALL store `status` as `ENUM('pending', 'completed', 'failed', 'reversed') NOT NULL DEFAULT 'pending'`.
8. THE MySQL_Layer SHALL store `created_at` as `DATETIME NOT NULL` set once at insert time and never updated.
9. THE MySQL_Layer SHALL NOT expose an UPDATE or DELETE operation on the `transactions` table through any ORM model method; status transitions SHALL be the only permitted mutation.
10. THE MySQL_Layer SHALL define composite indexes on `(sender_account_id, created_at)` and `(receiver_account_id, created_at)` to support transaction history queries within 20 ms for tables up to 100 million rows.
11. THE MySQL_Layer SHALL store an optional `reference_id VARCHAR(128)` column for external payment processor correlation identifiers.

---

### Requirement 5: MongoDB Connection and Initialization

**User Story:** As a backend engineer, I want Mongoose to connect to MongoDB using environment variables and reconnect automatically, so that the application survives transient network interruptions without manual intervention.

#### Acceptance Criteria

1. THE MongoDB_Layer SHALL establish a connection to MongoDB using the URI supplied via the `DB_MONGO_URI` environment variable.
2. WHEN the System starts, THE MongoDB_Layer SHALL call `mongoose.connect()` with `serverSelectionTimeoutMS: 5000` and `socketTimeoutMS: 45000`.
3. IF the MongoDB connection is not established within 10 seconds of startup, THEN THE System SHALL log the error with prefix `[mongo]` and terminate the process with exit code 1.
4. THE MongoDB_Layer SHALL register a `mongoose.connection.on('error', ...)` handler that logs connection errors with the prefix `[mongo]` without crashing the process after initial connection.
5. THE MongoDB_Layer SHALL register a `mongoose.connection.on('disconnected', ...)` handler that logs a warning and allows Mongoose's built-in reconnect logic to restore the connection.
6. WHERE the environment variable `DB_MONGO_TLS` is set to `"true"`, THE MongoDB_Layer SHALL pass `tls: true` and `tlsCAFile` pointing to the path in `DB_MONGO_TLS_CA` to the Mongoose connect options.

---

### Requirement 6: MongoDB `devices_and_sessions` Collection

**User Story:** As a backend engineer, I want a `devices_and_sessions` collection to track authenticated sessions across iOS, Android, and Web platforms with device fingerprints and push tokens, so that the security team can detect anomalous multi-device logins and revoke compromised sessions.

#### Acceptance Criteria

1. THE MongoDB_Layer SHALL define a `DeviceSession` Mongoose schema with the required field `userId` of type `String` referencing a MySQL user `id` (hex-encoded UUID).
2. THE MongoDB_Layer SHALL store `platform` as an enum field restricted to `['ios', 'android', 'web']` with `required: true`.
3. THE MongoDB_Layer SHALL store `deviceFingerprint` as a `String` field representing a hash of device hardware and OS attributes.
4. THE MongoDB_Layer SHALL store `fcmToken` as an optional `String` field for Firebase Cloud Messaging push delivery.
5. THE MongoDB_Layer SHALL store `osVersion` as a `String` field (e.g., `"iOS 17.4"`, `"Android 14"`, `"Windows 11"`).
6. THE MongoDB_Layer SHALL store `refreshToken` as a hashed `String` (SHA-256 of the raw token) and `refreshTokenExpiresAt` as a `Date` field.
7. THE MongoDB_Layer SHALL store `ipAddress` as a `String` field and `userAgent` as a `String` field recorded at session creation.
8. THE MongoDB_Layer SHALL create a TTL index on `refreshTokenExpiresAt` so expired session documents are automatically deleted by MongoDB within 60 seconds of expiry.
9. THE MongoDB_Layer SHALL create a non-unique index on `userId` to support lookup of all sessions for a given user within 10 ms for collections up to 50 million documents.
10. WHEN a new DeviceSession document is created, THE MongoDB_Layer SHALL set `createdAt` and `lastSeenAt` timestamps via Mongoose `timestamps: true`.
11. THE MongoDB_Layer SHALL create a unique index on `refreshToken` to prevent duplicate active tokens.

---

### Requirement 7: MongoDB `activity_audit_logs` Collection

**User Story:** As a compliance officer, I want every security-relevant action to be appended as an immutable audit log document including geo-coordinates, IP address, and a payload snapshot, so that the full history of account activity is available for regulatory review and forensic investigation.

#### Acceptance Criteria

1. THE MongoDB_Layer SHALL define an `AuditLog` Mongoose schema with `userId` as a required `String` field.
2. THE MongoDB_Layer SHALL store `action` as a required `String` enum including at minimum: `'login'`, `'logout'`, `'transfer_initiated'`, `'transfer_completed'`, `'transfer_failed'`, `'password_changed'`, `'pin_changed'`, `'kyc_updated'`, `'device_registered'`, `'session_revoked'`.
3. THE MongoDB_Layer SHALL store `ipAddress` as a `String` and `userAgent` as a `String`.
4. THE MongoDB_Layer SHALL store `geoCoordinates` as an optional sub-document with `latitude: Number` and `longitude: Number` fields.
5. THE MongoDB_Layer SHALL store `payloadSnapshot` as a `Mixed` (schemaless) field to capture relevant request context, with sensitive fields (passwords, PINs, tokens) excluded before storage.
6. THE MongoDB_Layer SHALL store `severity` as an enum restricted to `['info', 'warning', 'critical']` with a default of `'info'`.
7. THE MongoDB_Layer SHALL set `timestamps: true` on the schema so `createdAt` is managed automatically.
8. THE MongoDB_Layer SHALL NOT expose an update or delete operation on `AuditLog` documents through any application code path; the collection is append-only.
9. THE MongoDB_Layer SHALL create an index on `{ userId: 1, createdAt: -1 }` to support paginated audit history queries within 20 ms for collections up to 500 million documents.
10. THE MongoDB_Layer SHALL create an index on `{ severity: 1, createdAt: -1 }` to support security dashboard queries filtering by severity.
11. WHERE a TTL retention policy is configured via the `AUDIT_LOG_RETENTION_DAYS` environment variable, THE MongoDB_Layer SHALL create a TTL index on `createdAt` using that value multiplied by 86400 seconds.

---

### Requirement 8: MongoDB `gateway_payloads` Collection

**User Story:** As a payment engineer, I want all raw JSON responses from external payment processors (Stripe, Razorpay, Plaid) to be stored verbatim in MongoDB, so that integration bugs and disputed transactions can be debugged using the original processor data.

#### Acceptance Criteria

1. THE MongoDB_Layer SHALL define a `GatewayPayload` Mongoose schema with `processor` as a required `String` enum restricted to `['stripe', 'razorpay', 'plaid', 'other']`.
2. THE MongoDB_Layer SHALL store `transactionId` as a required `String` referencing the MySQL `transactions.id` (hex UUID).
3. THE MongoDB_Layer SHALL store `rawPayload` as a `Mixed` field holding the unmodified JSON object received from the processor.
4. THE MongoDB_Layer SHALL store `httpStatusCode` as a `Number` field recording the HTTP status of the processor response.
5. THE MongoDB_Layer SHALL store `eventType` as a `String` field (e.g., `"payment_intent.succeeded"`, `"transfer.failed"`).
6. THE MongoDB_Layer SHALL store `processorTransactionId` as an optional `String` for the processor's own reference identifier.
7. THE MongoDB_Layer SHALL set `timestamps: true` so `createdAt` is recorded automatically.
8. THE MongoDB_Layer SHALL create an index on `{ transactionId: 1 }` to support lookup of all gateway events for a given transaction within 10 ms.
9. THE MongoDB_Layer SHALL create an index on `{ processor: 1, createdAt: -1 }` to support per-processor payload history queries.
10. IF a GatewayPayload document exceeds 16 MB (MongoDB document limit), THEN THE System SHALL split the payload into chunks using GridFS and store the GridFS file reference in the `rawPayload` field.

---

### Requirement 9: Atomic Cross-Database Transfer Operation

**User Story:** As a banking customer, I want fund transfers to either fully complete or fully roll back, so that my balance is never debited without the recipient being credited, regardless of partial failures.

#### Acceptance Criteria

1. THE System SHALL expose a `Transfer` service function accepting `{ senderAccountId, receiverAccountId, amount, currency, transactionType, initiatorUserId, ipAddress, geoCoordinates }`, where `amount` is a positive numeric value between 0.01 and 999,999,999.99 (inclusive) with at most 2 decimal places, all fields are non-null, and `senderAccountId` differs from `receiverAccountId`.
2. WHEN a Transfer is initiated, THE System SHALL begin a Sequelize managed transaction with isolation level `SERIALIZABLE` before modifying any MySQL row.
3. WHEN a Transfer is initiated, THE System SHALL deduct `amount` from the sender Account balance using an UPDATE with `WHERE version_id = :currentVersion AND balance >= :amount` and increment `version_id` by 1.
4. WHEN the sender balance UPDATE succeeds, THE System SHALL credit `amount` to the receiver Account balance using an UPDATE with `WHERE version_id = :currentVersion` and increment `version_id` by 1.
5. WHEN both balance UPDATEs succeed, THE System SHALL insert a `transactions` row with `status = 'pending'` inside the same Sequelize transaction.
6. WHEN the Sequelize transaction is committed successfully, THE System SHALL update the `transactions` row `status` to `'completed'`.
7. WHEN the Sequelize transaction is committed successfully, THE System SHALL append an `AuditLog` document to MongoDB with `action = 'transfer_completed'` and the transaction reference in `payloadSnapshot`.
8. IF the sender Account has insufficient balance (balance < amount), THEN THE System SHALL abort the Sequelize transaction and return an error code `INSUFFICIENT_FUNDS` without inserting a `transactions` row.
9. IF any required input field is null, `amount` is outside the range 0.01 to 999,999,999.99, `amount` has more than 2 decimal places, or `senderAccountId` equals `receiverAccountId`, THEN THE System SHALL return an error indicating invalid input without beginning a Sequelize transaction or modifying any database row.
10. IF any Sequelize transaction step fails after the transaction has started, THEN THE System SHALL call `transaction.rollback()` and append an `AuditLog` document with `action = 'transfer_failed'` and `severity = 'warning'`.
11. IF an `OptimisticLockError` is raised during a Transfer, THEN THE System SHALL retry the entire Transfer operation up to 3 times with exponential back-off (50 ms, 100 ms, 200 ms) before returning an error code `LOCK_CONFLICT_MAX_RETRIES` to the caller.
12. IF the post-commit `transactions` row `status` UPDATE to `'completed'` fails, THEN THE System SHALL log the failure with the transaction reference and enqueue the update for retry via the in-process retry queue, without reversing the MySQL commit.
13. IF the MongoDB AuditLog write fails after a successful MySQL commit, THEN THE System SHALL log the failure with prefix `[audit]` and enqueue the failed audit document for retry via an in-process retry queue, without reversing the MySQL commit.
14. THE System SHALL complete a successful Transfer from the moment the service function is invoked until the caller receives the response within 500 ms at the 95th percentile under a load of 100 concurrent transfers.

---

### Requirement 10: Transfer API Endpoint

**User Story:** As a frontend developer, I want a REST API endpoint to initiate fund transfers, so that the React client can trigger transfers and receive structured success or error responses.

#### Acceptance Criteria

1. THE System SHALL expose `POST /api/transactions/transfer` accepting a JSON body with `senderAccountId`, `receiverAccountId`, `amount`, `currency`, and `transactionType`.
2. WHEN a transfer request is received without all required fields, THE System SHALL return HTTP 400 with a JSON body listing the missing fields.
3. WHEN `amount` is not a positive number with at most 4 decimal places, THE System SHALL return HTTP 400 with error code `INVALID_AMOUNT`.
4. WHEN `currency` is not a 3-character ISO 4217 string, THE System SHALL return HTTP 400 with error code `INVALID_CURRENCY`.
5. WHEN `transactionType` is not one of `'internal'`, `'wire'`, or `'billpay'`, THE System SHALL return HTTP 400 with error code `INVALID_TRANSACTION_TYPE`.
6. WHEN a Transfer completes successfully, THE System SHALL return HTTP 200 with a body containing `transactionId`, `status: 'completed'`, `senderNewBalance`, and `receiverNewBalance`.
7. WHEN a Transfer fails with `INSUFFICIENT_FUNDS`, THE System SHALL return HTTP 422 with error code `INSUFFICIENT_FUNDS`.
8. WHEN a Transfer fails after exhausting all retries, THE System SHALL return HTTP 500 with error code `TRANSFER_FAILED` and a correlation ID for log tracing.
9. THE System SHALL record the requestor's `ipAddress` and `userAgent` in the `AuditLog` document for every transfer attempt regardless of outcome.

---

### Requirement 11: Session Management API

**User Story:** As a security engineer, I want session creation, refresh, and revocation endpoints backed by the `devices_and_sessions` MongoDB collection, so that compromised sessions can be remotely invalidated across all device platforms.

#### Acceptance Criteria

1. THE System SHALL expose `POST /api/auth/session` to create a new DeviceSession document and return a signed refresh token.
2. WHEN a session is created, THE System SHALL hash the raw refresh token with SHA-256 before storing it in the `refreshToken` field.
3. THE System SHALL expose `DELETE /api/auth/session/:sessionId` to revoke a specific DeviceSession and append an `AuditLog` with `action = 'session_revoked'`.
4. THE System SHALL expose `DELETE /api/auth/sessions` to revoke all DeviceSession documents for a given `userId` and append a single `AuditLog` with `action = 'session_revoked'` and the count of revoked sessions in `payloadSnapshot`.
5. WHEN a session revocation request is received for a `sessionId` that does not exist, THE System SHALL return HTTP 404.
6. THE System SHALL expose `PATCH /api/auth/session/:sessionId/heartbeat` to update the `lastSeenAt` timestamp on a DeviceSession within 50 ms.

---

### Requirement 12: Migration from SQLite to MySQL

**User Story:** As a backend engineer, I want the existing SQLite user records to be migrated into the new MySQL `users` table without data loss, so that existing registered users can continue to log in after the database switch.

#### Acceptance Criteria

1. THE System SHALL provide a standalone migration script at `server/scripts/migrate-sqlite-to-mysql.ts` that reads all rows from the existing SQLite `users` table.
2. WHEN the migration script runs, THE System SHALL INSERT each SQLite user into the MySQL `users` table preserving `username`, `email`, `password_hash`, `first_name`, `last_name`, and `account_number`.
3. WHEN the migration script runs, THE System SHALL generate a `BINARY(16)` UUID for each migrated user derived deterministically from the original SQLite `id` string using UUID v5 with a fixed namespace.
4. WHEN the migration script runs, THE System SHALL also INSERT a corresponding `accounts` row for each user using the existing `account_number` with `currency = 'USD'` and `balance = 0.0000`.
5. IF an INSERT fails due to a duplicate `email` or `username`, THEN THE migration script SHALL log the conflict and skip the row without aborting the entire migration.
6. WHEN the migration script completes, THE System SHALL print a summary report of total rows processed, inserted, skipped, and failed.
7. THE System SHALL maintain backward compatibility with the existing `/api/auth/login` and `/api/auth/register` routes by pointing them at the MySQL_Layer after migration, with no change to the request/response contract.

---

### Requirement 13: Environment Configuration and Secrets Management

**User Story:** As a DevOps engineer, I want all database credentials and sensitive configuration values to be loaded exclusively from environment variables, so that no secrets are committed to the repository.

#### Acceptance Criteria

1. THE System SHALL read all MySQL connection parameters from environment variables: `DB_MYSQL_HOST`, `DB_MYSQL_PORT`, `DB_MYSQL_USER`, `DB_MYSQL_PASSWORD`, `DB_MYSQL_NAME`.
2. THE System SHALL read the MongoDB connection URI from `DB_MONGO_URI`.
3. THE System SHALL read the JWT signing secret (used for refresh tokens) from `JWT_SECRET` and reject startup if the variable is absent or fewer than 32 characters.
4. IF any required environment variable is missing at startup, THEN THE System SHALL log each missing variable name with prefix `[config]` and terminate with exit code 1.
5. THE System SHALL provide an updated `.env.example` file listing all new required and optional environment variables with placeholder values and inline comments.
6. THE System SHALL NOT log the value of any environment variable containing `PASSWORD`, `SECRET`, `KEY`, or `TOKEN` in its name at any log level.

---

### Requirement 14: Health Check Endpoint

**User Story:** As a DevOps engineer, I want a health check endpoint that reports the liveness of both MySQL and MongoDB connections, so that load balancers and monitoring tools can detect database outages automatically.

#### Acceptance Criteria

1. THE System SHALL expose `GET /api/health` returning HTTP 200 when both MySQL and MongoDB connections are active.
2. WHEN the health check is requested, THE System SHALL execute a lightweight ping (`SELECT 1` for MySQL, `db.admin().ping()` for MongoDB) with a 2-second timeout.
3. IF MySQL is unreachable during the health check, THE System SHALL return HTTP 503 with body `{ "status": "degraded", "mysql": "down", "mongo": "up" }`.
4. IF MongoDB is unreachable during the health check, THE System SHALL return HTTP 503 with body `{ "status": "degraded", "mysql": "up", "mongo": "down" }`.
5. IF both databases are unreachable, THE System SHALL return HTTP 503 with body `{ "status": "down", "mysql": "down", "mongo": "down" }`.
6. THE System SHALL respond to `GET /api/health` within 3 seconds under all conditions.

---

### Requirement 15: Security Hardening

**User Story:** As a security engineer, I want the database layer to follow security best practices to prevent SQL injection, credential exposure, and unauthorized data access.

#### Acceptance Criteria

1. THE MySQL_Layer SHALL use parameterized queries exclusively; no raw string interpolation SHALL appear in any SQL statement.
2. THE System SHALL hash all PIN values with bcrypt at cost factor 12 before storage; plaintext PINs SHALL NOT be logged or returned in any API response.
3. THE System SHALL strip fields named `password`, `passwordHash`, `pinHash`, `resetToken`, `refreshToken`, and `rawPayload` from all API response objects using a serialization interceptor.
4. THE MongoDB_Layer SHALL set `sanitizeFilter: true` on all Mongoose queries to prevent NoSQL injection via operator key injection (e.g., `$where`, `$gt`).
5. THE System SHALL enforce a maximum request body size of 1 MB on all transfer and session endpoints via Express `express.json({ limit: '1mb' })`.
6. THE MySQL_Layer SHALL create a dedicated MySQL user with `SELECT`, `INSERT`, `UPDATE` privileges only on the application database; `DROP`, `TRUNCATE`, and `DELETE` privileges SHALL NOT be granted to the runtime user.

