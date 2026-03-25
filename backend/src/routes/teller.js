const express = require("express");
const router = express.Router();
const pool = require("../db");
const { tellerRequest } = require("../tellerClient");

async function snapshotAccountBalance(accountId, currentBalance) {
  await pool.query(
    `INSERT INTO account_balance_snapshots (account_id, captured_on, current_balance)
     VALUES ($1, CURRENT_DATE, $2)
     ON CONFLICT (account_id, captured_on) DO UPDATE SET
       current_balance = EXCLUDED.current_balance`,
    [accountId, currentBalance || 0],
  );
}

router.post("/save-enrollment", async (req, res) => {
  try {
    const { user_id, access_token, enrollment_id, institution } = req.body;
    if (!user_id || !access_token || !enrollment_id) {
      return res.status(400).json({
        error: "user_id, access_token, and enrollment_id are required",
      });
    }

    const insertResult = await pool.query(
      `INSERT INTO teller_enrollments (user_id, enrollment_id, access_token, institution_id, institution_name)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (enrollment_id) DO UPDATE SET
         access_token = EXCLUDED.access_token,
         updated_at = NOW()
       RETURNING id`,
      [user_id, enrollment_id, access_token, institution?.id || null, institution?.name || null],
    );

    const enrollmentDbId = insertResult.rows[0].id;
    const accounts = await tellerRequest(access_token, "/accounts");
    let accountsSynced = 0;

    for (const account of accounts) {
      let ledgerBalance = null;
      let availableBalance = null;

      try {
        if (account.links?.balances) {
          const balances = await tellerRequest(access_token, `/accounts/${account.id}/balances`);
          ledgerBalance = balances.ledger ? parseFloat(balances.ledger) : null;
          availableBalance = balances.available ? parseFloat(balances.available) : null;
        }
      } catch (balanceError) {
        console.warn(`[Teller] Balance fetch failed for ${account.id}:`, balanceError.message);
      }

      await pool.query(
        `INSERT INTO accounts (teller_enrollment_id, teller_account_id, name, type, subtype, last_four, currency, current_balance, available_balance, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (teller_account_id) DO UPDATE SET
           name = EXCLUDED.name,
           current_balance = EXCLUDED.current_balance,
           available_balance = EXCLUDED.available_balance,
           status = EXCLUDED.status,
           updated_at = NOW()`,
        [
          enrollmentDbId,
          account.id,
          account.name,
          account.type,
          account.subtype || null,
          account.last_four || null,
          account.currency || "USD",
          ledgerBalance || 0,
          availableBalance,
          account.status || "open",
        ],
      );

      const storedAccount = await pool.query(
        "SELECT id, current_balance FROM accounts WHERE teller_account_id = $1",
        [account.id],
      );

      if (storedAccount.rows[0]) {
        await snapshotAccountBalance(
          storedAccount.rows[0].id,
          parseFloat(storedAccount.rows[0].current_balance) || 0,
        );
      }

      accountsSynced++;
    }

    res.json({
      success: true,
      enrollment_id,
      accounts_synced: accountsSynced,
    });
  } catch (err) {
    console.error("[Teller] save-enrollment error:", err.message);
    res.status(500).json({
      error: "Failed to save enrollment",
      detail: err.message,
    });
  }
});

router.post("/sync-transactions", async (req, res) => {
  try {
    const { user_id } = req.body;
    if (!user_id) {
      return res.status(400).json({ error: "user_id is required" });
    }

    const enrollments = await pool.query(
      "SELECT id, enrollment_id, access_token FROM teller_enrollments WHERE user_id = $1",
      [user_id],
    );

    if (enrollments.rows.length === 0) {
      return res.status(404).json({ error: "No linked accounts found for this user" });
    }

    let totalAdded = 0;
    let totalUpdated = 0;
    const endDate = new Date().toISOString().split("T")[0];
    const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];

    for (const enrollment of enrollments.rows) {
      const dbAccounts = await pool.query(
        "SELECT id, teller_account_id FROM accounts WHERE teller_enrollment_id = $1",
        [enrollment.id],
      );

      for (const dbAccount of dbAccounts.rows) {
        try {
          const transactions = await tellerRequest(
            enrollment.access_token,
            `/accounts/${dbAccount.teller_account_id}/transactions?start_date=${startDate}&end_date=${endDate}&count=500`,
          );

          for (const transaction of transactions) {
            const result = await pool.query(
              `INSERT INTO transactions
                (account_id, teller_transaction_id, amount, date, description, category, counterparty_name, counterparty_type, status, type, running_balance)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
               ON CONFLICT (teller_transaction_id) DO UPDATE SET
                 amount = EXCLUDED.amount,
                 date = EXCLUDED.date,
                 description = EXCLUDED.description,
                 category = EXCLUDED.category,
                 counterparty_name = EXCLUDED.counterparty_name,
                 status = EXCLUDED.status,
                 running_balance = EXCLUDED.running_balance,
                 updated_at = NOW()
               RETURNING (xmax = 0) AS inserted`,
              [
                dbAccount.id,
                transaction.id,
                parseFloat(transaction.amount) || 0,
                transaction.date,
                transaction.description || "",
                transaction.details?.category || null,
                transaction.details?.counterparty?.name || null,
                transaction.details?.counterparty?.type || null,
                transaction.status || "posted",
                transaction.type || null,
                transaction.running_balance ? parseFloat(transaction.running_balance) : null,
              ],
            );

            if (result.rows[0].inserted) {
              totalAdded++;
            } else {
              totalUpdated++;
            }
          }

          try {
            const balances = await tellerRequest(
              enrollment.access_token,
              `/accounts/${dbAccount.teller_account_id}/balances`,
            );
            const updatedAccount = await pool.query(
              `UPDATE accounts SET
                 current_balance = $1, available_balance = $2, updated_at = NOW()
               WHERE teller_account_id = $3
               RETURNING id, current_balance`,
              [
                balances.ledger ? parseFloat(balances.ledger) : 0,
                balances.available ? parseFloat(balances.available) : null,
                dbAccount.teller_account_id,
              ],
            );

            if (updatedAccount.rows[0]) {
              await snapshotAccountBalance(
                updatedAccount.rows[0].id,
                parseFloat(updatedAccount.rows[0].current_balance) || 0,
              );
            }
          } catch (balanceError) {
            console.warn(
              `[Teller] Balance refresh failed for ${dbAccount.teller_account_id}:`,
              balanceError.message,
            );
          }
        } catch (transactionError) {
          console.error(
            `[Teller] Transaction fetch failed for ${dbAccount.teller_account_id}:`,
            transactionError.message,
          );
        }
      }
    }

    res.json({
      success: true,
      transactions: { added: totalAdded, updated: totalUpdated },
    });
  } catch (err) {
    console.error("[Teller] sync-transactions error:", err.message);
    res.status(500).json({
      error: "Failed to sync transactions",
      detail: err.message,
    });
  }
});

router.get("/config", (_req, res) => {
  res.json({
    applicationId: process.env.TELLER_APPLICATION_ID || "",
    environment: process.env.TELLER_ENVIRONMENT || "sandbox",
    products: ["transactions", "balance"],
  });
});

module.exports = router;
