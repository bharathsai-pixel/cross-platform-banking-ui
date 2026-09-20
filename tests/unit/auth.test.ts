/**
 * tests/unit/auth.test.ts
 *
 * Unit tests for authentication logic.
 * Tests password hashing, JWT generation, and validation.
 */

import { describe, it, expect, beforeEach } from "vitest";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import {
  registerSchema,
  loginSchema,
  validateBody,
} from "../../server/validation/schemas.js";

describe("Auth Validation Schemas", () => {
  describe("registerSchema", () => {
    it("should accept valid registration data", () => {
      const input = {
        firstName: "John",
        lastName: "Doe",
        email: "john.doe@example.com",
        username: "johndoe",
        password: "Password1!",
      };

      const result = registerSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("should reject username shorter than 4 characters", () => {
      const input = {
        firstName: "John",
        lastName: "Doe",
        email: "john.doe@example.com",
        username: "jo",
        password: "Password1!",
      };

      const result = registerSchema.safeParse(input);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain("at least 4 characters");
      }
    });

    it("should reject invalid email format", () => {
      const input = {
        firstName: "John",
        lastName: "Doe",
        email: "not-an-email",
        username: "johndoe",
        password: "Password1!",
      };

      const result = registerSchema.safeParse(input);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain("Invalid email");
      }
    });

    it("should reject password without uppercase letter", () => {
      const input = {
        firstName: "John",
        lastName: "Doe",
        email: "john.doe@example.com",
        username: "johndoe",
        password: "password1!",
      };

      const result = registerSchema.safeParse(input);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain("uppercase");
      }
    });

    it("should reject password without number", () => {
      const input = {
        firstName: "John",
        lastName: "Doe",
        email: "john.doe@example.com",
        username: "johndoe",
        password: "Password!",
      };

      const result = registerSchema.safeParse(input);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain("number");
      }
    });

    it("should reject password without special character", () => {
      const input = {
        firstName: "John",
        lastName: "Doe",
        email: "john.doe@example.com",
        username: "johndoe",
        password: "Password1",
      };

      const result = registerSchema.safeParse(input);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain("special character");
      }
    });

    it("should reject password shorter than 8 characters", () => {
      const input = {
        firstName: "John",
        lastName: "Doe",
        email: "john.doe@example.com",
        username: "johndoe",
        password: "Pass1!",
      };

      const result = registerSchema.safeParse(input);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain("at least 8 characters");
      }
    });

    it("should accept password that meets all requirements", () => {
      const passwords = ["Password1!", "MySecure123$", "Test@Pass99", "Abcdefg1!"];

      passwords.forEach((password) => {
        const input = {
          firstName: "John",
          lastName: "Doe",
          email: "john.doe@example.com",
          username: "johndoe",
          password,
        };

        const result = registerSchema.safeParse(input);
        expect(result.success).toBe(true);
      });
    });
  });

  describe("loginSchema", () => {
    it("should accept valid login data", () => {
      const input = {
        username: "johndoe",
        password: "Password1!",
      };

      const result = loginSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("should reject missing username", () => {
      const input = {
        password: "Password1!",
      };

      const result = loginSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("should reject missing password", () => {
      const input = {
        username: "johndoe",
      };

      const result = loginSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });
});

describe("Password Hashing", () => {
  it("should hash password correctly", async () => {
    const password = "Password1!";
    const hash = await bcrypt.hash(password, 12);

    expect(hash).not.toBe(password);
    expect(hash.length).toBeGreaterThan(50);
  });

  it("should verify correct password", async () => {
    const password = "Password1!";
    const hash = await bcrypt.hash(password, 12);
    const match = await bcrypt.compare(password, hash);

    expect(match).toBe(true);
  });

  it("should reject incorrect password", async () => {
    const password = "Password1!";
    const hash = await bcrypt.hash(password, 12);
    const match = await bcrypt.compare("WrongPassword1!", hash);

    expect(match).toBe(false);
  });

  it("should generate different hashes for same password", async () => {
    const password = "Password1!";
    const hash1 = await bcrypt.hash(password, 12);
    const hash2 = await bcrypt.hash(password, 12);

    expect(hash1).not.toBe(hash2);
  });
});

describe("JWT Token Generation", () => {
  const secret = "test_jwt_secret_at_least_32_characters_long";

  it("should generate valid JWT token", () => {
    const payload = {
      id: "550e8400-e29b-41d4-a716-446655440000",
      username: "johndoe",
      email: "john.doe@example.com",
    };

    const token = jwt.sign(payload, secret, { expiresIn: "7d" });
    expect(token).toBeDefined();
    expect(typeof token).toBe("string");
  });

  it("should verify valid JWT token", () => {
    const payload = {
      id: "550e8400-e29b-41d4-a716-446655440000",
      username: "johndoe",
      email: "john.doe@example.com",
    };

    const token = jwt.sign(payload, secret, { expiresIn: "7d" });
    const decoded = jwt.verify(token, secret) as typeof payload;

    expect(decoded.id).toBe(payload.id);
    expect(decoded.username).toBe(payload.username);
    expect(decoded.email).toBe(payload.email);
  });

  it("should reject invalid JWT token", () => {
    const invalidToken = "invalid.token.here";

    expect(() => jwt.verify(invalidToken, secret)).toThrow();
  });

  it("should reject expired JWT token", () => {
    const payload = {
      id: "550e8400-e29b-41d4-a716-446655440000",
      username: "johndoe",
      email: "john.doe@example.com",
    };

    // Create an already expired token
    const token = jwt.sign(payload, secret, { expiresIn: "-1h" });

    expect(() => jwt.verify(token, secret)).toThrow(jwt.TokenExpiredError);
  });
});
