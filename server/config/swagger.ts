/**
 * server/config/swagger.ts
 *
 * OpenAPI/Swagger configuration.
 * API documentation generated alongside the code.
 */

import swaggerJsdoc from "swagger-jsdoc";

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: "3.0.3",
    info: {
      title: "NexusPay Banking API",
      version: "1.0.0",
      description:
        "Cross-Platform Transaction Application for Banking & FinTech. " +
        "A complete banking backend with polyglot persistence (MySQL + MongoDB), " +
        "JWT authentication, fund transfers, beneficiaries, notifications, and similarity-based search.",
      contact: {
        name: "API Support",
        email: "support@nexuspay.com",
      },
    },
    servers: [
      {
        url: "http://localhost:3001/api",
        description: "Development server",
      },
      {
        url: "https://api.nexuspay.com/api",
        description: "Production server",
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "JWT access token obtained from /api/auth/login or /api/auth/register",
        },
      },
      schemas: {
        User: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid", example: "550e8400-e29b-41d4-a716-446655440000" },
            username: { type: "string", example: "john.doe" },
            firstName: { type: "string", example: "John" },
            lastName: { type: "string", example: "Doe" },
            email: { type: "string", format: "email", example: "john.doe@example.com" },
          },
        },
        Account: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            accountNumber: { type: "string", example: "4521-0000-0000-7890" },
            balance: { type: "string", example: "1250.5000" },
            currency: { type: "string", example: "USD" },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        Transaction: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            amount: { type: "string", example: "100.0000" },
            currency: { type: "string", example: "USD" },
            transactionType: { type: "string", enum: ["internal", "wire", "billpay"] },
            status: { type: "string", enum: ["pending", "completed", "failed", "reversed"] },
            referenceId: { type: "string", example: "TXN-ABC123" },
            direction: { type: "string", enum: ["outgoing", "incoming"] },
            counterpartyAccountNumber: { type: "string" },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        Beneficiary: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            name: { type: "string", example: "Jane Smith" },
            accountNumber: { type: "string", example: "1234-5678-9012-3456" },
            bankName: { type: "string", example: "Chase Bank" },
            bankCode: { type: "string", example: "071000013" },
            currency: { type: "string", example: "USD" },
            nickname: { type: "string", example: "Mom" },
            isFavorite: { type: "boolean" },
          },
        },
        Notification: {
          type: "object",
          properties: {
            id: { type: "string" },
            type: { type: "string", enum: ["transaction", "security", "system", "promo"] },
            priority: { type: "string", enum: ["low", "normal", "high", "urgent"] },
            title: { type: "string", example: "Funds Received" },
            message: { type: "string", example: "You received USD 100.00" },
            read: { type: "boolean" },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        Error: {
          type: "object",
          properties: {
            error: { type: "string", example: "Validation failed" },
            details: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  field: { type: "string" },
                  message: { type: "string" },
                },
              },
            },
          },
        },
      },
    },
    tags: [
      { name: "Auth", description: "Authentication endpoints" },
      { name: "Accounts", description: "Account management" },
      { name: "Transactions", description: "Fund transfers and transaction history" },
      { name: "Beneficiaries", description: "Saved payees management" },
      { name: "Notifications", description: "User notifications and alerts" },
      { name: "Search", description: "Similarity-based search across transactions and activity" },
    ],
  },
  apis: ["./server/routes/*.ts", "./server/routes/*.js"],
};

export const swaggerSpec = swaggerJsdoc(options);

/**
 * Generate Swagger spec as JSON for export.
 */
export function getSwaggerJson(): object {
  return swaggerSpec;
}
