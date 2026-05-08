-- pisonet_db.sql
-- Run this once to set up the database.
-- In phpMyAdmin: create a new database named pisonet_db, then import this file.

CREATE DATABASE IF NOT EXISTS pisonet_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE pisonet_db;

-- Stores each PC unit in the shop
CREATE TABLE IF NOT EXISTS machines (
  id               INT          AUTO_INCREMENT PRIMARY KEY,
  name             VARCHAR(50)  NOT NULL UNIQUE,
  mac              VARCHAR(20)  NOT NULL DEFAULT '' UNIQUE,
  status           ENUM('online', 'offline', 'idle') NOT NULL DEFAULT 'offline',
  cpu              FLOAT        NOT NULL DEFAULT 0,
  ram              FLOAT        NOT NULL DEFAULT 0,
  disk             FLOAT        NOT NULL DEFAULT 0,
  os               VARCHAR(50)  NOT NULL DEFAULT '',
  pesos_per_minute DECIMAL(4,2) NOT NULL DEFAULT 1.00,
  last_seen        DATETIME     DEFAULT NULL,
  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Stores each time a customer uses a PC (one row per session)
CREATE TABLE IF NOT EXISTS sessions (
  id           INT          AUTO_INCREMENT PRIMARY KEY,
  machine_name VARCHAR(50)  NOT NULL,
  pesos        DECIMAL(8,2) NOT NULL DEFAULT 0,
  started_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ended_at     DATETIME     DEFAULT NULL,
  duration_min INT          DEFAULT NULL
);

-- Stores CPU/RAM snapshots over time (one row per heartbeat)
CREATE TABLE IF NOT EXISTS metrics (
  id           INT         AUTO_INCREMENT PRIMARY KEY,
  machine_name VARCHAR(50) NOT NULL,
  cpu          FLOAT       NOT NULL DEFAULT 0,
  ram          FLOAT       NOT NULL DEFAULT 0,
  disk         FLOAT       NOT NULL DEFAULT 0,
  uptime       INT         NOT NULL DEFAULT 0,
  recorded_at  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_machine_time (machine_name, recorded_at)
);

-- Stores commands sent from the dashboard to a PC
CREATE TABLE IF NOT EXISTS commands (
  id           INT         AUTO_INCREMENT PRIMARY KEY,
  machine_name VARCHAR(50) NOT NULL,
  command      ENUM('shutdown', 'restart', 'lock', 'unlock') NOT NULL,
  status       ENUM('pending', 'executed', 'failed') NOT NULL DEFAULT 'pending',
  issued_by    VARCHAR(50) NOT NULL DEFAULT 'admin',
  issued_at    DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  executed_at  DATETIME    DEFAULT NULL
);

-- Admin and staff accounts
CREATE TABLE IF NOT EXISTS admins (
  id            INT          AUTO_INCREMENT PRIMARY KEY,
  username      VARCHAR(50)  NOT NULL UNIQUE,
  password      VARCHAR(255) NOT NULL,
  role          ENUM('admin', 'staff') NOT NULL DEFAULT 'staff',
  token         VARCHAR(64)  DEFAULT NULL,
  token_expires DATETIME     DEFAULT NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Default admin account (password: admin123 — change this after setup)
INSERT IGNORE INTO admins (username, password, role)
VALUES (
  'admin',
  '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
  'admin'
);

-- Alerts for offline machines, high CPU, high RAM, etc.
CREATE TABLE IF NOT EXISTS alerts (
  id           INT          AUTO_INCREMENT PRIMARY KEY,
  machine_name VARCHAR(50)  NOT NULL,
  type         ENUM('offline', 'cpu', 'ram', 'idle') NOT NULL,
  message      VARCHAR(255) NOT NULL,
  resolved     TINYINT(1)   NOT NULL DEFAULT 0,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Audit trail — tracks what admins and the system have done
CREATE TABLE IF NOT EXISTS logs (
  id         INT          AUTO_INCREMENT PRIMARY KEY,
  actor      VARCHAR(50)  NOT NULL,
  action     VARCHAR(100) NOT NULL,
  target     VARCHAR(100) NOT NULL DEFAULT '',
  detail     VARCHAR(255) NOT NULL DEFAULT '',
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Quick income summary views (used by the analytics tab later)
CREATE OR REPLACE VIEW income_today AS
  SELECT COALESCE(SUM(pesos), 0) AS total, COUNT(*) AS session_count
  FROM sessions WHERE DATE(started_at) = CURDATE();

CREATE OR REPLACE VIEW income_week AS
  SELECT COALESCE(SUM(pesos), 0) AS total, COUNT(*) AS session_count
  FROM sessions WHERE YEARWEEK(started_at, 1) = YEARWEEK(CURDATE(), 1);

CREATE OR REPLACE VIEW income_month AS
  SELECT COALESCE(SUM(pesos), 0) AS total, COUNT(*) AS session_count
  FROM sessions
  WHERE MONTH(started_at) = MONTH(CURDATE())
    AND YEAR(started_at)  = YEAR(CURDATE());
