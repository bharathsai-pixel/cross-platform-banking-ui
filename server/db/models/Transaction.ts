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

export type TransactionStatus = "pending" | "completed" | "failed" | "reversed";
export type TransactionType = "internal" | "wire" | "billpay";

export class Transaction extends Model<
  InferAttributes<Transaction>,
  InferCreationAttributes<Transaction>
> {
  declare id: Buffer;
  declare sender_account_id: Buffer;
  declare receiver_account_id: Buffer;
  declare amount: string; // DECIMAL as string
  declare currency: string;
  declare transaction_type: TransactionType;
  declare status: CreationOptional<TransactionStatus>;
  declare reference_id: CreationOptional<string | null>;
  declare readonly created_at: CreationOptional<Date>;
}

Transaction.init(
  {
    id: { type: BINARY_16, primaryKey: true },
    sender_account_id: { type: BINARY_16, allowNull: false },
    receiver_account_id: { type: BINARY_16, allowNull: false },
    amount: { type: DataTypes.DECIMAL(15, 4), allowNull: false },
    currency: { type: DataTypes.CHAR(3), allowNull: false },
    transaction_type: {
      type: DataTypes.ENUM("internal", "wire", "billpay"),
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM("pending", "completed", "failed", "reversed"),
      allowNull: false,
      defaultValue: "pending",
    },
    reference_id: {
      type: DataTypes.STRING(128),
      allowNull: true,
      defaultValue: null,
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: "transactions",
    timestamps: false, // created_at is set once at insert; no updatedAt
    indexes: [
      { fields: ["sender_account_id", "created_at"], using: "BTREE" },
      { fields: ["receiver_account_id", "created_at"], using: "BTREE" },
    ],
  }
);

// ── Append-only enforcement ──────────────────────────────────────────────────
// Prevent ORM-level bulk mutations. Status transitions must go through
// dedicated service methods using raw parameterised UPDATE statements.

Transaction.addHook("beforeBulkUpdate", () => {
  throw new Error(
    "Transactions are immutable — use the transfer service for status updates"
  );
});

Transaction.addHook("beforeBulkDestroy", () => {
  throw new Error("Transactions cannot be deleted");
});
