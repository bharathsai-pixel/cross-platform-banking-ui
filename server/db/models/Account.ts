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

// Use STRING(16) with BINARY attribute for UUID storage
Account.init(
  {
    id: { type: DataTypes.STRING(16), primaryKey: true },
    user_id: {
      type: DataTypes.STRING(16),
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
