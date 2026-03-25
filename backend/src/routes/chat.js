// ── UseOrigin — AI Chat Routes (Ollama RAG) ─────────────────
const express = require("express");
const router = express.Router();
const pool = require("../db");

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3";

// ─────────────────────────────────────────────────────────────
// POST /api/chat
// Takes a natural-language query, retrieves relevant financial
// data from PostgreSQL, builds a grounded system prompt, and
// sends it to the local Ollama model.
// ─────────────────────────────────────────────────────────────
router.post("/", async (req, res) => {
    try {
        const { user_id, message, history = [] } = req.body;
        if (!user_id || !message) {
            return res.status(400).json({ error: "user_id and message are required" });
        }

        // ── 1. Gather financial context from the database ───────
        const [accountsResult, recentTxResult, summaryResult, topSpendResult] = await Promise.all([
            // Account balances
            pool.query(
                `SELECT a.name, a.type, a.subtype, a.current_balance, a.available_balance, te.institution_name
         FROM accounts a
         JOIN teller_enrollments te ON a.teller_enrollment_id = te.id
         WHERE te.user_id = $1 AND a.status = 'open'
         ORDER BY a.type, a.name`,
                [user_id]
            ),
            // Last 30 days of transactions (most recent 50)
            pool.query(
                `SELECT t.date, t.description, t.amount, t.counterparty_name,
                COALESCE(t.custom_category, t.category, 'Uncategorized') AS category,
                a.name AS account_name
         FROM transactions t
         JOIN accounts a ON t.account_id = a.id
         JOIN teller_enrollments te ON a.teller_enrollment_id = te.id
         WHERE te.user_id = $1
           AND t.date >= CURRENT_DATE - INTERVAL '30 days'
         ORDER BY t.date DESC
         LIMIT 50`,
                [user_id]
            ),
            // Spending summary by category (last 30 days)
            pool.query(
                `SELECT COALESCE(t.custom_category, t.category, 'Uncategorized') AS category,
                SUM(ABS(t.amount)) AS total, COUNT(*) AS count
         FROM transactions t
         JOIN accounts a ON t.account_id = a.id
         JOIN teller_enrollments te ON a.teller_enrollment_id = te.id
         WHERE te.user_id = $1
           AND t.date >= CURRENT_DATE - INTERVAL '30 days'
           AND t.amount < 0
         GROUP BY COALESCE(t.custom_category, t.category, 'Uncategorized')
         ORDER BY total DESC`,
                [user_id]
            ),
            // Top 5 largest expenses
            pool.query(
                `SELECT t.date, t.description, t.amount, t.counterparty_name,
                COALESCE(t.custom_category, t.category, 'Uncategorized') AS category
         FROM transactions t
         JOIN accounts a ON t.account_id = a.id
         JOIN teller_enrollments te ON a.teller_enrollment_id = te.id
         WHERE te.user_id = $1
           AND t.date >= CURRENT_DATE - INTERVAL '30 days'
           AND t.amount < 0
         ORDER BY ABS(t.amount) DESC
         LIMIT 5`,
                [user_id]
            ),
        ]);

        // ── 2. Format the financial context ─────────────────────
        const accounts = accountsResult.rows;
        const totalCash = accounts
            .filter((a) => a.type === "depository")
            .reduce((sum, a) => sum + parseFloat(a.current_balance || 0), 0);
        const totalDebt = accounts
            .filter((a) => a.type === "credit")
            .reduce((sum, a) => sum + parseFloat(a.current_balance || 0), 0);

        const accountSummary = accounts
            .map((a) => `  - ${a.name} (${a.institution_name || a.type}): $${parseFloat(a.current_balance).toFixed(2)}`)
            .join("\n");

        const spendingSummary = summaryResult.rows
            .map((s) => `  - ${s.category}: $${parseFloat(s.total).toFixed(2)} (${s.count} transactions)`)
            .join("\n");

        const topExpenses = topSpendResult.rows
            .map((t) => `  - ${t.date}: ${t.counterparty_name || t.description} — $${Math.abs(parseFloat(t.amount)).toFixed(2)} [${t.category}]`)
            .join("\n");

        const recentTransactions = recentTxResult.rows
            .slice(0, 20)
            .map((t) => `  ${t.date} | ${(t.counterparty_name || t.description).padEnd(30)} | $${parseFloat(t.amount).toFixed(2).padStart(9)} | ${t.category}`)
            .join("\n");

        const totalSpent = summaryResult.rows.reduce((sum, s) => sum + parseFloat(s.total), 0);

        // ── 3. Build the system prompt ──────────────────────────
        const systemPrompt = `You are UseOrigin's AI Financial Advisor — a helpful, data-grounded assistant for a household's personal finances.

IMPORTANT RULES:
- Base ALL your answers strictly on the financial data provided below. Do not hallucinate or invent numbers.
- Be concise but insightful. Use specific dollar amounts from the data.
- When the user asks about spending, trends, or budgeting, reference the exact categories and totals.
- If asked something you cannot determine from the data, say so clearly.
- Format currency as $X,XXX.XX. Use bullet points for clarity.
- Be warm and encouraging while being financially responsible.

═══════════════════════════════════════════════
HOUSEHOLD FINANCIAL SNAPSHOT (Last 30 Days)
═══════════════════════════════════════════════

ACCOUNTS:
${accountSummary || "  No accounts linked."}

TOTALS:
  - Total Cash: $${totalCash.toFixed(2)}
  - Total Credit Debt: $${totalDebt.toFixed(2)}
  - Net Worth (liquid): $${(totalCash - totalDebt).toFixed(2)}

SPENDING BY CATEGORY (Last 30 Days):
  Total Spent: $${totalSpent.toFixed(2)}
${spendingSummary || "  No spending data."}

TOP 5 LARGEST EXPENSES:
${topExpenses || "  No expenses recorded."}

RECENT TRANSACTIONS:
${recentTransactions || "  No recent transactions."}
═══════════════════════════════════════════════`;

        // ── 4. Build the messages array ─────────────────────────
        const messages = [
            { role: "system", content: systemPrompt },
            ...history.slice(-10).map((h) => ({
                role: h.role,
                content: h.content,
            })),
            { role: "user", content: message },
        ];

        // ── 5. Stream the response from Ollama ──────────────────
        const ollamaRes = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model: OLLAMA_MODEL,
                messages,
                stream: true,
            }),
        });

        if (!ollamaRes.ok) {
            const errText = await ollamaRes.text();
            console.error("[Chat] Ollama error:", ollamaRes.status, errText);
            return res.status(502).json({
                error: "LLM engine unavailable",
                detail: `Ollama returned ${ollamaRes.status}. Make sure the model is pulled: docker compose exec llm-engine ollama pull ${OLLAMA_MODEL}`,
            });
        }

        // Stream the response back to the client
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");

        const reader = ollamaRes.body;
        const decoder = new TextDecoder();
        let fullResponse = "";

        for await (const chunk of reader) {
            const text = decoder.decode(chunk, { stream: true });
            // Ollama streams JSON lines
            const lines = text.split("\n").filter((l) => l.trim());
            for (const line of lines) {
                try {
                    const parsed = JSON.parse(line);
                    if (parsed.message?.content) {
                        fullResponse += parsed.message.content;
                        res.write(`data: ${JSON.stringify({ content: parsed.message.content, done: false })}\n\n`);
                    }
                    if (parsed.done) {
                        res.write(`data: ${JSON.stringify({ content: "", done: true, full_response: fullResponse })}\n\n`);
                    }
                } catch {
                    // Skip unparseable lines
                }
            }
        }

        res.end();
    } catch (err) {
        console.error("[Chat] Error:", err.message);
        res.status(500).json({
            error: "Failed to process chat",
            detail: err.message,
        });
    }
});

// ─────────────────────────────────────────────────────────────
// GET /api/chat/status
// Check if Ollama is reachable and has a model loaded.
// ─────────────────────────────────────────────────────────────
router.get("/status", async (_req, res) => {
    try {
        const ollamaRes = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
        if (!ollamaRes.ok) throw new Error(`Ollama returned ${ollamaRes.status}`);
        const data = await ollamaRes.json();
        const models = data.models || [];
        const hasModel = models.some((m) => m.name.startsWith(OLLAMA_MODEL));

        res.json({
            status: hasModel ? "ready" : "no_model",
            ollama_reachable: true,
            model: OLLAMA_MODEL,
            available_models: models.map((m) => m.name),
            hint: hasModel
                ? undefined
                : `Run: docker compose exec llm-engine ollama pull ${OLLAMA_MODEL}`,
        });
    } catch (err) {
        res.json({
            status: "unreachable",
            ollama_reachable: false,
            model: OLLAMA_MODEL,
            error: err.message,
        });
    }
});

module.exports = router;
