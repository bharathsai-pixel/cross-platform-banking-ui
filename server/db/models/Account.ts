/**
 * server/db/models/Account.ts
 *
 * Sequelize model for the `accounts` table.
 *
 * Key design decisions:
 *   • `balance` is declared as `string` — Sequelize reads DECIMAL(15,4) columns
 *     as strings by default, which prevents JavaScript floating-point rounding
 *     errors.  Use `decimal.js` or similar when performing arithmetic.
 *   • `version_id` is an optimistic-lock counter.  The transfer service issues
 *     a raw parameterised UPDATE … WHERE version_id = :v and checks
 *     affectedRows; if 0, it retries with fresh data.
 *   • `created_at` / `updated_at` are mapped to snake_case column names via
 *     `createdAt` / `updatedAt` options — Sequelize handles the mapping.
 */

import {
  DataTypes,
  Model,
  InferAttributes,
  InferCreationAttributes,
  CreationOptional,
} from "sequelize";
import { sequelize } from "../mysql.js";

export class Account extends Model<
  InferAttributes<Account>,
  InferCreationAttributes<Account>
> {
  declare id: Buffer; // BINARY(16) UUID
  declare user_id: Buffer;
  declare account_number: string;
  declare balance: string; // DECIMAL stored as string to preserve precision
  declare currency: string; // ISO 4217
  declare version_id: CreationOptional<number>;
  declare readonly created_at: CreationOptional<Date>;
  declare readonly updated_at: CreationOptional<Date>;
}

Account.init(
  {
    id: { type: DataTypes.BINARY(16), primaryKey: true },
    user_id: {
      type: DataTypes.BINARY(16),
      allowNull: false,
      references: { model: "users", key: "id" },
    },
    account_number: {
      type: DataTypes.STRING(30),
      allowNull: false,
      unique: true,
    },
    balance: {
      type: DataTypes.DECIMAL(15, 4),
      allowNull: false,
      defaultValue: "0.0000",
    },
    currency: { type: DataTypes.CHAR(3), allowNull: false },
    version_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 0,
    },
    created_at: DataTypes.DATE,
    updated_at: DataTypes.DATE,
  },
  {
    sequelize,
    tableName: "accounts",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    indexes: [
      { fields: ["user_id"], using: "BTREE" },
      { unique: true, fields: ["user_id", "currency"] },
    ],
  }
);
