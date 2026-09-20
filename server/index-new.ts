/**
 * server/index.ts
 *
 * Main server entry point for NexusPay Banking API.
 *
 * Architecture:
 *   Phase 1: Single backend application with all modules.
 *   Phase 2 (future): Decompose into microservices behind API Gateway.
 *
 * Modules (each can become an independent service):
 *   - auth:      User registration, login, JWT issuance
 *   - accounts:  Account creation, balance queries
 *   - transactions: Fund transfers (atomic), transaction history
 *   - beneficiaries: Saved payees management
 *   - notifications: User alerts stored in MongoDB
 *   - search:    TF-IDF + cosine similarity search
 *
 * Data ownership:
 *   - MySQL:     users, accounts, transactions, beneficiaries
 *   - MongoDB:   notifications, activity_logs, device_sessions
 */

import express from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import swaggerUi from "swagger-ui-express";

// Configuration
import { validateEnv } from "./config/env.js";
import { swaggerSpec } from "./config/swagger.js";

// Database initialization
import { initMySQL } from "./db/mysql.js";
import { initMongoDB } from "./db/mongodb.js";

// Import Sequelize models (registers them)
import "./db/models/User.js";
import "./db/models/Account.js";
import "./db/models/Transaction.js";
import "./db/models/Beneficiary.js";

// Routes
import { authRouter } from "./routes/auth-new.js";
import { accountsRouter } from "./routes/accounts.js";
import { transactionsRouter } from "./routes/transactions.js";
import { beneficiariesRouter } from "./routes/beneficiaries.js";
import { notificationsRouter } from "./routes/notifications.js";
import { searchRouter } from "./routes/search.js";

// Middleware
import { standardLimiter } from "./middleware/rateLimiter.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  // Validate environment variables before any DB init
  validateEnv();

  // Initialize databases
  await initMySQL();
  await initMongoDB();

  const app = express();
  const server = createServer(app);

  // ── Global middleware ───────────────────────────────────────────────────────

  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true }));

  // Apply standard rate limiting to all API routes
  app.use("/api", standardLimiter);

  // ── API documentation (Swagger) ───────────────────────────────────────────────

  app.use(
    "/api/docs",
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec, {
      customCss: ".swagger-ui .topbar { display: none }",
      customSiteTitle: "NexusPay API Docs",
    })
  );

  // JSON endpoint for Swagger spec
  app.get("/api/docs.json", (_req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.send(swaggerSpec);
  });

  // ── Health check ─────────────────────────────────────────────────────────────

  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      version: "1.0.0",
    });
  });

  // ── API routes ───────────────────────────────────────────────────────────────

  app.use("/api/auth", authRouter);
  app.use("/api/accounts", accountsRouter);
  app.use("/api/transactions", transactionsRouter);
  app.use("/api/beneficiaries", beneficiariesRouter);
  app.use("/api/notifications", notificationsRouter);
  app.use("/api/search", searchRouter);

  // ── 404 handler for API routes ───────────────────────────────────────────────

  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Endpoint not found" });
  });

  // ── Static + SPA (production only; dev uses Vite with proxy) ─────────────────

  if (process.env.NODE_ENV === "production") {
    const staticPath = path.resolve(__dirname, "public");
    app.use(express.static(staticPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(staticPath, "index.html"));
    });
  }

  // ── Error handler ─────────────────────────────────────────────────────────────

  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error("[server] Unhandled error:", err);
    res.status(500).json({ error: "Internal server error" });
  });

  // ── Start server ─────────────────────────────────────────────────────────────

  // In dev the Express server runs on 3001; Vite on 3000 proxies /api to here.
  // In production NODE_ENV=production so PORT is the only var needed.
  const port =
    process.env.NODE_ENV === "production"
      ? Number(process.env.PORT ?? 3000)
      : 3001;

  server.listen(port, () => {
    console.log(
      `[server] ${process.env.NODE_ENV === "production" ? "Production" : "API"} server on http://localhost:${port}/`
    );
    console.log(`[server] API docs available at http://localhost:${port}/api/docs`);
  });
}

startServer().catch((err) => {
  console.error("[server] Fatal startup error:", err);
  process.exit(1);
});
