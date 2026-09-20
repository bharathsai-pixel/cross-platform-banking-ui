/**
 * tests/unit/transfer.test.ts
 *
 * Unit tests for transfer validation logic.
 */

import { describe, it, expect } from "vitest";
import { transferSchema } from "../../server/validation/schemas.js";

describe("Transfer Validation", () => {
  describe("transferSchema", () => {
    it("should accept valid transfer data", () => {
      const input = {
        receiverAccountNumber: "1234-5678-9012-3456",
        amount: "100.50",
        currency: "USD",
        reference: "Invoice #123",
        note: "Payment for services",
      };

      const result = transferSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("should reject invalid receiver account number (too short)", () => {
      const input = {
        receiverAccountNumber: "1234567",
        amount: "100.00",
        currency: "USD",
      };

      const result = transferSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("should reject invalid amount format", () => {
      const input = {
        receiverAccountNumber: "1234-5678-9012-3456",
        amount: "not-a-number",
        currency: "USD",
      };

      const result = transferSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("should reject zero amount", () => {
      const input = {
        receiverAccountNumber: "1234-5678-9012-3456",
        amount: "0",
        currency: "USD",
      };

      const result = transferSchema.safeParse(input);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain("greater than 0");
      }
    });

    it("should reject negative amount", () => {
      const input = {
        receiverAccountNumber: "1234-5678-9012-3456",
        amount: "-50.00",
        currency: "USD",
      };

      const result = transferSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("should accept amounts with up to 4 decimal places", () => {
      const amounts = ["100.1234", "50.12", "25.1", "10"];

      amounts.forEach((amount) => {
        const input = {
          receiverAccountNumber: "1234-5678-9012-3456",
          amount,
          currency: "USD",
        };

        const result = transferSchema.safeParse(input);
        expect(result.success).toBe(true);
      });
    });

    it("should reject invalid currency code", () => {
      const input = {
        receiverAccountNumber: "1234-5678-9012-3456",
        amount: "100.00",
        currency: "US", // Too short
      };

      const result = transferSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("should reject lowercase currency code", () => {
      const input = {
        receiverAccountNumber: "1234-5678-9012-3456",
        amount: "100.00",
        currency: "usd", // Should be uppercase
      };

      const result = transferSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("should accept valid currency codes", () => {
      const currencies = ["USD", "EUR", "GBP", "JPY", "INR"];

      currencies.forEach((currency) => {
        const input = {
          receiverAccountNumber: "1234-5678-9012-3456",
          amount: "100.00",
          currency,
        };

        const result = transferSchema.safeParse(input);
        expect(result.success).toBe(true);
      });
    });

    it("should accept optional fields", () => {
      const input = {
        receiverAccountNumber: "1234-5678-9012-3456",
        amount: "100.00",
        currency: "USD",
        reference: "Ref-123",
        beneficiaryId: "550e8400-e29b-41d4-a716-446655440000",
        note: "Test note",
      };

      const result = transferSchema.safeParse(input);
      expect(result.success).toBe(true);
    });
  });
});
