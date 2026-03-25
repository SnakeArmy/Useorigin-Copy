-- ============================================================
-- UseOrigin — PostgreSQL Schema Initialisation
-- Runs automatically on first container start via
-- docker-entrypoint-initdb.d
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Users ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            VARCHAR(120)  NOT NULL,
    email           VARCHAR(255)  UNIQUE NOT NULL,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Seed the household (single-user / couple setup)
INSERT INTO users (name, email) VALUES
    ('Emil',    'emil@useorigin.local'),
    ('Adelisa', 'adelisa@useorigin.local')
ON CONFLICT (email) DO NOTHING;

-- ── Teller Enrollments ────────────────────────────────────
CREATE TABLE IF NOT EXISTS teller_enrollments (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    enrollment_id   VARCHAR(255)  UNIQUE NOT NULL,
    access_token    VARCHAR(255)  NOT NULL,
    institution_id  VARCHAR(50),
    institution_name VARCHAR(255),
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_teller_enrollments_user ON teller_enrollments(user_id);

-- ── Accounts ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS accounts (
    id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    teller_enrollment_id UUID          NOT NULL REFERENCES teller_enrollments(id) ON DELETE CASCADE,
    teller_account_id    VARCHAR(255)  UNIQUE NOT NULL,
    name                 VARCHAR(255)  NOT NULL,
    type                 VARCHAR(50)   NOT NULL,   -- depository, credit
    subtype              VARCHAR(50),               -- checking, savings, credit_card, etc.
    last_four            VARCHAR(10),               -- last 4 digits
    currency             VARCHAR(3)    DEFAULT 'USD',
    current_balance      NUMERIC(14,2) DEFAULT 0,
    available_balance    NUMERIC(14,2),
    status               VARCHAR(20)   DEFAULT 'open',
    created_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_accounts_enrollment ON accounts(teller_enrollment_id);

-- ── Transactions ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transactions (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id              UUID          NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    teller_transaction_id   VARCHAR(255)  UNIQUE NOT NULL,
    amount                  NUMERIC(14,2) NOT NULL,
    date                    DATE          NOT NULL,
    description             VARCHAR(512)  NOT NULL,   -- raw bank description
    category                VARCHAR(255),              -- Teller enriched category
    custom_category         VARCHAR(255),              -- user override
    counterparty_name       VARCHAR(255),              -- enriched counterparty
    counterparty_type       VARCHAR(50),               -- person or organization
    status                  VARCHAR(20)   DEFAULT 'posted',  -- posted or pending
    type                    VARCHAR(50),               -- card_payment, transfer, etc.
    running_balance         NUMERIC(14,2),
    created_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_transactions_account ON transactions(account_id);
CREATE INDEX idx_transactions_date    ON transactions(date DESC);

-- ── Assets (manual net-worth entries) ─────────────────────
CREATE TABLE IF NOT EXISTS assets (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name            VARCHAR(255)  NOT NULL,
    type            VARCHAR(50)   NOT NULL,   -- property, vehicle, investment, crypto, other
    value           NUMERIC(14,2) NOT NULL DEFAULT 0,
    notes           TEXT,
    as_of_date      DATE          NOT NULL DEFAULT CURRENT_DATE,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_assets_user ON assets(user_id);

-- ── Categories (user-defined overrides & budgets) ─────────
CREATE TABLE IF NOT EXISTS categories (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name            VARCHAR(120)  NOT NULL,       -- e.g. "Newborn Expenses"
    color           VARCHAR(7)    DEFAULT '#6366f1',  -- hex for charts
    icon            VARCHAR(50),                   -- optional icon key
    monthly_budget  NUMERIC(14,2),                 -- nullable = no budget
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, name)
);

CREATE INDEX idx_categories_user ON categories(user_id);

-- Seed some starter categories
INSERT INTO categories (user_id, name, color, icon, monthly_budget)
SELECT u.id, cat.name, cat.color, cat.icon, cat.budget
FROM users u
CROSS JOIN (VALUES
    ('Groceries',          '#22c55e', 'shopping-cart', 800),
    ('Dining Out',         '#f97316', 'utensils',      300),
    ('Gas & Transport',    '#3b82f6', 'car',           250),
    ('Newborn Expenses',   '#ec4899', 'baby',          500),
    ('Subscriptions',      '#8b5cf6', 'credit-card',   150),
    ('Utilities',          '#06b6d4', 'zap',           200),
    ('Entertainment',      '#eab308', 'film',          100),
    ('Healthcare',         '#ef4444', 'heart',         200),
    ('Shopping',           '#14b8a6', 'shopping-bag',  200),
    ('Income',             '#10b981', 'dollar-sign',   NULL)
) AS cat(name, color, icon, budget)
WHERE u.email = 'emil@useorigin.local'
ON CONFLICT (user_id, name) DO NOTHING;
