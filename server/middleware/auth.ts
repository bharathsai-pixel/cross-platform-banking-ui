/**
 * server/middleware/auth.ts
 *
 * JWT authentication middleware.
 * Verifies the Authorization: Bearer <token> header on protected routes.
 *
 * Attaches req.user with { id, username, email } on success.
 * Returns 401 Unauthorized on missing/invalid/expired tokens.
 */

import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export interface JwtPayload {
  id: string; // UUID string (not buffer)
  username: string;
  email: string;
  iat: number;
  exp: number;
}

export interface AuthenticatedRequest extends Request {
  user?: JwtPayload;
}

/**
 * Extract and verify JWT from Authorization header.
 * Attaches decoded payload to req.user for downstream handlers.
 */
export function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Authentication required. Please log in." });
    return;
  }

  const token = authHeader.slice(7); // Remove "Bearer " prefix

  try {
    const decoded = jwt.verify(token, env.jwtSecret) as JwtPayload;
    req.user = decoded;
    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      res.status(401).json({ error: "Session expired. Please log in again." });
      return;
    }
    if (err instanceof jwt.JsonWebTokenError) {
      res.status(401).json({ error: "Invalid authentication token." });
      return;
    }
    console.error("[auth] JWT verification error:", err);
    res.status(500).json({ error: "Authentication failed. Please try again." });
  }
}

/**
 * Optional auth middleware — attaches req.user if token present,
 * but does not reject if missing. Useful for endpoints that work
 * both authenticated and anonymous (e.g., public profiles).
 */
export function optionalAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    next();
    return;
  }

  const token = authHeader.slice(7);

  try {
    const decoded = jwt.verify(token, env.jwtSecret) as JwtPayload;
    req.user = decoded;
    next();
  } catch {
    // Silently ignore invalid tokens for optional auth
    next();
  }
}
