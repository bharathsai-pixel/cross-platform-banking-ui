import express from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";

// Initialise DB (creates tables + seeds demo user) on first boot
import "./db/database.js";
import { authRouter } from "./routes/auth.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const server = createServer(app);

  app.use(express.json());

  // ── API routes — registered before the static/SPA catch-all ──
  app.use("/api/auth", authRouter);

  // ── Static + SPA (production only; dev uses Vite with proxy) ──
  if (process.env.NODE_ENV === "production") {
    const staticPath = path.resolve(__dirname, "public");
    app.use(express.static(staticPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(staticPath, "index.html"));
    });
  }

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
  });
}

startServer().catch(console.error);
