/**
 * server/routes/auth.ts
 *
 * POST /api/auth/register   — create a new account, persist to SQLite
 * POST /api/auth/login      — verify credentials, return user profile
 * POST /api/auth/forgot-password
 * POST /api/auth/reset-password
 */

import { Router, type Request, type Response } from "express";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import {
  findUserByUsername,
  findUserByEmail,
  findUserByResetToken,
  createUser,
  saveResetToken,
  clearResetToken,
} from "../db/database.js";
import { sendPasswordResetEmail } from "../email/mailer.js";

export const authRouter = Router();

const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
const APP_URL = process.env.APP_URL ?? "http://localhost:5173";

/* ── helpers ─────────────────────────────────────────────────── */

/** Generate a masked account number like 8823-xxxx-xxxx-1947 */
function generateAccountNumber(): string {
  const rand4 = () => Math.floor(1000 + Math.random() * 9000).toString();
  return `${rand4()}-${rand4()}-${rand4()}-${rand4()}`;
}

/** Strip the sensitive fields before sending user data to the client */
function safeUser(u: ReturnType<typeof findUserByUsername>) {
  if (!u) return null;
  return {
    id: u.id,
    username: u.username,
    firstName: u.first_name,
    lastName: u.last_name,
    email: u.email,
    accountNumber: u.account_number,
  };
}

/* ── POST /api/auth/register ─────────────────────────────────── */
authRouter.post(
  "/register",
  async (req: Request, res: Response): Promise<void> => {
    const { firstName, lastName, email, username, password, dateOfBirth, accountNumber } =
      req.body as Record<string, string | undefined>;

    // ── Basic presence validation ──
    const missing = (["firstName", "lastName", "email", "username", "password"] as const)
      .filter((k) => !req.body[k] || typeof req.body[k] !== "string" || !(req.body[k] as string).trim());
    if (missing.length) {
      res.status(400).json({ error: `Missing required fields: ${missing.join(", ")}` });
      return;
    }

    // ── Email format ──
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email!)) {
      res.status(400).json({ error: "Invalid email address." });
      return;
    }

    // ── Username format ──
    if (!/^[a-zA-Z0-9._-]{4,30}$/.test(username!)) {
      res.status(400).json({
        error: "Username must be 4–30 characters and contain only letters, numbers, . _ -",
      });
      return;
    }

    // ── Password policy ──
    const pw = password!;
    if (pw.length < 8) {
      res.status(400).json({ error: "Password must be at least 8 characters." });
      return;
    }
    if (!/[A-Z]/.test(pw)) {
      res.status(400).json({ error: "Password must contain at least one uppercase letter." });
      return;
    }
    if (!/[0-9]/.test(pw)) {
      res.status(400).json({ error: "Password must contain at least one number." });
      return;
    }
    if (!/[^A-Za-z0-9]/.test(pw)) {
      res.status(400).json({ error: "Password must contain at least one special character." });
      return;
    }

    try {
      // ── Uniqueness checks ──
      if (findUserByUsername(username!.trim())) {
        res.status(409).json({ error: "That username is already taken. Please choose another." });
        return;
      }
      if (findUserByEmail(email!.trim().toLowerCase())) {
        res.status(409).json({ error: "An account with that email address already exists." });
        return;
      }

      const passwordHash = await bcrypt.hash(pw, 12);
      const id = `usr_${crypto.randomBytes(8).toString("hex")}`;
      const finalAccountNumber = (accountNumber && /^\d{8,20}$/.test(accountNumber.trim()))
        ? accountNumber.trim()
        : generateAccountNumber();

      createUser({
        id,
        username: username!.trim(),
        firstName: firstName!.trim(),
        lastName: lastName!.trim(),
        email: email!.trim().toLowerCase(),
        passwordHash,
        accountNumber: finalAccountNumber,
        dateOfBirth: dateOfBirth?.trim() ?? undefined,
      });

      const user = findUserByUsername(username!.trim());
      res.status(201).json({
        message: "Account created successfully.",
        user: safeUser(user),
      });
    } catch (err) {
      console.error("[auth] register error:", err);
      res.status(500).json({ error: "An unexpected error occurred. Please try again." });
    }
  }
);

/* ── POST /api/auth/login ────────────────────────────────────── */
authRouter.post(
  "/login",
  async (req: Request, res: Response): Promise<void> => {
    const { username, password } = req.body as {
      username?: string;
      password?: string;
    };

    if (!username || typeof username !== "string" || !username.trim()) {
      res.status(400).json({ error: "Username is required." });
      return;
    }
    if (!password || typeof password !== "string") {
      res.status(400).json({ error: "Password is required." });
      return;
    }

    try {
      const user = findUserByUsername(username.trim());

      // Use a constant-time compare to avoid timing attacks even on miss
      const passwordToCheck = user?.password_hash ?? "$2a$12$invalidhashtopreventtimingattack";
      const match = await bcrypt.compare(password, passwordToCheck);

      if (!user || !match) {
        res.status(401).json({ error: "Incorrect username or password. Please try again." });
        return;
      }

      res.status(200).json({
        message: "Login successful.",
        user: safeUser(user),
      });
    } catch (err) {
      console.error("[auth] login error:", err);
      res.status(500).json({ error: "An unexpected error occurred. Please try again." });
    }
  }
);

/* ── Rate-limit map (in-memory) for password reset ──────────── */
const rateLimitMap = new Map<string, { count: number; windowStart: number }>();

function isRateLimited(email: string): boolean {
  const WINDOW_MS = 15 * 60 * 1000;
  const MAX = 3;
  const now = Date.now();
  const entry = rateLimitMap.get(email);
  if (!entry || now - entry.windowStart > WINDOW_MS) {
    rateLimitMap.set(email, { count: 1, windowStart: now });
    return false;
  }
  if (entry.count >= MAX) return true;
  entry.count++;
  return false;
}

/* ── POST /api/auth/forgot-password ─────────────────────────── */
authRouter.post(
  "/forgot-password",
  async (req: Request, res: Response): Promise<void> => {
    const { email } = req.body as { email?: string };

    if (!email || typeof email !== "string" || !email.includes("@")) {
      res.status(400).json({ error: "A valid email address is required." });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (isRateLimited(normalizedEmail)) {
      res.status(429).json({ error: "Too many reset requests. Please wait 15 minutes." });
      return;
    }

    try {
      const user = findUserByEmail(normalizedEmail);
      if (user) {
        const rawToken = crypto.randomBytes(32).toString("hex");
        const hashedToken = crypto.createHash("sha256").update(rawToken).digest("hex");
        const expiresAt = Date.now() + TOKEN_TTL_MS;
        saveResetToken(user.id, hashedToken, expiresAt);
        const resetUrl = `${APP_URL}/reset-password?token=${rawToken}`;
        await sendPasswordResetEmail(user.email, user.first_name, resetUrl);
      }
      // Always return same response — prevents email enumeration
      res.status(200).json({ message: "If an account with that email exists, a reset link has been sent." });
    } catch (err) {
      console.error("[auth] forgot-password error:", err);
      res.status(500).json({ error: "An unexpected error occurred. Please try again." });
    }
  }
);

/* ── POST /api/auth/reset-password ──────────────────────────── */
authRouter.post(
  "/reset-password",
  async (req: Request, res: Response): Promise<void> => {
    const { token, password } = req.body as { token?: string; password?: string };

    if (!token || typeof token !== "string") {
      res.status(400).json({ error: "Reset token is missing or invalid." });
      return;
    }
    if (!password || typeof password !== "string" || password.length < 8) {
      res.status(400).json({ error: "Password must be at least 8 characters." });
      return;
    }
    if (!/[A-Z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
      res.status(400).json({
        error: "Password must contain an uppercase letter, a number, and a special character.",
      });
      return;
    }

    try {
      const hashedToken = crypto.createHash("sha256").update(token.trim()).digest("hex");
      const user = findUserByResetToken(hashedToken);
      if (!user) {
        res.status(400).json({ error: "This reset link is invalid or has expired. Please request a new one." });
        return;
      }
      const newPasswordHash = await bcrypt.hash(password, 12);
      clearResetToken(user.id, newPasswordHash);
      res.status(200).json({ message: "Your password has been updated successfully." });
    } catch (err) {
      console.error("[auth] reset-password error:", err);
      res.status(500).json({ error: "An unexpected error occurred. Please try again." });
    }
  }
);
