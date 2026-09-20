/**
 * server/services/authService.ts
 *
 * Authentication service handling registration, login, JWT issuance,
 * and password reset. Uses MySQL via Sequelize for user persistence.
 */

import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { env } from "../config/env.js";
import { User } from "../db/models/User.js";
import { Account } from "../db/models/Account.js";
import { DeviceSession } from "../db/mongo-models/DeviceSession.js";
import { ActivityLog } from "../db/mongo-models/ActivityLog.js";
import { newUuid, uuidToBuffer, bufferToUuid } from "../utils/uuid.js";
import type { RegisterInput, LoginInput } from "../validation/schemas.js";

const JWT_EXPIRES_IN = "7d"; // Access token validity
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

interface UserResponse {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  email: string;
}

interface LoginResult {
  user: UserResponse;
  accessToken: string;
}

/**
 * Register a new user. Creates user + default USD account.
 * Returns user profile + JWT access token.
 */
export async function registerUser(
  input: RegisterInput,
  reqMeta: { ipAddress?: string; userAgent?: string; deviceFingerprint?: string }
): Promise<LoginResult> {
  const { firstName, lastName, email, username, password, dateOfBirth } = input;

  // Check for existing username/email
  const existingByUsername = await User.findOne({
    where: { username },
    attributes: ["id"],
  });
  if (existingByUsername) {
    throw new Error("USERNAME_TAKEN");
  }

  const existingByEmail = await User.findOne({
    where: { email: email.toLowerCase() },
    attributes: ["id"],
  });
  if (existingByEmail) {
    throw new Error("EMAIL_EXISTS");
  }

  // Hash password
  const passwordHash = await bcrypt.hash(password, 12);

  // Generate UUIDs
  const userUuid = newUuid();
  const accountUuid = newUuid();

  // Generate account number (16 digits, formatted as XXXX-XXXX-XXXX-XXXX)
  const accountNumber = generateAccountNumber();

  // Create user + account in a transaction
  await User.sequelize!.transaction(async (t) => {
    await User.create(
      {
        id: userUuid.buffer,
        username: username.trim(),
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: email.toLowerCase().trim(),
        password_hash: passwordHash,
        kyc_status: "pending",
      },
      { transaction: t }
    );

    await Account.create(
      {
        id: accountUuid.buffer,
        user_id: userUuid.buffer,
        account_number: accountNumber,
        balance: "0.0000",
        currency: "USD",
        version_id: 0,
      },
      { transaction: t }
    );
  });

  // Log activity
  await ActivityLog.create({
    userId: userUuid.uuid,
    eventType: "user.register",
    category: "auth",
    metadata: { username, email },
    ipAddress: reqMeta.ipAddress,
    userAgent: reqMeta.userAgent,
    deviceFingerprint: reqMeta.deviceFingerprint,
  });

  // Generate JWT
  const accessToken = jwt.sign(
    { id: userUuid.uuid, username: username.trim(), email: email.toLowerCase() },
    env.jwtSecret,
    { expiresIn: JWT_EXPIRES_IN }
  );

  return {
    user: {
      id: userUuid.uuid,
      username: username.trim(),
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.toLowerCase(),
    },
    accessToken,
  };
}

/**
 * Authenticate user with username + password.
 * Returns user profile + JWT access token.
 */
export async function loginUser(
  input: LoginInput,
  reqMeta: { ipAddress?: string; userAgent?: string; deviceFingerprint?: string }
): Promise<LoginResult> {
  const { username, password } = input;

  // Find user by username
  const user = await User.findOne({
    where: { username: username.trim() },
  });

  // Constant-time compare to prevent timing attacks
  const hashToCompare = user?.password_hash ?? "$2a$12$invalidhashfortimingprevention";
  const match = await bcrypt.compare(password, hashToCompare);

  if (!user || !match) {
    throw new Error("INVALID_CREDENTIALS");
  }

  const userId = bufferToUuid(user.id);

  // Log activity
  await ActivityLog.create({
    userId,
    eventType: "user.login",
    category: "auth",
    metadata: { username: user.username },
    ipAddress: reqMeta.ipAddress,
    userAgent: reqMeta.userAgent,
    deviceFingerprint: reqMeta.deviceFingerprint,
  });

  // Generate JWT
  const accessToken = jwt.sign(
    { id: userId, username: user.username, email: user.email },
    env.jwtSecret,
    { expiresIn: JWT_EXPIRES_IN }
  );

  return {
    user: {
      id: userId,
      username: user.username,
      firstName: user.first_name,
      lastName: user.last_name,
      email: user.email,
    },
    accessToken,
  };
}

/**
 * Generate a password reset token (hashed with SHA-256).
 * Returns the raw token (to be sent via email) and stores the hash.
 */
export async function createPasswordResetToken(email: string): Promise<string | null> {
  const user = await User.findOne({
    where: { email: email.toLowerCase().trim() },
  });

  if (!user) {
    // Return null but don't reveal that email doesn't exist
    return null;
  }

  const rawToken = crypto.randomBytes(32).toString("hex");
  const hashedToken = crypto.createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = Date.now() + RESET_TOKEN_TTL_MS;

  await user.update({
    reset_token: hashedToken,
    reset_token_expires: expiresAt,
  });

  return rawToken;
}

/**
 * Verify a password reset token and update the password.
 */
export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const hashedToken = crypto.createHash("sha256").update(token.trim()).digest("hex");

  const user = await User.findOne({
    where: {
      reset_token: hashedToken,
      reset_token_expires: { $gt: Date.now() } as any, // Sequelize comparison
    },
  });

  if (!user) {
    throw new Error("INVALID_OR_EXPIRED_TOKEN");
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);

  await user.update({
    password_hash: passwordHash,
    reset_token: null,
    reset_token_expires: null,
  });

  const userId = bufferToUuid(user.id);

  await ActivityLog.create({
    userId,
    eventType: "user.password_change",
    category: "auth",
    metadata: { method: "reset" },
  });
}

/**
 * Generate a random 16-digit account number formatted as XXXX-XXXX-XXXX-XXXX.
 */
function generateAccountNumber(): string {
  const rand4 = () => Math.floor(1000 + Math.random() * 9000).toString();
  return `${rand4()}-${rand4()}-${rand4()}-${rand4()}`;
}
