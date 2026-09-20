-- Create database
CREATE DATABASE IF NOT EXISTS nexuspay
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE nexuspay;

-- users table
CREATE TABLE IF NOT EXISTS users (
  id               BINARY(16)   NOT NULL,
  username         VARCHAR(30)  NOT NULL,
  first_name       VARCHAR(100) NOT NULL,
  last_name        VARCHAR(100) NOT NULL,
  email            VARCHAR(320) NOT NULL,
  password_hash    VARCHAR(255) NOT NULL,
  pin_hash         VARCHAR(255) NOT NULL DEFAULT '',
  kyc_status       ENUM('pending','verified','rejected') NOT NULL DEFAULT 'pending',
  reset_token      VARCHAR(64)  DEFAULT NULL,
  reset_token_expires BIGINT   DEFAULT NULL,
  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email    (email),
  UNIQUE KEY uq_users_username (username),
  KEY        idx_users_email   (email) USING BTREE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- accounts table
CREATE TABLE IF NOT EXISTS accounts (
  id             BINARY(16)    NOT NULL,
  user_id        BINARY(16)    NOT NULL,
  account_number VARCHAR(30)   NOT NULL,
  balance        DECIMAL(15,4) NOT NULL DEFAULT 0.0000,
  currency       CHAR(3)       NOT NULL,
  version_id     INT UNSIGNED  NOT NULL DEFAULT 0,
  created_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_accounts_number        (account_number),
  UNIQUE KEY uq_accounts_user_currency (user_id, currency),
  KEY        idx_accounts_user_id      (user_id) USING BTREE,
  CONSTRAINT fk_accounts_user
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT chk_accounts_balance CHECK (balance >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- transactions table (append-only ledger)
CREATE TABLE IF NOT EXISTS transactions (
  id                  BINARY(16)    NOT NULL,
  sender_account_id   BINARY(16)    NOT NULL,
  receiver_account_id BINARY(16)    NOT NULL,
  amount              DECIMAL(15,4) NOT NULL,
  currency            CHAR(3)       NOT NULL,
  transaction_type    ENUM('internal','wire','billpay') NOT NULL,
  status              ENUM('pending','completed','failed','reversed') NOT NULL DEFAULT 'pending',
  reference_id        VARCHAR(128)  DEFAULT NULL,
  created_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_txn_sender   (sender_account_id,   created_at) USING BTREE,
  KEY idx_txn_receiver (receiver_account_id, created_at) USING BTREE,
  KEY idx_txn_reference (reference_id),
  CONSTRAINT fk_txn_sender
    FOREIGN KEY (sender_account_id)   REFERENCES accounts (id) ON DELETE RESTRICT,
  CONSTRAINT fk_txn_receiver
    FOREIGN KEY (receiver_account_id) REFERENCES accounts (id) ON DELETE RESTRICT,
  CONSTRAINT chk_txn_amount CHECK (amount > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
