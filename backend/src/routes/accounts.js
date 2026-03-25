const express = require("express");
const router = express.Router();
const pool = require("../db");

router.get("/", async (req, res) => {
  try {
    const { user_id } = req.query;
    if (!user_id) {
      return res.status(400).json({ error: "user_id is required" });
    }

    const result = await pool.query(
      `SELECT
          a.id,
          a.teller_account_id,
          a.name,
          a.type,
          a.subtype,
          a.last_four,
          a.currency,
          a.current_balance,
          a.available_balance,
          a.status,
          te.institution_name,
          a.updated_at
       FROM accounts a
       JOIN teller_enrollments te ON a.teller_enrollment_id = te.id
       WHERE te.user_id = $1
       ORDER BY a.type, a.name`,
      [user_id],
    );

    const totals = {
      depository: 0,
      credit: 0,
    };

    for (const account of result.rows) {
      const balance = parseFloat(account.current_balance) || 0;
      if (totals[account.type] !== undefined) {
        totals[account.type] += account.type === "credit" ? Math.abs(balance) : balance;
      }
    }

    res.json({
      accounts: result.rows,
      totals: {
        total_cash: totals.depository,
        total_credit_debt: totals.credit,
        net_worth: totals.depository - totals.credit,
      },
    });
  } catch (err) {
    console.error("[Accounts] GET error:", err.message);
    res.status(500).json({ error: "Failed to fetch accounts" });
  }
});

router.get("/users", async (_req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, name, email, created_at FROM users ORDER BY created_at ASC, name ASC",
    );
    res.json({ users: result.rows });
  } catch (err) {
    console.error("[Accounts] GET users error:", err.message);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

module.exports = router;
