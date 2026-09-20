/**
 * server/routes/auth-new.ts
 *
 * Authentication routes with JWT support.
 * Uses MySQL via Sequelize for user persistence.
 *
 * Endpoints:
 *   POST /api/auth/register   — create account, returns user + JWT
 *   POST /api/auth/login      — authenticate, returns user + JWT
 *   POST /api/auth/forgot-password — initiate password reset
 *   POST /api/auth/reset-password   — complete password reset
 */

import { Router, Response } from "express";
import { validateBody } from "../validation/schemas.js";
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  RegisterInput,
  LoginInput,
} from "../validation/schemas.js";
import { authLimiter } from "../middleware/rateLimiter.js";
import * as authService from "../services/authService.js";
import { sendPasswordResetEmail } from "../email/mailer.js";
import { requireAuth } from "../middleware/auth.js";

export const authRouter = Router();

const APP_URL = process.env.APP_URL ?? "http://localhost:5173";

/**
 * POST /api/auth/register
 * Register a new user. Returns user profile + JWT access token.
 */
authRouter.post(
  "/register",
  authLimiter,
  validateBody(registerSchema),
  async (req: any, res: Response): Promise<void> => {
    try {
      const input = req.body as RegisterInput;

      const ipAddress = req.ip ?? req.connection.remoteAddress;
      const userAgent = req.headers["user-agent"];

      const result = await authService.registerUser(input, {
        ipAddress,
        userAgent,
      });

      res.status(201).json({
        message: "Account created successfully",
        user: result.user,
        accessToken: result.accessToken,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";

      if (message === "USERNAME_TAKEN") {
        res.status(409).json({
          error: "That username is already taken. Please choose another.",
        });
        return;
      }

      if (message === "EMAIL_EXISTS") {
        res.status(409).json({
          error: "An account with that email address already exists.",
        });
        return;
      }

      console.error("[auth] Register error:", err);
      res.status(500).json({ error: "Registration failed. Please try again." });
    }
  }
);

/**
 * POST /api/auth/login
 * Authenticate user with username + password.
 * Returns user profile + JWT access token.
 */
authRouter.post(
  "/login",
  authLimiter,
  validateBody(loginSchema),
  async (req: any, res: Response): Promise<void> => {
    try {
      const input = req.body as LoginInput;

      const ipAddress = req.ip ?? req.connection.remoteAddress;
      const userAgent = req.headers["user-agent"];

      const result = await authService.loginUser(input, {
        ipAddress,
        userAgent,
      });

      res.status(200).json({
        message: "Login successful",
        user: result.user,
        accessToken: result.accessToken,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";

      if (message === "INVALID_CREDENTIALS") {
        res.status(401).json({
          error: "Incorrect username or password. Please try again.",
        });
        return;
      }

      console.error("[auth] Login error:", err);
      res.status(500).json({ error: "Login failed. Please try again." });
    }
  }
);

/**
 * POST /api/auth/forgot-password
 * Request a password reset link via email.
 * Always returns the same response to prevent email enumeration.
 */
authRouter.post(
  "/forgot-password",
  authLimiter,
  validateBody(forgotPasswordSchema),
  async (req: any, res: Response): Promise<void> => {
    try {
      const { email } = req.body;

      const rawToken = await authService.createPasswordResetToken(email);

      if (rawToken) {
        // Send email with reset link
        const resetUrl = `${APP_URL}/reset-password?token=${rawToken}`;
        await sendPasswordResetEmail(email, "User", resetUrl);
      }

      // Always return same response to prevent email enumeration
      res.status(200).json({
        message: "If an account with that email exists, a reset link has been sent.",
      });
    } catch (err) {
      console.error("[auth] Forgot password error:", err);
      res.status(500).json({ error: "Failed to process request. Please try again." });
    }
  }
);

/**
 * POST /api/auth/reset-password
 * Complete password reset using token from email.
 */
authRouter.post(
  "/reset-password",
  authLimiter,
  validateBody(resetPasswordSchema),
  async (req: any, res: Response): Promise<void> => {
    try {
      const { token, password } = req.body;

      await authService.resetPassword(token, password);

      res.status(200).json({
        message: "Your password has been updated successfully.",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";

      if (message === "INVALID_OR_EXPIRED_TOKEN") {
        res.status(400).json({
          error: "This reset link is invalid or has expired. Please request a new one.",
        });
        return;
      }

      console.error("[auth] Reset password error:", err);
      res.status(500).json({ error: "Failed to reset password. Please try again." });
    }
  }
);

/**
 * GET /api/auth/me
 * Get current user profile. Requires JWT authentication.
 */
authRouter.get(
  "/me",
  requireAuth,
  async (req: any, res: Response): Promise<void> => {
    try {
      // User is already attached by auth middleware
      res.json({ user: req.user });
    } catch (err) {
      console.error("[auth] Me error:", err);
      res.status(500).json({ error: "Failed to retrieve user profile" });
    }
  }
);
