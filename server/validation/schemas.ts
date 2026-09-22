/**
 * server/validation/schemas.ts
 *
 * Zod validation schemas for all API endpoints.
 * Input validation happens BEFORE business logic.
 *
 * Each schema exports:
 *   - The Zod schema for type inference
 *   - A parse function that returns the parsed data or throws ValidationError
 */

import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────────
// Auth Schemas
// ─────────────────────────────────────────────────────────────────────────────

export const registerSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(100),
  lastName: z.string().trim().max(100).optional(), // Optional - can be derived from fullName
  email: z.string().trim().email("Invalid email address").max(320),
  username: z
    .string()
    .trim()
    .min(4, "Username must be at least 4 characters")
    .max(30, "Username must be at most 30 characters")
    .regex(
      /^[a-zA-Z0-9._-]+$/,
      "Username can only contain letters, numbers, dots, underscores, and hyphens"
    ),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password is too long")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[0-9]/, "Password must contain at least one number")
    .regex(/[^A-Za-z0-9]/, "Password must contain at least one special character"),
  dateOfBirth: z.string().optional(), // ISO date string (YYYY-MM-DD)
});

export const loginSchema = z.object({
  username: z.string().trim().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().email("Invalid email address"),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, "Reset token is required"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password is too long")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[0-9]/, "Password must contain at least one number")
    .regex(/[^A-Za-z0-9]/, "Password must contain at least one special character"),
});

// ─────────────────────────────────────────────────────────────────────────────
// Account Schemas
// ─────────────────────────────────────────────────────────────────────────────

export const createAccountSchema = z.object({
  currency: z
    .string()
    .length(3, "Currency must be a 3-letter ISO code")
    .regex(/^[A-Z]{3}$/, "Currency must be uppercase letters (e.g., USD, EUR)"),
  accountNumber: z
    .string()
    .trim()
    .min(8, "Account number must be at least 8 characters")
    .max(30, "Account number must be at most 30 characters")
    .optional(),
  initialBalance: z
    .string()
    .regex(/^\d+(\.\d{1,4})?$/, "Invalid amount format")
    .optional()
    .default("0"),
});

// ─────────────────────────────────────────────────────────────────────────────
// Transaction Schemas
// ─────────────────────────────────────────────────────────────────────────────

export const transferSchema = z.object({
  receiverAccountNumber: z
    .string()
    .trim()
    .min(8, "Receiver account number must be at least 8 characters")
    .max(30, "Receiver account number must be at most 30 characters"),
  amount: z
    .string()
    .regex(/^\d+(\.\d{1,4})?$/, "Invalid amount format")
    .refine((val) => parseFloat(val) > 0, "Amount must be greater than 0"),
  currency: z
    .string()
    .length(3, "Currency must be a 3-letter ISO code")
    .regex(/^[A-Z]{3}$/, "Currency must be uppercase letters"),
  reference: z.string().trim().max(128).optional(),
  beneficiaryId: z.string().uuid().optional(),
  note: z.string().trim().max(500).optional(),
});

export const transactionQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  type: z.enum(["internal", "wire", "billpay"]).optional(),
  status: z.enum(["pending", "completed", "failed", "reversed"]).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  minAmount: z.string().optional(),
  maxAmount: z.string().optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Beneficiary Schemas
// ─────────────────────────────────────────────────────────────────────────────

export const createBeneficiarySchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  accountNumber: z
    .string()
    .trim()
    .min(8, "Account number must be at least 8 characters")
    .max(30, "Account number must be at most 30 characters"),
  bankName: z.string().trim().max(100).optional(),
  bankCode: z.string().trim().max(20).optional(), // Routing number, SWIFT, IFSC, etc.
  currency: z
    .string()
    .length(3, "Currency must be a 3-letter ISO code")
    .regex(/^[A-Z]{3}$/, "Currency must be uppercase letters")
    .optional(),
  nickname: z.string().trim().max(50).optional(),
  isFavorite: z.boolean().optional().default(false),
});

export const updateBeneficiarySchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  bankName: z.string().trim().max(100).optional(),
  bankCode: z.string().trim().max(20).optional(),
  nickname: z.string().trim().max(50).optional(),
  isFavorite: z.boolean().optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Search Schemas
// ─────────────────────────────────────────────────────────────────────────────

export const searchSchema = z.object({
  q: z.string().trim().min(1, "Search query is required").max(200),
  type: z.enum(["transactions", "activity", "all"]).default("all"),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  threshold: z.coerce.number().min(0).max(1).default(0.3), // Similarity threshold
});

// ─────────────────────────────────────────────────────────────────────────────
// Notification Schemas
// ─────────────────────────────────────────────────────────────────────────────

export const notificationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  unreadOnly: z.coerce.boolean().default(false),
  type: z.enum(["transaction", "security", "system", "promo"]).optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Validation Helper
// ─────────────────────────────────────────────────────────────────────────────

import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";

/**
 * Create an Express middleware that validates req.body against a Zod schema.
 * On success, replaces req.body with the parsed (and transformed) data.
 * On failure, returns 400 with detailed error messages.
 */
export function validateBody<T extends z.ZodTypeAny>(schema: T) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      const zodError = result.error as ZodError;
      const errors = zodError.issues.map((e) => ({
        field: e.path.join(".") || "root",
        message: e.message,
      }));

      res.status(400).json({
        error: "Validation failed",
        details: errors,
      });
      return;
    }

    req.body = result.data;
    next();
  };
}

/**
 * Validate query parameters against a Zod schema.
 * Replaces req.query with the parsed data on success.
 */
export function validateQuery<T extends z.ZodTypeAny>(schema: T) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);

    if (!result.success) {
      const zodError = result.error as ZodError;
      const errors = zodError.issues.map((e) => ({
        field: e.path.join(".") || "root",
        message: e.message,
      }));

      res.status(400).json({
        error: "Validation failed",
        details: errors,
      });
      return;
    }

    req.query = result.data as typeof req.query;
    next();
  };
}

// Export types for use in route handlers
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateAccountInput = z.infer<typeof createAccountSchema>;
export type TransferInput = z.infer<typeof transferSchema>;
export type TransactionQueryInput = z.infer<typeof transactionQuerySchema>;
export type CreateBeneficiaryInput = z.infer<typeof createBeneficiarySchema>;
export type UpdateBeneficiaryInput = z.infer<typeof updateBeneficiarySchema>;
export type SearchInput = z.infer<typeof searchSchema>;
export type NotificationQueryInput = z.infer<typeof notificationQuerySchema>;
