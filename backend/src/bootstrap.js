const pool = require("./db");

const statements = [
  `CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`,
  `ALTER TABLE categories ADD COLUMN IF NOT EXISTS category_key VARCHAR(120)`,
  `ALTER TABLE categories ADD COLUMN IF NOT EXISTS group_key VARCHAR(120)`,
  `ALTER TABLE categories ADD COLUMN IF NOT EXISTS parent_category_key VARCHAR(120)`,
  `ALTER TABLE categories ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT FALSE`,
  `UPDATE categories
     SET category_key = LOWER(REGEXP_REPLACE(name, '[^a-zA-Z0-9]+', '-', 'g'))
   WHERE category_key IS NULL OR category_key = ''`,
  `CREATE TABLE IF NOT EXISTS category_groups (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      group_key VARCHAR(120) NOT NULL,
      name VARCHAR(120) NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      color VARCHAR(20) NOT NULL DEFAULT '#7dd3fc',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, group_key)
    )`,
  `CREATE TABLE IF NOT EXISTS categorization_rules (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(160) NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      criteria JSONB NOT NULL DEFAULT '[]'::jsonb,
      actions JSONB NOT NULL DEFAULT '[]'::jsonb,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      source VARCHAR(20) NOT NULL DEFAULT 'user',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
  `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS custom_direction VARCHAR(20)`,
  `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS hidden_from_budget BOOLEAN NOT NULL DEFAULT FALSE`,
  `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS recurring BOOLEAN NOT NULL DEFAULT FALSE`,
  `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS notes TEXT`,
  `CREATE TABLE IF NOT EXISTS transaction_tags (
      transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
      tag_key VARCHAR(120) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (transaction_id, tag_key)
    )`,
  `CREATE TABLE IF NOT EXISTS account_balance_snapshots (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      captured_on DATE NOT NULL DEFAULT CURRENT_DATE,
      current_balance NUMERIC(14,2) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (account_id, captured_on)
    )`,
  `CREATE INDEX IF NOT EXISTS idx_category_groups_user ON category_groups(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_rules_user ON categorization_rules(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_transaction_tags_transaction ON transaction_tags(transaction_id)`,
  `CREATE INDEX IF NOT EXISTS idx_account_balance_snapshots_account_date ON account_balance_snapshots(account_id, captured_on DESC)`,
];

async function ensureBootstrap() {
  for (const statement of statements) {
    await pool.query(statement);
  }
}

module.exports = { ensureBootstrap };
