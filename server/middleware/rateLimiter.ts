/**
 * server/middleware/rateLimiter.ts
 *
 * Rate limiting middleware using express-rate-limit.
 *
 * Applied to sensitive endpoints (login, register, forgot-password, transfer)
 * to prevent brute-force attacks and abuse.
 */

import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { Request, Response } from "express";

/**
 * Standard rate limiter: 100 requests per 15 minutes per IP.
 * Use for general API protection.
 */
export const standardLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: { error: "Too many requests. Please try again later." },
  standardHeaders: true, // Return rate limit info in RateLimit-* headers
  legacyHeaders: false, // Disable X-RateLimit-* headers
});

/**
 * Strict rate limiter: 5 requests per 15 minutes per IP.
 * Use for authentication endpoints (login, forgot-password).
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 requests per windowMs
  message: { error: "Too many attempts. Please wait 15 minutes before trying again." },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false, // Count all requests
  skipFailedRequests: false,
});

/**
 * Transfer rate limiter: 10 requests per 15 minutes per IP.
 * Use for fund transfer endpoints.
 */
export const transferLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: "Too many transfer requests. Please wait before trying again." },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Custom key generator that combines IP + user ID (if authenticated).
 * Prevents one user from hitting limits across multiple IPs, and
 * prevents one IP from affecting multiple users.
 */
function keyGenerator(req: Request): string {
  const ip = ipKeyGenerator(req.ip ?? req.socket.remoteAddress ?? "unknown");
  const userId = (req as any).user?.id;

  return userId ? `${ip}:${userId}` : ip;
}
/**
 * Authenticated rate limiter: combines IP + user ID.
 * Use for endpoints where you want per-user limiting even behind a proxy.
 */
export const userLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: { error: "Too many requests from your account. Please slow down." },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
});
