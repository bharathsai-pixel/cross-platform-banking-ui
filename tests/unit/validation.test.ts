/**
 * tests/unit/validation.test.ts
 *
 * Unit tests for validation schemas and middleware.
 */

import { describe, it, expect } from "vitest";
import {
  createAccountSchema,
  createBeneficiarySchema,
  searchSchema,
  transactionQuerySchema,
} from "../../server/validation/schemas.js";

describe("Account Validation", () => {
  describe("createAccountSchema", () => {
    it("should accept valid account creation data", () => {
      const input = {
        currency: "USD",
        accountNumber: "1234-5678-9012-3456",
        initialBalance: "1000.00",
      };

      const result = createAccountSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("should use default values for optional fields", () => {
      const input = {
        currency: "EUR",
      };

      const result = createAccountSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.initialBalance).toBe("0");
      }
    });

    it("should reject invalid currency code", () => {
      const input = {
        currency: "US",
      };

      const result = createAccountSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });
});

describe("Beneficiary Validation", () => {
  describe("createBeneficiarySchema", () => {
    it("should accept valid beneficiary data", () => {
      const input = {
        name: "John Doe",
        accountNumber: "1234-5678-9012-3456",
        bankName: "Chase Bank",
        bankCode: "071000013",
        currency: "USD",
        nickname: "My Friend",
        isFavorite: true,
      };

      const result = createBeneficiarySchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("should accept minimal required fields", () => {
      const input = {
        name: "Jane Smith",
        accountNumber: "9876-5432-1098-7654",
      };

      const result = createBeneficiarySchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("should reject missing required fields", () => {
      const input = {
        bankName: "Bank",
      };

      const result = createBeneficiarySchema.safeParse(input);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors.some((e) => e.path.includes("name"))).toBe(true);
        expect(result.error.errors.some((e) => e.path.includes("accountNumber"))).toBe(true);
      }
    });
  });
});

describe("Search Validation", () => {
  describe("searchSchema", () => {
    it("should accept valid search query", () => {
      const input = {
        q: "payment transfer",
        type: "all",
        limit: 20,
        threshold: 0.3,
      };

      const result = searchSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("should use default values", () => {
      const input = {
        q: "test search",
      };

      const result = searchSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe("all");
        expect(result.data.limit).toBe(20);
        expect(result.data.threshold).toBe(0.3);
      }
    });

    it("should reject empty search query", () => {
      const input = {
        q: "",
      };

      const result = searchSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("should reject search query longer than 200 characters", () => {
      const input = {
        q: "a".repeat(201),
      };

      const result = searchSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("should reject limit > 50", () => {
      const input = {
        q: "test",
        limit: 100,
      };

      const result = searchSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("should reject threshold outside 0-1 range", () => {
      const inputs = [
        { q: "test", threshold: 1.5 },
        { q: "test", threshold: -0.5 },
      ];

      inputs.forEach((input) => {
        const result = searchSchema.safeParse(input);
        expect(result.success).toBe(false);
      });
    });
  });
});

describe("Transaction Query Validation", () => {
  describe("transactionQuerySchema", () => {
    it("should accept valid query parameters", () => {
      const input = {
        page: 1,
        limit: 20,
        type: "internal",
        status: "completed",
      };

      const result = transactionQuerySchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("should coerce string to number", () => {
      const input = {
        page: "2",
        limit: "50",
      };

      const result = transactionQuerySchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(typeof result.data.page).toBe("number");
        expect(typeof result.data.limit).toBe("number");
      }
    });

    it("should reject limit > 100", () => {
      const input = {
        page: 1,
        limit: 200,
      };

      const result = transactionQuerySchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("should reject invalid type", () => {
      const input = {
        type: "invalid",
      };

      const result = transactionQuerySchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("should reject invalid status", () => {
      const input = {
        status: "processing",
      };

      const result = transactionQuerySchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });
});
