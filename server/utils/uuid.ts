/**
 * server/utils/uuid.ts
 *
 * UUID v4 generation for MySQL BINARY(16) columns.
 * Uses crypto.randomUUID() for secure, random UUIDs.
 */

import { randomUUID } from "crypto";

/**
 * Generate a UUID v4 string (36 chars: 8-4-4-4-12 format).
 */
export function generateUuid(): string {
  return randomUUID();
}

/**
 * Convert a UUID string to a 16-byte Buffer for MySQL BINARY(16) storage.
 * Removes dashes and parses as hex.
 *
 * @param uuid - UUID string like "550e8400-e29b-41d4-a716-446655440000"
 * @returns 16-byte Buffer
 */
export function uuidToBuffer(uuid: string): Buffer {
  const hex = uuid.replace(/-/g, "");
  if (hex.length !== 32) {
    throw new Error(`Invalid UUID: ${uuid}`);
  }
  return Buffer.from(hex, "hex");
}

/**
 * Convert a 16-byte Buffer (from MySQL BINARY(16)) to a UUID string.
 *
 * @param buffer - 16-byte Buffer
 * @returns UUID string in 8-4-4-4-12 format
 */
export function bufferToUuid(buffer: Buffer): string {
  if (buffer.length !== 16) {
    throw new Error(`Invalid buffer length: ${buffer.length}, expected 16`);
  }
  const hex = buffer.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Generate a new UUID and return both string and Buffer forms.
 */
export function newUuid(): { uuid: string; buffer: Buffer } {
  const uuid = generateUuid();
  return { uuid, buffer: uuidToBuffer(uuid) };
}
