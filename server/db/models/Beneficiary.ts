import {
  DataTypes,
  Model,
  InferAttributes,
  InferCreationAttributes,
  CreationOptional,
} from "sequelize";
import { sequelize } from "../mysql.js";

export class Beneficiary extends Model<
  InferAttributes<Beneficiary>,
  InferCreationAttributes<Beneficiary>
> {
  declare id: Buffer; // BINARY(16) UUID
  declare user_id: Buffer; // Owner of this beneficiary entry
  declare name: string;
  declare account_number: string;
  declare bank_name: CreationOptional<string | null>;
  declare bank_code: CreationOptional<string | null>; // Routing number, SWIFT, IFSC, etc.
  declare currency: CreationOptional<string>;
  declare nickname: CreationOptional<string | null>;
  declare is_favorite: CreationOptional<boolean>;
  declare readonly created_at: CreationOptional<Date>;
  declare readonly updated_at: CreationOptional<Date>;
}

Beneficiary.init(
  {
    id: { type: "BINARY(16)" as any, primaryKey: true },
    user_id: {
      type: "BINARY(16)" as any,
      allowNull: false,
      references: { model: "users", key: "id" },
    },
    name: { type: DataTypes.STRING(100), allowNull: false },
    account_number: { type: DataTypes.STRING(30), allowNull: false },
    bank_name: { type: DataTypes.STRING(100), allowNull: true },
    bank_code: { type: DataTypes.STRING(20), allowNull: true },
    currency: { type: DataTypes.CHAR(3), allowNull: false, defaultValue: "USD" },
    nickname: { type: DataTypes.STRING(50), allowNull: true },
    is_favorite: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    created_at: DataTypes.DATE,
    updated_at: DataTypes.DATE,
  },
  {
    sequelize,
    tableName: "beneficiaries",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    indexes: [
      { fields: ["user_id"], using: "BTREE" },
      { unique: true, fields: ["user_id", "account_number"] },
    ],
  }
);
