import {
  DataTypes,
  Model,
  InferAttributes,
  InferCreationAttributes,
  CreationOptional,
} from "sequelize";
import { sequelize } from "../mysql.js";

// DataTypes.BINARY is absent from Sequelize v6's bundled type definitions for
// this package version.  Casting a raw SQL string to AbstractDataType lets
// Sequelize pass it through to the MySQL dialect unchanged.
const BINARY_16 = DataTypes.STRING(16);

export type KycStatus = "pending" | "verified" | "rejected";

export class User extends Model<
  InferAttributes<User>,
  InferCreationAttributes<User>
> {
  declare id: Buffer; // BINARY(16) UUID
  declare username: string;
  declare first_name: string;
  declare last_name: string;
  declare email: string;
  declare password_hash: string;
  declare pin_hash: CreationOptional<string>;
  declare kyc_status: CreationOptional<KycStatus>;
  declare reset_token: CreationOptional<string | null>;
  declare reset_token_expires: CreationOptional<number | null>;
  declare readonly created_at: CreationOptional<Date>;
  declare readonly updated_at: CreationOptional<Date>;
}

User.init(
  {
    id: { type: BINARY_16, primaryKey: true },
    username: { type: DataTypes.STRING(30), allowNull: false, unique: true },
    first_name: { type: DataTypes.STRING(100), allowNull: false },
    last_name: { type: DataTypes.STRING(100), allowNull: false },
    email: { type: DataTypes.STRING(320), allowNull: false, unique: true },
    password_hash: { type: DataTypes.STRING(255), allowNull: false },
    pin_hash: {
      type: DataTypes.STRING(255),
      allowNull: false,
      defaultValue: "",
    },
    kyc_status: {
      type: DataTypes.ENUM("pending", "verified", "rejected"),
      allowNull: false,
      defaultValue: "pending",
    },
    reset_token: {
      type: DataTypes.STRING(64),
      allowNull: true,
      defaultValue: null,
    },
    reset_token_expires: {
      type: DataTypes.BIGINT,
      allowNull: true,
      defaultValue: null,
    },
    created_at: DataTypes.DATE,
    updated_at: DataTypes.DATE,
  },
  {
    sequelize,
    tableName: "users",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    indexes: [{ fields: ["email"], using: "BTREE" }],
  }
);
