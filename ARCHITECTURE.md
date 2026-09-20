# NexusPay Banking API - Architecture Documentation

## Overview

NexusPay is a cross-platform transaction application for banking and FinTech. This document describes the system architecture, data ownership, API boundaries, and the evolutionary path from a monolithic backend to microservices.

## Current State: Phase 1 - Monolithic Backend

The system is built as a single Express.js application with clearly separated domain modules. Each module can later be extracted into an independent service with minimal rework.

### Technology Stack

| Layer | Technology |
|-------|------------|
| Backend Framework | Express.js (Node.js 20+) |
| Relational Database | MySQL 8 (Sequelize ORM) |
| Document Database | MongoDB 7 (Mongoose ODM) |
| Authentication | JWT + bcrypt |
| Validation | Zod |
| API Documentation | Swagger/OpenAPI 3.0 |
| Containerization | Docker + Docker Compose |

### Project Structure

```
cross-platform-banking-ui/
├── client/                    # React frontend (Vite)
├── server/
│   ├── config/               # Environment, Swagger config
│   ├── db/
│   │   ├── models/           # Sequelize models (MySQL)
│   │   ├── mongo-models/     # Mongoose models (MongoDB)
│   │   ├── migrations/       # SQL migrations
│   │   ├── mysql.ts          # MySQL connection
│   │   └── mongodb.ts        # MongoDB connection
│   ├── middleware/
│   │   ├── auth.ts           # JWT verification
│   │   └── rateLimiter.ts    # Rate limiting
│   ├── routes/
│   │   ├── auth-new.ts       # /api/auth
│   │   ├── accounts.ts       # /api/accounts
│   │   ├── transactions.ts   # /api/transactions
│   │   ├── beneficiaries.ts  # /api/beneficiaries
│   │   ├── notifications.ts  # /api/notifications
│   │   └── search.ts         # /api/search
│   ├── services/             # Business logic
│   │   ├── authService.ts
│   │   ├── accountService.ts
│   │   ├── transferService.ts
│   │   ├── beneficiaryService.ts
│   │   ├── notificationService.ts
│   │   └── searchService.ts
│   ├── utils/                # Utilities (UUID helpers)
│   ├── validation/           # Zod schemas
│   └── index.ts              # Entry point
├── tests/                    # Unit tests
├── Dockerfile                # Production container
├── Dockerfile.dev            # Development container
├── docker-compose.yml        # Production compose
└── docker-compose.dev.yml    # Development compose
```

---

## Polyglot Persistence Strategy

### MySQL (Relational Database)

**Purpose:** Structured, relationship-heavy data requiring ACID transactions.

**Tables:**

| Table | Purpose |
|-------|---------|
| `users` | User accounts, credentials, KYC status |
| `accounts` | Bank accounts, balances, currency |
| `transactions` | Append-only ledger of fund transfers |
| `beneficiaries` | Saved payees for quick transfers |

**Key Design Decisions:**
- UUID primary keys stored as `BINARY(16)` for compact storage
- `DECIMAL(15,4)` for monetary amounts (avoid floating-point errors)
- Optimistic locking via `version_id` on `accounts` for concurrent transfers
- Append-only `transactions` table with immutable records
- Foreign key constraints for referential integrity

### MongoDB (Document Database)

**Purpose:** Flexible, fast-changing data, event logs, and user behavior tracking.

**Collections:**

| Collection | Purpose |
|------------|---------|
| `notifications` | User alerts (transaction, security, system, promo) |
| `activity_logs` | Audit trail of all user actions |
| `devices_and_sessions` | Device fingerprints, refresh tokens |

**Key Design Decisions:**
- TTL indexes for auto-expiration (refresh tokens, promotional notifications)
- Text indexes for search functionality
- Flexible `metadata` field for event-specific data

---

## Module Boundaries & Data Ownership

Each module has a clear domain boundary and owns specific data. This separation enables future extraction into microservices.

### 1. Auth Module

**Responsibility:** User registration, login, JWT issuance, password reset.

**MySQL Tables:**
- `users` (owns)

**MongoDB Collections:**
- `activity_logs` (writes auth events)
- `devices_and_sessions` (owns refresh tokens)

**API Endpoints:**
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password`
- `GET /api/auth/me`

**Future Service:** Can be extracted as `auth-service` with its own database containing users and sessions.

---

### 2. Accounts Module

**Responsibility:** Account creation, balance queries, account management.

**MySQL Tables:**
- `accounts` (owns)

**API Endpoints:**
- `POST /api/accounts`
- `GET /api/accounts`
- `GET /api/accounts/:id`
- `GET /api/accounts/:id/balance`

**Future Service:** Can be extracted as `account-service`. Would need to publish account creation events for other services.

---

### 3. Transactions Module

**Responsibility:** Fund transfers, transaction history, transaction status.

**MySQL Tables:**
- `transactions` (owns)
- `accounts` (reads/writes balances during transfers)

**MongoDB Collections:**
- `activity_logs` (writes transaction events)
- `notifications` (writes transaction alerts)

**API Endpoints:**
- `POST /api/transactions/transfer`
- `GET /api/transactions`

**Critical Requirements:**
- **Atomicity:** Debit and credit must succeed together or neither happens
- **Optimistic Locking:** Prevents lost updates on concurrent transfers
- **Append-Only:** Transactions cannot be modified or deleted

**Future Service:** Can be extracted as `transaction-service`. Would use Saga pattern for cross-service transfers.

---

### 4. Beneficiaries Module

**Responsibility:** Saved payees management.

**MySQL Tables:**
- `beneficiaries` (owns)

**API Endpoints:**
- `POST /api/beneficiaries`
- `GET /api/beneficiaries`
- `GET /api/beneficiaries/:id`
- `PUT /api/beneficiaries/:id`
- `DELETE /api/beneficiaries/:id`

**Future Service:** Can be extracted as `beneficiary-service`. Lightweight service with minimal dependencies.

---

### 5. Notifications Module

**Responsibility:** User alerts, notification preferences, delivery tracking.

**MongoDB Collections:**
- `notifications` (owns)

**API Endpoints:**
- `GET /api/notifications`
- `POST /api/notifications/:id/read`
- `POST /api/notifications/read-all`
- `DELETE /api/notifications/:id`

**Future Service:** Can be extracted as `notification-service`. Receives events from other services via message queue.

---

### 6. Search Module

**Responsibility:** Similarity-based search across transactions and activity logs.

**Data Access:**
- Reads from `transactions` (MySQL)
- Reads from `activity_logs` (MongoDB)

**Algorithm:** TF-IDF + cosine similarity for semantic matching (not limited to exact keyword matches).

**API Endpoints:**
- `GET /api/search`

**Future Service:** Can be extracted as `search-service`. Would maintain its own search index (Elasticsearch) synced from other services.

---

## Security Architecture

### Authentication Flow

1. **Registration:** Password hashed with bcrypt (12 rounds), user created, JWT issued
2. **Login:** Credentials verified, JWT issued (7-day expiry)
3. **Protected Routes:** JWT verified in middleware, user attached to `req.user`

### JWT Token Structure

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "username": "johndoe",
  "email": "john.doe@example.com",
  "iat": 1234567890,
  "exp": 1234567890
}
```

### Rate Limiting

| Endpoint Type | Limit | Window |
|--------------|-------|--------|
| Auth (login, register, forgot-password) | 5 requests | 15 minutes |
| Transfer | 10 requests | 15 minutes |
| General API | 100 requests | 15 minutes |

### Input Validation

- All endpoints use Zod schemas for validation
- Validation happens BEFORE business logic
- Malformed requests return 400 with detailed error messages

---

## Transaction Consistency

### Atomic Fund Transfer

The `transferService` uses MySQL transactions with row-level locking:

```sql
-- Lock sender account
SELECT balance, version_id FROM accounts WHERE id = ? FOR UPDATE;

-- Lock receiver account
SELECT balance FROM accounts WHERE id = ? FOR UPDATE;

-- Create pending transaction
INSERT INTO transactions (...) VALUES (...);

-- Debit sender (optimistic lock check)
UPDATE accounts SET balance = balance - ?, version_id = version_id + 1
WHERE id = ? AND version_id = ?;

-- Credit receiver
UPDATE accounts SET balance = balance + ?, version_id = version_id + 1
WHERE id = ?;

-- Mark transaction complete
UPDATE transactions SET status = 'completed' WHERE id = ?;
```

If any step fails, the entire transaction rolls back.

---

## Future Evolution: Phase 2 - Microservices

### Target Architecture

```
                    ┌─────────────────────────────────────┐
                    │           API Gateway               │
                    │  (Kong / AWS API Gateway / Custom)  │
                    └───────────────┬─────────────────────┘
                                    │
        ┌───────────────────────────┼───────────────────────────┐
        │                           │                           │
        ▼                           ▼                           ▼
┌───────────────┐         ┌───────────────┐         ┌───────────────┐
│ Auth Service  │         │ Account Svc   │         │Transaction Svc│
│               │         │               │         │               │
│ MySQL: users  │         │ MySQL:accounts│         │ MySQL: txn    │
│ Mongo: sessions│        │               │         │               │
└───────┬───────┘         └───────┬───────┘         └───────┬───────┘
        │                         │                         │
        │         ┌───────────────┼───────────────────┐     │
        │         │               │                   │     │
        │         ▼               ▼                   ▼     │
        │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
        │  │Notification  │ │ Beneficiary  │ │ Search Svc   │
        │  │ Service      │ │ Service      │ │              │
        │  │              │ │              │ │ Elasticsearch│
        │  │Mongo: notifs │ │MySQL: bene   │ │              │
        │  └──────────────┘ └──────────────┘ └──────────────┘
        │
        └─────────────────────────────────────────────────────┘
                         Message Queue (RabbitMQ / Kafka)
```

### Extraction Process

1. **Identify module** to extract (e.g., notifications)
2. **Create new service** with its own codebase
3. **Define API contract** (REST/gRPC)
4. **Set up message queue** for async communication
5. **Deploy behind API Gateway**
6. **Route traffic** through gateway
7. **Decommission** module from monolith

### Saga Pattern for Cross-Service Transactions

When `transaction-service` is extracted, fund transfers spanning multiple services require the Saga pattern:

```
Transfer Saga:
1. Transaction Service: Create pending transaction
2. Account Service: Debit sender account
   └─ Failure → Compensate: Mark transaction failed
3. Account Service: Credit receiver account
   └─ Failure → Compensate: Refund sender, mark failed
4. Transaction Service: Mark transaction completed
5. Notification Service: Send alerts (async)
```

---

## API Documentation

Interactive API documentation is available at `/api/docs` when the server is running.

The Swagger spec is generated from JSDoc comments in route files and the central configuration in `server/config/swagger.ts`.

---

## Deployment

### Development

```bash
# Start databases only
docker compose up -d mysql mongodb

# Run API server with hot reload
pnpm run dev:server

# Run client with Vite
pnpm run dev:client
```

### Production

```bash
# Build and run everything
docker compose up -d
```

### Environment Variables

See `.env.example` for required configuration:
- MySQL connection (host, port, user, password, database)
- MongoDB connection URI
- JWT secret (min 32 characters)
- Email SMTP settings (optional for dev)

---

## Testing

```bash
# Run unit tests
pnpm test

# Run with coverage
pnpm test:coverage

# Watch mode
pnpm test:watch
```

Test coverage includes:
- Auth logic (password hashing, JWT)
- Validation schemas
- Transfer logic (when DB mocks are available)

---

## CI/CD Pipeline Structure

```yaml
# .github/workflows/ci.yml (example)
name: CI

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      mysql:
        image: mysql:8.4
        env:
          MYSQL_ROOT_PASSWORD: root
          MYSQL_DATABASE: nexuspay_test
        ports:
          - 3306:3306
      mongodb:
        image: mongo:7
        ports:
          - 27017:27017

    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'

      - run: pnpm install --frozen-lockfile
      - run: pnpm run check
      - run: pnpm run test
      - run: pnpm run build

  docker:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: docker build -t nexuspay-api:latest .
```

---

## Monitoring & Observability (Future)

Recommended additions:
- Structured logging (pino/winston)
- Request tracing (OpenTelemetry)
- Metrics collection (Prometheus)
- Health check endpoints (implemented: `/api/health`)
- Error tracking (Sentry)

---

## Summary

The current Phase 1 architecture provides:
- Clean module separation for future extraction
- Polyglot persistence (MySQL for ACID, MongoDB for flexibility)
- JWT-based authentication with bcrypt password hashing
- Atomic fund transfers with optimistic locking
- Rate limiting and input validation on all endpoints
- Swagger/OpenAPI documentation
- Docker containerization
- Automated test suite

Phase 2 evolution will extract modules into microservices behind an API Gateway, using message queues for async communication and the Saga pattern for distributed transactions.
