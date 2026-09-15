/**
 * server/db/database.ts
 *
 * SQLite database — single source of truth for users + password-reset tokens.
 * Uses better-sqlite3 (synchronous API, zero setup, file persisted on disk).
 *
 * Security model for reset tokens:
 *   Raw token is emailed to the user; only its SHA-256 hash is stored.
 */

import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import { mkdirSync } from "fs";
import bcrypt from "bcryptjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// db lives at <project-root>/data/banking.db — persists across restarts
const DB_PATH = path.resolve(__dirname, "..", "..", "data", "banking.db");
mkdirSync(path.dirname(DB_PATH), { recursive: true });

export const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

/* ─── Schema ─────────────────────────────────────────────────── */
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id                    TEXT PRIMARY KEY,
    username              TEXT NOT NULL UNIQUE COLLATE NOCASE,
    first_name            TEXT NOT NULL,
    last_name             TEXT NOT NULL,
    email                 TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash         TEXT NOT NULL,
    account_number        TEXT NOT NULL,
    date_of_birth         TEXT,
    reset_token           TEXT DEFAULT NULL,
    reset_token_expires   INTEGER DEFAULT NULL,
    created_at            INTEGER NOT NULL DEFAULT (unixepoch())
  );
`);

/* ─── Seed demo user (won't overwrite if already exists) ─────── */
const exists = db.prepare("SELECT id FROM users WHERE username = ?").get("alex.morgan");
if (!exists) {
  db.prepare(`
    INSERT INTO users (id, username, first_name, last_name, email, password_hash, account_number)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    "usr_001",
    "alex.morgan",
    "Alex",
    "Morgan",
    "alex.morgan@example.com",
    bcrypt.hashSync("Password1!", 12),
    "4521-0000-0000-7890"
  );
  console.log("[DB] Demo user seeded — alex.morgan / Password1!");
}

/* ─── Types ──────────────────────────────────────────────────── */
export interface UserRow {
  id: string;
  username: string;
  first_name: string;
  last_name: string;
  email: string;
  password_hash: string;
  account_number: string;
  date_of_birth: string | null;
  reset_token: string | null;
  reset_token_expires: number | null;
  created_at: number;
}

export interface CreateUserInput {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  email: string;
  passwordHash: string;
  accountNumber: string;
  dateOfBirth?: string;
}

/* ─── Query helpers ──────────────────────────────────────────── */
export const findUserByUsername = (username: string): UserRow | undefined =>
  db.prepare("SELECT * FROM users WHERE username = ?").get(username) as UserRow | undefined;

export const findUserByEmail = (email: string): UserRow | undefined =>
  db.prepare("SELECT * FROM users WHERE email = ?").get(email) as UserRow | undefined;

export const findUserById = (id: string): UserRow | undefined =>
  db.prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined;

export const findUserByResetToken = (hashedToken: string): UserRow | undefined =>
  db.prepare(
    "SELECT * FROM users WHERE reset_token = ? AND reset_token_expires > ?"
  ).get(hashedToken, Date.now()) as UserRow | undefined;

export const createUser = (input: CreateUserInput): void => {
  db.prepare(`
    INSERT INTO users (id, username, first_name, last_name, email, password_hash, account_number, date_of_birth)
    VALUES (@id, @username, @firstName, @lastName, @email, @passwordHash, @accountNumber, @dateOfBirth)
  `).run({
    id: input.id,
    username: input.username,
    firstName: input.firstName,
    lastName: input.lastName,
    email: input.email,
    passwordHash: input.passwordHash,
    accountNumber: input.accountNumber,
    dateOfBirth: input.dateOfBirth ?? null,
  });
};

export const saveResetToken = (userId: string, hashedToken: string, expiresAt: number): void => {
  db.prepare("UPDATE users SET reset_token = ?, reset_token_expires = ? WHERE id = ?")
    .run(hashedToken, expiresAt, userId);
};

export const clearResetToken = (userId: string, newPasswordHash: string): void => {
  db.prepare(
    "UPDATE users SET password_hash = ?, reset_token = NULL, reset_token_expires = NULL WHERE id = ?"
  ).run(newPasswordHash, userId);
};
