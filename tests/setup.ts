/**
 * tests/setup.ts
 *
 * Global test setup and teardown.
 * Configures test environment, database connections, and test utilities.
 */

import { beforeAll, afterAll, beforeEach, afterEach } from "vitest";

// Set test environment
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test_jwt_secret_at_least_32_characters_long";
process.env.DB_MYSQL_HOST = "localhost";
process.env.DB_MYSQL_PORT = "3306";
process.env.DB_MYSQL_USER = "test_user";
process.env.DB_MYSQL_PASSWORD = "test_password";
process.env.DB_MYSQL_NAME = "nexuspay_test";
process.env.DB_MONGO_URI = "mongodb://localhost:27017/nexuspay_test";
process.env.EMAIL_DEV_PREVIEW = "true";

// Mock console.error in tests to reduce noise
const originalError = console.error;
beforeAll(() => {
  console.error = (...args: any[]) => {
    if (
      typeof args[0] === "string" &&
      (args[0].includes("[mysql]") || args[0].includes("[mongo]"))
    ) {
      return; // Suppress DB connection errors in tests
    }
    originalError.call(console, ...args);
  };
});

afterAll(() => {
  console.error = originalError;
});

// Global test utilities
declare global {
  var testUtils: {
    generateTestId: () => string;
    generateTestEmail: () => string;
    generateTestUsername: () => string;
    wait: (ms: number) => Promise<void>;
  };
}

globalThis.testUtils = {
  generateTestId: () => `test_${Date.now()}_${Math.random().toString(36).slice(2)}`,
  generateTestEmail: () => `test_${Date.now()}@example.com`,
  generateTestUsername: () => `user_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
  wait: (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)),
};
