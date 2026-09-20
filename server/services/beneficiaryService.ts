/**
 * server/services/beneficiaryService.ts
 *
 * Beneficiary management service.
 * CRUD operations for saved payees.
 */

import { Beneficiary } from "../db/models/Beneficiary.js";
import { newUuid, uuidToBuffer, bufferToUuid } from "../utils/uuid.js";
import type { CreateBeneficiaryInput, UpdateBeneficiaryInput } from "../validation/schemas.js";

export interface BeneficiaryResponse {
  id: string;
  name: string;
  accountNumber: string;
  bankName: string | null;
  bankCode: string | null;
  currency: string;
  nickname: string | null;
  isFavorite: boolean;
  createdAt: Date;
}

/**
 * Create a new beneficiary for a user.
 */
export async function createBeneficiary(
  userId: string,
  input: CreateBeneficiaryInput
): Promise<BeneficiaryResponse> {
  const { name, accountNumber, bankName, bankCode, currency, nickname, isFavorite } = input;

  // Check if beneficiary already exists
  const existing = await Beneficiary.findOne({
    where: {
      user_id: uuidToBuffer(userId),
      account_number: accountNumber.trim(),
    },
  });

  if (existing) {
    throw new Error("BENEFICIARY_EXISTS");
  }

  const beneficiaryUuid = newUuid();

  const beneficiary = await Beneficiary.create({
    id: beneficiaryUuid.buffer,
    user_id: uuidToBuffer(userId),
    name: name.trim(),
    account_number: accountNumber.trim(),
    bank_name: bankName?.trim() || null,
    bank_code: bankCode?.trim() || null,
    currency: currency || "USD",
    nickname: nickname?.trim() || null,
    is_favorite: isFavorite || false,
  });

  return {
    id: beneficiaryUuid.uuid,
    name: beneficiary.name,
    accountNumber: beneficiary.account_number,
    bankName: beneficiary.bank_name,
    bankCode: beneficiary.bank_code,
    currency: beneficiary.currency,
    nickname: beneficiary.nickname,
    isFavorite: beneficiary.is_favorite,
    createdAt: beneficiary.created_at,
  };
}

/**
 * Get all beneficiaries for a user.
 */
export async function getUserBeneficiaries(userId: string): Promise<BeneficiaryResponse[]> {
  const beneficiaries = await Beneficiary.findAll({
    where: { user_id: uuidToBuffer(userId) },
    order: [
      ["is_favorite", "DESC"],
      ["name", "ASC"],
    ],
  });

  return beneficiaries.map((b) => ({
    id: bufferToUuid(b.id),
    name: b.name,
    accountNumber: b.account_number,
    bankName: b.bank_name,
    bankCode: b.bank_code,
    currency: b.currency,
    nickname: b.nickname,
    isFavorite: b.is_favorite,
    createdAt: b.created_at,
  }));
}

/**
 * Get a single beneficiary by ID.
 */
export async function getBeneficiaryById(
  beneficiaryId: string,
  userId: string
): Promise<BeneficiaryResponse | null> {
  const beneficiary = await Beneficiary.findOne({
    where: {
      id: uuidToBuffer(beneficiaryId),
      user_id: uuidToBuffer(userId),
    },
  });

  if (!beneficiary) return null;

  return {
    id: bufferToUuid(beneficiary.id),
    name: beneficiary.name,
    accountNumber: beneficiary.account_number,
    bankName: beneficiary.bank_name,
    bankCode: beneficiary.bank_code,
    currency: beneficiary.currency,
    nickname: beneficiary.nickname,
    isFavorite: beneficiary.is_favorite,
    createdAt: beneficiary.created_at,
  };
}

/**
 * Update a beneficiary.
 */
export async function updateBeneficiary(
  beneficiaryId: string,
  userId: string,
  input: UpdateBeneficiaryInput
): Promise<BeneficiaryResponse> {
  const beneficiary = await Beneficiary.findOne({
    where: {
      id: uuidToBuffer(beneficiaryId),
      user_id: uuidToBuffer(userId),
    },
  });

  if (!beneficiary) {
    throw new Error("BENEFICIARY_NOT_FOUND");
  }

  await beneficiary.update({
    name: input.name?.trim() ?? beneficiary.name,
    bank_name: input.bankName?.trim() ?? beneficiary.bank_name,
    bank_code: input.bankCode?.trim() ?? beneficiary.bank_code,
    nickname: input.nickname?.trim() ?? beneficiary.nickname,
    is_favorite: input.isFavorite ?? beneficiary.is_favorite,
  });

  return {
    id: bufferToUuid(beneficiary.id),
    name: beneficiary.name,
    accountNumber: beneficiary.account_number,
    bankName: beneficiary.bank_name,
    bankCode: beneficiary.bank_code,
    currency: beneficiary.currency,
    nickname: beneficiary.nickname,
    isFavorite: beneficiary.is_favorite,
    createdAt: beneficiary.created_at,
  };
}

/**
 * Delete a beneficiary.
 */
export async function deleteBeneficiary(
  beneficiaryId: string,
  userId: string
): Promise<void> {
  const result = await Beneficiary.destroy({
    where: {
      id: uuidToBuffer(beneficiaryId),
      user_id: uuidToBuffer(userId),
    },
  });

  if (result === 0) {
    throw new Error("BENEFICIARY_NOT_FOUND");
  }
}
