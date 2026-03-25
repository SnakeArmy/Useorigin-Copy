const express = require("express");
const router = express.Router();
const pool = require("../db");

function clampInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function toKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function getPrimaryUserId(client) {
  const result = await client.query(
    "SELECT id FROM users ORDER BY created_at ASC, name ASC LIMIT 1",
  );
  return result.rows[0]?.id ?? null;
}

async function getWorkspacePayload(client, days) {
  const usersResult = await client.query(
    "SELECT id, name, email, created_at FROM users ORDER BY created_at ASC, name ASC",
  );
  const primaryUserId = usersResult.rows[0]?.id ?? null;

  const [
    accountsResult,
    transactionsResult,
    categoriesResult,
    categoryGroupsResult,
    rulesResult,
    assetsResult,
    snapshotsResult,
  ] = await Promise.all([
    client.query(
      `SELECT
          a.id,
          te.user_id,
          a.name,
          a.type,
          a.subtype,
          a.last_four,
          a.current_balance,
          a.available_balance,
          a.status,
          te.institution_name,
          a.updated_at
        FROM accounts a
        JOIN teller_enrollments te ON te.id = a.teller_enrollment_id
        ORDER BY te.user_id, a.type, a.name`,
    ),
    client.query(
      `SELECT
          t.id,
          te.user_id,
          t.account_id,
          t.amount,
          t.date,
          t.description,
          t.category,
          t.custom_category,
          t.counterparty_name,
          t.counterparty_type,
          t.status,
          t.type,
          t.custom_direction,
          t.hidden_from_budget,
          t.recurring,
          t.notes,
          a.name AS account_name,
          a.type AS account_type,
          a.subtype AS account_subtype,
          a.last_four AS account_last_four,
          COALESCE(tag_data.tag_keys, ARRAY[]::varchar[]) AS tag_keys
        FROM transactions t
        JOIN accounts a ON a.id = t.account_id
        JOIN teller_enrollments te ON te.id = a.teller_enrollment_id
        LEFT JOIN LATERAL (
          SELECT ARRAY_AGG(tt.tag_key ORDER BY tt.tag_key) AS tag_keys
          FROM transaction_tags tt
          WHERE tt.transaction_id = t.id
        ) tag_data ON TRUE
        WHERE t.date >= CURRENT_DATE - ($1 || ' days')::INTERVAL
        ORDER BY t.date DESC, t.created_at DESC, t.description ASC`,
      [days],
    ),
    primaryUserId
      ? client.query(
          `SELECT
              id,
              user_id,
              name,
              color,
              icon,
              monthly_budget,
              category_key,
              group_key,
              parent_category_key,
              created_at,
              updated_at
            FROM categories
            WHERE user_id = $1
            ORDER BY created_at ASC, name ASC`,
          [primaryUserId],
        )
      : Promise.resolve({ rows: [] }),
    primaryUserId
      ? client.query(
          `SELECT
              id,
              user_id,
              group_key,
              name,
              description,
              color,
              created_at,
              updated_at
            FROM category_groups
            WHERE user_id = $1
            ORDER BY created_at ASC, name ASC`,
          [primaryUserId],
        )
      : Promise.resolve({ rows: [] }),
    primaryUserId
      ? client.query(
          `SELECT
              id,
              user_id,
              name,
              description,
              criteria,
              actions,
              enabled,
              source,
              created_at,
              updated_at
            FROM categorization_rules
            WHERE user_id = $1
            ORDER BY created_at DESC, name ASC`,
          [primaryUserId],
        )
      : Promise.resolve({ rows: [] }),
    client.query(
      `SELECT
          id,
          user_id,
          name,
          type,
          value,
          notes,
          as_of_date,
          created_at,
          updated_at
        FROM assets
        ORDER BY as_of_date DESC, created_at DESC`,
    ),
    client.query(
      `SELECT
          abs.account_id,
          abs.captured_on,
          abs.current_balance,
          te.user_id
        FROM account_balance_snapshots abs
        JOIN accounts a ON a.id = abs.account_id
        JOIN teller_enrollments te ON te.id = a.teller_enrollment_id
        WHERE abs.captured_on >= CURRENT_DATE - ($1 || ' days')::INTERVAL
        ORDER BY abs.captured_on ASC, abs.account_id ASC`,
      [days],
    ),
  ]);

  return {
    meta: {
      generated_at: new Date().toISOString(),
      primary_user_id: primaryUserId,
      days,
    },
    users: usersResult.rows,
    accounts: accountsResult.rows,
    transactions: transactionsResult.rows,
    categories: categoriesResult.rows,
    category_groups: categoryGroupsResult.rows,
    rules: rulesResult.rows.map((rule) => ({
      ...rule,
      criteria: Array.isArray(rule.criteria) ? rule.criteria : [],
      actions: Array.isArray(rule.actions) ? rule.actions : [],
    })),
    assets: assetsResult.rows,
    account_snapshots: snapshotsResult.rows,
  };
}

router.get("/", async (req, res) => {
  const client = await pool.connect();

  try {
    const days = clampInteger(req.query.days, 365, 30, 730);
    const payload = await getWorkspacePayload(client, days);
    res.json(payload);
  } catch (err) {
    console.error("[Workspace] GET error:", err.message);
    res.status(500).json({ error: "Failed to build workspace", detail: err.message });
  } finally {
    client.release();
  }
});

router.post("/category-groups", async (req, res) => {
  const client = await pool.connect();

  try {
    const userId = req.body.user_id || (await getPrimaryUserId(client));
    const name = String(req.body.name || "").trim();
    const description = String(req.body.description || "").trim();
    const color = String(req.body.color || "#7dd3fc").trim();
    const groupKey = toKey(req.body.group_key || name);

    if (!userId || !name || !groupKey) {
      return res.status(400).json({ error: "user_id and name are required" });
    }

    const result = await client.query(
      `INSERT INTO category_groups (user_id, group_key, name, description, color)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, group_key) DO UPDATE SET
         name = EXCLUDED.name,
         description = EXCLUDED.description,
         color = EXCLUDED.color,
         updated_at = NOW()
       RETURNING *`,
      [userId, groupKey, name, description, color],
    );

    res.status(201).json({ category_group: result.rows[0] });
  } catch (err) {
    console.error("[Workspace] POST category-groups error:", err.message);
    res.status(500).json({ error: "Failed to save category group", detail: err.message });
  } finally {
    client.release();
  }
});

router.post("/categories", async (req, res) => {
  const client = await pool.connect();

  try {
    const userId = req.body.user_id || (await getPrimaryUserId(client));
    const name = String(req.body.name || "").trim();
    const color = String(req.body.color || "#7dd3fc").trim();
    const icon = String(req.body.icon || "layers-3").trim();
    const categoryKey = toKey(req.body.category_key || name);
    const groupKey = String(req.body.group_key || "grp_admin").trim();
    const parentCategoryKey = req.body.parent_category_key
      ? String(req.body.parent_category_key).trim()
      : null;
    const budgetValue = req.body.monthly_budget;
    const monthlyBudget =
      budgetValue === undefined || budgetValue === null || budgetValue === ""
        ? null
        : Number(budgetValue);

    if (!userId || !name || !categoryKey) {
      return res.status(400).json({ error: "user_id and name are required" });
    }

    const result = await client.query(
      `INSERT INTO categories (user_id, name, color, icon, monthly_budget, category_key, group_key, parent_category_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (user_id, name) DO UPDATE SET
         color = EXCLUDED.color,
         icon = EXCLUDED.icon,
         monthly_budget = EXCLUDED.monthly_budget,
         category_key = EXCLUDED.category_key,
         group_key = EXCLUDED.group_key,
         parent_category_key = EXCLUDED.parent_category_key,
         updated_at = NOW()
       RETURNING *`,
      [userId, name, color, icon, monthlyBudget, categoryKey, groupKey, parentCategoryKey],
    );

    res.status(201).json({ category: result.rows[0] });
  } catch (err) {
    console.error("[Workspace] POST categories error:", err.message);
    res.status(500).json({ error: "Failed to save category", detail: err.message });
  } finally {
    client.release();
  }
});

router.post("/rules", async (req, res) => {
  const client = await pool.connect();

  try {
    const userId = req.body.user_id || (await getPrimaryUserId(client));
    const name = String(req.body.name || "").trim();
    const description = String(req.body.description || "").trim();
    const enabled = req.body.enabled !== false;
    const source = String(req.body.source || "user").trim();
    const criteria = Array.isArray(req.body.criteria) ? req.body.criteria : [];
    const actions = Array.isArray(req.body.actions) ? req.body.actions : [];

    if (!userId || !name) {
      return res.status(400).json({ error: "user_id and name are required" });
    }

    const result = await client.query(
      `INSERT INTO categorization_rules (user_id, name, description, criteria, actions, enabled, source)
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7)
       RETURNING *`,
      [userId, name, description, JSON.stringify(criteria), JSON.stringify(actions), enabled, source],
    );

    res.status(201).json({
      rule: {
        ...result.rows[0],
        criteria,
        actions,
      },
    });
  } catch (err) {
    console.error("[Workspace] POST rules error:", err.message);
    res.status(500).json({ error: "Failed to save rule", detail: err.message });
  } finally {
    client.release();
  }
});

router.patch("/transactions/bulk", async (req, res) => {
  const client = await pool.connect();

  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids.filter(Boolean) : [];
    const changes = req.body.changes || {};

    if (!ids.length) {
      return res.status(400).json({ error: "ids are required" });
    }

    await client.query("BEGIN");
    for (const id of ids) {
      await applyTransactionPatch(client, id, changes);
    }
    await client.query("COMMIT");

    res.json({ success: true, updated: ids.length });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[Workspace] PATCH transactions/bulk error:", err.message);
    res.status(500).json({ error: "Failed to bulk update transactions", detail: err.message });
  } finally {
    client.release();
  }
});

router.patch("/transactions/:id", async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const transaction = await applyTransactionPatch(client, req.params.id, req.body || {});
    await client.query("COMMIT");

    if (!transaction) {
      return res.status(404).json({ error: "Transaction not found" });
    }

    res.json({ success: true, transaction });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[Workspace] PATCH transaction error:", err.message);
    res.status(500).json({ error: "Failed to update transaction", detail: err.message });
  } finally {
    client.release();
  }
});

async function applyTransactionPatch(client, id, changes) {
  const setClauses = [];
  const params = [];
  let index = 1;

  if (Object.prototype.hasOwnProperty.call(changes, "custom_category")) {
    setClauses.push(`custom_category = $${index++}`);
    params.push(changes.custom_category || null);
  }

  if (Object.prototype.hasOwnProperty.call(changes, "custom_direction")) {
    setClauses.push(`custom_direction = $${index++}`);
    params.push(changes.custom_direction || null);
  }

  if (Object.prototype.hasOwnProperty.call(changes, "hidden_from_budget")) {
    setClauses.push(`hidden_from_budget = $${index++}`);
    params.push(Boolean(changes.hidden_from_budget));
  }

  if (Object.prototype.hasOwnProperty.call(changes, "recurring")) {
    setClauses.push(`recurring = $${index++}`);
    params.push(Boolean(changes.recurring));
  }

  if (Object.prototype.hasOwnProperty.call(changes, "notes")) {
    setClauses.push(`notes = $${index++}`);
    params.push(changes.notes || null);
  }

  if (setClauses.length) {
    params.push(id);
    const result = await client.query(
      `UPDATE transactions
         SET ${setClauses.join(", ")}, updated_at = NOW()
       WHERE id = $${index}
       RETURNING id`,
      params,
    );

    if (!result.rows.length) {
      return null;
    }
  } else {
    const exists = await client.query("SELECT id FROM transactions WHERE id = $1", [id]);
    if (!exists.rows.length) return null;
  }

  if (Array.isArray(changes.tags)) {
    await client.query("DELETE FROM transaction_tags WHERE transaction_id = $1", [id]);

    for (const tagKey of changes.tags.filter(Boolean)) {
      await client.query(
        `INSERT INTO transaction_tags (transaction_id, tag_key)
         VALUES ($1, $2)
         ON CONFLICT (transaction_id, tag_key) DO NOTHING`,
        [id, tagKey],
      );
    }
  }

  const result = await client.query(
    `SELECT
        t.id,
        te.user_id,
        t.account_id,
        t.amount,
        t.date,
        t.description,
        t.category,
        t.custom_category,
        t.counterparty_name,
        t.counterparty_type,
        t.status,
        t.type,
        t.custom_direction,
        t.hidden_from_budget,
        t.recurring,
        t.notes,
        a.name AS account_name,
        a.type AS account_type,
        a.subtype AS account_subtype,
        a.last_four AS account_last_four,
        COALESCE(tag_data.tag_keys, ARRAY[]::varchar[]) AS tag_keys
      FROM transactions t
      JOIN accounts a ON a.id = t.account_id
      JOIN teller_enrollments te ON te.id = a.teller_enrollment_id
      LEFT JOIN LATERAL (
        SELECT ARRAY_AGG(tt.tag_key ORDER BY tt.tag_key) AS tag_keys
        FROM transaction_tags tt
        WHERE tt.transaction_id = t.id
      ) tag_data ON TRUE
      WHERE t.id = $1`,
    [id],
  );

  return result.rows[0] || null;
}

module.exports = router;
