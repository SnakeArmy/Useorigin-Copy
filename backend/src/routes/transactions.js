// ── UseOrigin — Transaction Routes ──────────────────────────
const express = require("express");
const router = express.Router();
const pool = require("../db");

// ─────────────────────────────────────────────────────────────
// GET /api/transactions
// Fetch transactions with optional filters.
// Query params:
//   user_id   (required)
//   days      (optional, default 30)
//   account_id (optional, filter by account UUID)
//   category  (optional, filter by category name)
//   limit     (optional, default 200)
//   offset    (optional, default 0)
// ─────────────────────────────────────────────────────────────
router.get("/", async (req, res) => {
    try {
        const { user_id, days = 30, account_id, category, limit = 200, offset = 0 } = req.query;
        if (!user_id) {
            return res.status(400).json({ error: "user_id is required" });
        }

        const params = [user_id, parseInt(days, 10), parseInt(limit, 10), parseInt(offset, 10)];
        let paramIndex = 5;

        let query = `
      SELECT
        t.id,
        t.teller_transaction_id,
        t.amount,
        t.date,
        t.description,
        t.category,
        t.custom_category,
        t.counterparty_name,
        t.counterparty_type,
        t.status,
        t.type,
        t.running_balance,
        a.name AS account_name,
        a.type AS account_type,
        a.last_four AS account_last_four,
        a.id   AS account_id
      FROM transactions t
      JOIN accounts a ON t.account_id = a.id
      JOIN teller_enrollments te ON a.teller_enrollment_id = te.id
      WHERE te.user_id = $1
        AND t.date >= CURRENT_DATE - ($2 || ' days')::INTERVAL
    `;

        if (account_id) {
            query += ` AND a.id = $${paramIndex}`;
            params.push(account_id);
            paramIndex++;
        }

        if (category) {
            query += ` AND (t.custom_category = $${paramIndex} OR t.category = $${paramIndex})`;
            params.push(category);
            paramIndex++;
        }

        query += `
      ORDER BY t.date DESC, t.description ASC
      LIMIT $3 OFFSET $4
    `;

        const result = await pool.query(query, params);

        // Total count for pagination
        let countQuery = `
      SELECT COUNT(*) as total
      FROM transactions t
      JOIN accounts a ON t.account_id = a.id
      JOIN teller_enrollments te ON a.teller_enrollment_id = te.id
      WHERE te.user_id = $1
        AND t.date >= CURRENT_DATE - ($2 || ' days')::INTERVAL
    `;

        const countResult = await pool.query(countQuery, [user_id, parseInt(days, 10)]);

        res.json({
            transactions: result.rows,
            pagination: {
                total: parseInt(countResult.rows[0].total, 10),
                limit: parseInt(limit, 10),
                offset: parseInt(offset, 10),
            },
        });
    } catch (err) {
        console.error("[Transactions] GET error:", err.message);
        res.status(500).json({ error: "Failed to fetch transactions" });
    }
});

// ─────────────────────────────────────────────────────────────
// PATCH /api/transactions/:id/category
// Update the custom_category for a transaction (user override).
// ─────────────────────────────────────────────────────────────
router.patch("/:id/category", async (req, res) => {
    try {
        const { id } = req.params;
        const { custom_category } = req.body;

        if (custom_category === undefined) {
            return res.status(400).json({ error: "custom_category is required" });
        }

        const result = await pool.query(
            `UPDATE transactions
       SET custom_category = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, description, category, custom_category`,
            [custom_category || null, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Transaction not found" });
        }

        res.json({ success: true, transaction: result.rows[0] });
    } catch (err) {
        console.error("[Transactions] PATCH category error:", err.message);
        res.status(500).json({ error: "Failed to update category" });
    }
});

// ─────────────────────────────────────────────────────────────
// GET /api/transactions/summary
// Get spending summary by category for charts.
// Query params:
//   user_id  (required)
//   days     (optional, default 30)
// ─────────────────────────────────────────────────────────────
router.get("/summary", async (req, res) => {
    try {
        const { user_id, days = 30 } = req.query;
        if (!user_id) {
            return res.status(400).json({ error: "user_id is required" });
        }

        const result = await pool.query(
            `SELECT
        COALESCE(t.custom_category, t.category, 'Uncategorized') AS category,
        SUM(ABS(t.amount)) AS total_amount,
        COUNT(*) AS transaction_count
       FROM transactions t
       JOIN accounts a ON t.account_id = a.id
       JOIN teller_enrollments te ON a.teller_enrollment_id = te.id
       WHERE te.user_id = $1
         AND t.date >= CURRENT_DATE - ($2 || ' days')::INTERVAL
         AND t.amount < 0
       GROUP BY COALESCE(t.custom_category, t.category, 'Uncategorized')
       ORDER BY total_amount DESC`,
            [user_id, parseInt(days, 10)]
        );

        res.json({ summary: result.rows });
    } catch (err) {
        console.error("[Transactions] summary error:", err.message);
        res.status(500).json({ error: "Failed to fetch summary" });
    }
});

module.exports = router;
