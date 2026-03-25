# UseOrigin Fixes & Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix data accuracy, connectivity, interactivity, and AI features in a self-hosted finance dashboard so the numbers are trustworthy and the UI is functional.

**Architecture:** Two-phase approach. Phase 1 fixes critical bugs in the existing Express+PostgreSQL backend and Next.js 15 frontend — sync error handling, categorization, interactive UI, subscriptions, planning, theme, and AI adviser. Phase 2 layers in Ollama-powered smart categorization as a background enhancement. All changes follow existing patterns (Express routes, React Context store, TypeScript selectors).

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind CSS, Recharts, Express, PostgreSQL 16, Ollama (Llama 3 8B), Teller.io, Docker Compose.

**Spec:** `docs/superpowers/specs/2026-03-24-useorigin-fixes-and-enhancements-design.md`

**Important discovery:** `bootstrap.js` already creates the `categorization_rules` and `account_balance_snapshots` tables at startup. No new migrations needed — just add the `last_synced_at` column to `teller_enrollments`.

---

## File Map

### Backend modifications
| File | Responsibility |
|------|---------------|
| `backend/src/bootstrap.js` | Add `last_synced_at` column to `teller_enrollments` |
| `backend/src/routes/teller.js` | Error classification, pagination, full history, last_synced_at update |
| `backend/src/routes/transactions.js` | Auto-create categorization rule on category override |
| `backend/src/routes/chat.js` | Richer context query, budget/subscription data, batch categorization endpoint |
| `backend/src/routes/workspace.js` | Return `last_synced_at` in workspace payload |

### Frontend type/logic modifications
| File | Responsibility |
|------|---------------|
| `frontend/src/lib/finance-types.ts` | Add `"all"` to `DateRangeKey` union |
| `frontend/src/lib/finance-selectors.ts` | All-time date range handling, improved subscription detection, income/savings calculation |
| `frontend/src/lib/categorization.ts` | Uncategorized bucket, expanded patterns |
| `frontend/src/lib/finance-advisor.ts` | Restructure as card-only generator (remove canned text) |
| `frontend/src/lib/finance-store.tsx` | Sync state, streaming adviser, all-time date range |
| `frontend/src/lib/finance-normalization.ts` | Pass through `last_synced_at` from backend |

### Frontend component modifications
| File | Responsibility |
|------|---------------|
| `frontend/src/components/pages/spending-screen.tsx` | Tappable category drill-down, percentage fix, empty states |
| `frontend/src/components/pages/planning-screen.tsx` | Real data integration, show-your-math labels |
| `frontend/src/components/pages/advisor-screen.tsx` | Streaming responses from Ollama, error states |
| `frontend/src/components/pages/settings-screen.tsx` | Theme fix for workspace overlays |
| `frontend/src/components/app-shell.tsx` | Last-synced display, sync button with feedback |
| `frontend/src/app/globals.css` | Verify theme variables cover all overlay elements |

---

## Task 1: Add `last_synced_at` Column to Database

**Files:**
- Modify: `backend/src/bootstrap.js`

- [ ] **Step 1: Add migration statement to bootstrap.js**

Add after line 56 (the last `CREATE INDEX` statement):

```javascript
`ALTER TABLE teller_enrollments ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ`,
`CREATE UNIQUE INDEX IF NOT EXISTS idx_categorization_rules_user_name ON categorization_rules(user_id, name)`,
```

The unique index on `(user_id, name)` enables `ON CONFLICT` handling in Task 6 to prevent duplicate rules when the same merchant is recategorized multiple times.

- [ ] **Step 2: Restart backend to apply migration**

Run: `docker compose restart backend`

- [ ] **Step 3: Verify column exists**

Run: `docker compose exec database psql -U useorigin -d useorigin -c "\d teller_enrollments"`
Expected: `last_synced_at` column appears in the output.

- [ ] **Step 4: Commit**

```bash
git add backend/src/bootstrap.js
git commit -m "feat: add last_synced_at column to teller_enrollments"
```

---

## Task 2: Fix Teller Sync — Error Handling, Pagination, Timestamps

**Files:**
- Modify: `backend/src/routes/teller.js`

- [ ] **Step 1: Add error classification helper**

Add at the top of `teller.js` after the imports (line 4):

```javascript
function classifySyncError(error) {
  const message = (error.message || "").toLowerCase();
  const status = error.status || error.statusCode || 0;

  if (status === 401 || message.includes("unauthorized") || message.includes("token")) {
    return { code: "enrollment_stale", message: "Bank enrollment has expired. Please re-link your account.", recoverable: false };
  }
  if (status === 403 || message.includes("certificate") || message.includes("ssl") || message.includes("tls")) {
    return { code: "cert_expired", message: "mTLS certificate is invalid or expired.", recoverable: false };
  }
  if (status === 429 || message.includes("rate limit")) {
    return { code: "rate_limited", message: "Teller rate limit reached. Try again in a few minutes.", recoverable: true };
  }
  return { code: "unknown", message: error.message || "Unknown sync error", recoverable: false };
}
```

- [ ] **Step 2: Add paginated transaction fetch helper**

Add after the error classification helper:

```javascript
async function fetchAllTransactions(accessToken, accountId, startDate, endDate) {
  const allTransactions = [];
  let fromId = null;

  while (true) {
    let url = `/accounts/${accountId}/transactions?count=500`;
    if (startDate && endDate) {
      url += `&start_date=${startDate}&end_date=${endDate}`;
    }
    if (fromId) {
      url += `&from_id=${fromId}`;
    }

    const batch = await tellerRequest(accessToken, url);
    if (!Array.isArray(batch) || batch.length === 0) break;

    allTransactions.push(...batch);

    if (batch.length < 500) break;
    fromId = batch[batch.length - 1].id;
  }

  return allTransactions;
}
```

- [ ] **Step 3: Rewrite sync-transactions route with error handling, pagination, and timestamp**

Replace the entire `router.post("/sync-transactions", ...)` handler (lines 105-227) with:

```javascript
router.post("/sync-transactions", async (req, res) => {
  try {
    const { user_id, full_history = false } = req.body;
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
    const errors = [];

    const endDate = new Date().toISOString().split("T")[0];
    const startDate = full_history
      ? null
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

    for (const enrollment of enrollments.rows) {
      const dbAccounts = await pool.query(
        "SELECT id, teller_account_id FROM accounts WHERE teller_enrollment_id = $1",
        [enrollment.id],
      );

      for (const dbAccount of dbAccounts.rows) {
        try {
          const transactions = await fetchAllTransactions(
            enrollment.access_token,
            dbAccount.teller_account_id,
            startDate,
            endDate,
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
          const classified = classifySyncError(transactionError);
          console.error(
            `[Teller] Transaction fetch failed for ${dbAccount.teller_account_id}:`,
            classified.code,
            transactionError.message,
          );
          errors.push({
            account_id: dbAccount.teller_account_id,
            ...classified,
          });
        }
      }

      // Update last_synced_at on enrollment
      await pool.query(
        "UPDATE teller_enrollments SET last_synced_at = NOW() WHERE id = $1",
        [enrollment.id],
      );
    }

    res.json({
      success: errors.length === 0,
      transactions: { added: totalAdded, updated: totalUpdated },
      errors,
    });
  } catch (err) {
    const classified = classifySyncError(err);
    console.error("[Teller] sync-transactions error:", classified.code, err.message);
    res.status(500).json({
      success: false,
      error: classified.message,
      code: classified.code,
    });
  }
});
```

- [ ] **Step 4: Test the sync endpoint**

Run: `curl -s -X POST http://localhost:4000/api/teller/sync-transactions -H "Content-Type: application/json" -d '{"user_id":"<EMIL_USER_ID>"}' | jq`

Expected: JSON with `success`, `transactions.added`, `transactions.updated`, and `errors` array.

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/teller.js
git commit -m "feat: teller sync with error classification, pagination, and timestamps"
```

---

## Task 3: Return `last_synced_at` in Workspace Payload

**Files:**
- Modify: `backend/src/routes/workspace.js`

- [ ] **Step 1: Add last_synced_at to the workspace query**

In `getWorkspacePayload()`, after the existing `snapshotsResult` query (around line 175), add a new query to the `Promise.all` array:

Add to the destructured results (line 32):
```javascript
enrollmentsResult,
```

Add to the `Promise.all` array (after the snapshotsResult query):
```javascript
client.query(
  `SELECT id, user_id, enrollment_id, institution_name, last_synced_at
   FROM teller_enrollments
   ORDER BY last_synced_at DESC NULLS LAST`,
),
```

- [ ] **Step 2: Include enrollments in the response payload**

In the `return` block (around line 178), add:
```javascript
enrollments: enrollmentsResult.rows,
```

- [ ] **Step 3: Verify workspace returns enrollments**

Run: `curl -s http://localhost:4000/api/workspace?days=365 | jq '.enrollments'`
Expected: Array of enrollment objects with `last_synced_at` timestamps.

- [ ] **Step 4: Commit**

```bash
git add backend/src/routes/workspace.js
git commit -m "feat: include enrollment last_synced_at in workspace payload"
```

---

## Task 4: Extend DateRangeKey with "All Time"

**Files:**
- Modify: `frontend/src/lib/finance-types.ts`
- Modify: `frontend/src/lib/finance-selectors.ts`
- Modify: `frontend/src/lib/finance-store.tsx`

- [ ] **Step 1: Add "all" to DateRangeKey type**

In `finance-types.ts` line 2, change:
```typescript
export type DateRangeKey = "30d" | "90d" | "180d" | "365d";
```
to:
```typescript
export type DateRangeKey = "30d" | "90d" | "180d" | "365d" | "all";
```

- [ ] **Step 2: Update DATE_RANGE_DAYS map in finance-selectors.ts**

In `finance-selectors.ts` lines 30-35, change:
```typescript
const DATE_RANGE_DAYS: Record<DateRangeKey, number> = {
  "30d": 30,
  "90d": 90,
  "180d": 180,
  "365d": 365,
};
```
to:
```typescript
const DATE_RANGE_DAYS: Record<DateRangeKey, number> = {
  "30d": 30,
  "90d": 90,
  "180d": 180,
  "365d": 365,
  "all": Infinity,
};
```

- [ ] **Step 3: Update startOfWindow to handle "all"**

In `finance-selectors.ts`, replace the `startOfWindow` function (lines 42-47):
```typescript
function startOfWindow(dateRange: DateRangeKey, now = new Date()) {
  if (dateRange === "all") return new Date(0);
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - DATE_RANGE_DAYS[dateRange] + 1);
  return start;
}
```

- [ ] **Step 4: Update isInRange to handle "all"**

Replace the `isInRange` function (lines 55-58):
```typescript
function isInRange(isoDate: string, dateRange: DateRangeKey, now = new Date()) {
  if (dateRange === "all") return true;
  const value = new Date(isoDate);
  return value >= startOfWindow(dateRange, now) && value <= endOfWindow(now);
}
```

- [ ] **Step 5: Update previousWindowTransactions to handle "all"**

Replace the `previousWindowTransactions` function (lines 118-132):
```typescript
function previousWindowTransactions(transactions: TransactionRecord[], dateRange: DateRangeKey, now = new Date()) {
  if (dateRange === "all") return [];
  const currentStart = startOfWindow(dateRange, now);
  const rangeDays = DATE_RANGE_DAYS[dateRange];
  const prevEnd = new Date(currentStart);
  prevEnd.setDate(prevEnd.getDate() - 1);
  prevEnd.setHours(23, 59, 59, 999);
  const prevStart = new Date(prevEnd);
  prevStart.setDate(prevStart.getDate() - rangeDays + 1);
  prevStart.setHours(0, 0, 0, 0);

  return transactions.filter((transaction) => {
    const postedAt = new Date(transaction.postedAt);
    return postedAt >= prevStart && postedAt <= prevEnd;
  });
}
```

- [ ] **Step 6: Update calculateNetWorthHistory to handle "all"**

In `calculateNetWorthHistory` (line 293), replace:
```typescript
  const months = uniqueMonths(
    source.accountSnapshots
      .filter((snapshot) => isInRange(snapshot.capturedOn, dateRange))
      .map((snapshot) => toMonthKey(snapshot.capturedOn)),
  ).slice(-6);
```
with:
```typescript
  const maxMonths = dateRange === "all" ? 24 : 6;
  const months = uniqueMonths(
    source.accountSnapshots
      .filter((snapshot) => isInRange(snapshot.capturedOn, dateRange))
      .map((snapshot) => toMonthKey(snapshot.capturedOn)),
  ).slice(-maxMonths);
```

- [ ] **Step 7: Update calculateInsights to handle "all"**

In `calculateInsights` (line 435), where `DATE_RANGE_DAYS[dateRange]` is used in the action string, add a guard:
```typescript
action: `Why did ${getCategoryLabel(source.categories, topCategory.categoryId)} change${dateRange === "all" ? "" : ` in the last ${DATE_RANGE_DAYS[dateRange]} days`}?`,
```

- [ ] **Step 8: Update date range persistence in finance-store.tsx**

In `finance-store.tsx` around lines 133-149, update the `useState` initializer for `dateRange` to accept `"all"`:
```typescript
const [dateRange, setDateRange] = useState<DateRangeKey>(() => {
  if (typeof window === "undefined") return "90d";
  try {
    const savedRange = window.localStorage.getItem("useorigin-date-range") as DateRangeKey | null;
    if (
      savedRange === "30d" ||
      savedRange === "90d" ||
      savedRange === "180d" ||
      savedRange === "365d" ||
      savedRange === "all"
    ) {
      return savedRange;
    }
  } catch {
    // Local persistence is optional.
  }
  return "90d";
});
```

- [ ] **Step 9: Commit**

```bash
git add frontend/src/lib/finance-types.ts frontend/src/lib/finance-selectors.ts frontend/src/lib/finance-store.tsx
git commit -m "feat: add all-time date range option across selectors and store"
```

---

## Task 5: Fix Categorization — Uncategorized Bucket and Confidence

**Files:**
- Modify: `frontend/src/lib/categorization.ts`

- [ ] **Step 1: Add "uncategorized" to the default categories list**

In `createDefaultCategories()` (around line 188), replace the `miscellaneous` entry:
```typescript
{ id: "miscellaneous", name: "Miscellaneous", groupId: "grp_admin", parentId: null, icon: "Package2", budget: 120 },
```
with:
```typescript
{ id: "uncategorized", name: "Uncategorized", groupId: "grp_admin", parentId: null, icon: "CircleHelp", budget: 0 },
{ id: "miscellaneous", name: "Miscellaneous", groupId: "grp_admin", parentId: null, icon: "Package2", budget: 120 },
```

- [ ] **Step 2: Update the fallback in enrichTransactions**

In `enrichTransactions()` (around lines 444-450), replace the fallback block:
```typescript
} else if (!transaction.categoryId) {
  transaction.categoryId = "miscellaneous";
  transaction.suggestedCategoryId = "miscellaneous";
  transaction.confidenceScore = 0.54;
  transaction.confidenceStatus = "needs-review";
  transaction.confidenceReason = "No exact merchant pattern match yet";
}
```
with:
```typescript
} else if (!transaction.categoryId) {
  transaction.categoryId = "uncategorized";
  transaction.suggestedCategoryId = null;
  transaction.confidenceScore = 0;
  transaction.confidenceStatus = "needs-review";
  transaction.confidenceReason = "No matching rule or pattern. Needs manual categorization.";
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/categorization.ts
git commit -m "feat: add uncategorized bucket with zero confidence for unmatched transactions"
```

---

## Task 6: Auto-Create Categorization Rule on User Override

**Files:**
- Modify: `backend/src/routes/transactions.js`

- [ ] **Step 1: Add auto-rule creation to the PATCH category endpoint**

Replace the existing `PATCH /:id/category` handler (lines 101-127) with:

```javascript
router.patch("/:id/category", async (req, res) => {
    try {
        const { id } = req.params;
        const { custom_category, create_rule = true } = req.body;

        if (custom_category === undefined) {
            return res.status(400).json({ error: "custom_category is required" });
        }

        const result = await pool.query(
            `UPDATE transactions
       SET custom_category = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, description, category, custom_category, counterparty_name`,
            [custom_category || null, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Transaction not found" });
        }

        const transaction = result.rows[0];

        // Auto-create a categorization rule for this merchant
        if (create_rule && custom_category && transaction.counterparty_name) {
            const merchantNormalized = transaction.counterparty_name.trim().toLowerCase();
            const ruleName = `${transaction.counterparty_name} → ${custom_category}`;

            // Find the primary user
            const userResult = await pool.query(
                "SELECT te.user_id FROM accounts a JOIN teller_enrollments te ON te.id = a.teller_enrollment_id JOIN transactions t ON t.account_id = a.id WHERE t.id = $1 LIMIT 1",
                [id]
            );
            const userId = userResult.rows[0]?.user_id;

            if (userId) {
                await pool.query(
                    `INSERT INTO categorization_rules (user_id, name, description, criteria, actions, source)
                     VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, 'user')
                     ON CONFLICT (user_id, name) DO UPDATE SET
                       criteria = EXCLUDED.criteria,
                       actions = EXCLUDED.actions,
                       updated_at = NOW()`,
                    [
                        userId,
                        ruleName,
                        `Auto-created when user categorized ${transaction.counterparty_name} as ${custom_category}.`,
                        JSON.stringify([{ type: "merchant_contains", value: merchantNormalized }]),
                        JSON.stringify([{ type: "set_category", categoryId: custom_category }]),
                    ]
                );
            }
        }

        res.json({ success: true, transaction });
    } catch (err) {
        console.error("[Transactions] PATCH category error:", err.message);
        res.status(500).json({ error: "Failed to update category" });
    }
});
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/routes/transactions.js
git commit -m "feat: auto-create categorization rule when user overrides a transaction category"
```

---

## Task 7: Improve Subscription Detection

**Files:**
- Modify: `frontend/src/lib/finance-selectors.ts`

- [ ] **Step 1: Rewrite calculateBills with frequency-based detection**

Replace the entire `calculateBills` function (lines 350-402) with:

```typescript
export function calculateBills(source: FinanceSourceData): BillRecord[] {
  const merchantGroups = new Map<string, TransactionRecord[]>();

  for (const transaction of source.transactions) {
    if (!isExpense(transaction)) continue;
    const key = transaction.merchantNormalized;
    const group = merchantGroups.get(key) || [];
    group.push(transaction);
    merchantGroups.set(key, group);
  }

  const bills: BillRecord[] = [];

  for (const [, transactions] of merchantGroups) {
    if (transactions.length < 2) continue;

    const ordered = [...transactions].sort((left, right) => left.postedAt.localeCompare(right.postedAt));
    const latest = ordered.at(-1);
    if (!latest) continue;

    const dayDiffs = ordered.slice(1).map((transaction, index) => {
      const previous = new Date(ordered[index].postedAt).getTime();
      const current = new Date(transaction.postedAt).getTime();
      return Math.round((current - previous) / (1000 * 60 * 60 * 24));
    });

    if (!dayDiffs.length) continue;

    const averageInterval = sum(dayDiffs) / dayDiffs.length;

    // Amount consistency check: std deviation < 20% of mean
    const amounts = ordered.map((t) => Math.abs(t.amount));
    const meanAmount = sum(amounts) / amounts.length;
    const variance = sum(amounts.map((a) => (a - meanAmount) ** 2)) / amounts.length;
    const stdDev = Math.sqrt(variance);
    const amountConsistent = meanAmount > 0 && stdDev / meanAmount < 0.2;

    // Detect frequency with 15% tolerance windows
    let frequency: "monthly" | "quarterly" | "annual" | null = null;
    let expectedInterval = 0;

    if (averageInterval >= 25 && averageInterval <= 35) {
      frequency = "monthly";
      expectedInterval = 30;
    } else if (averageInterval >= 78 && averageInterval <= 104) {
      frequency = "quarterly";
      expectedInterval = 91;
    } else if (averageInterval >= 310 && averageInterval <= 420) {
      frequency = "annual";
      expectedInterval = 365;
    }

    // Also accept if explicitly flagged as recurring
    if (!frequency && (latest.recurring || latest.subscription)) {
      frequency = "monthly";
      expectedInterval = 30;
    }

    if (!frequency) continue;

    // Higher confidence if amount is also consistent
    const dueDate = new Date(latest.postedAt);
    dueDate.setDate(dueDate.getDate() + Math.max(expectedInterval, Math.round(averageInterval || 30)));

    const annualMultiplier = frequency === "monthly" ? 12 : frequency === "quarterly" ? 4 : 1;

    bills.push({
      id: `bill_${latest.merchantNormalized}`,
      merchant: latest.displayMerchant,
      dueDate: dueDate.toISOString(),
      amount: Math.abs(latest.amount),
      frequency,
      categoryId: latest.categoryId || "miscellaneous",
      autopay: latest.typeLabel.toLowerCase().includes("autopay") || latest.badges.includes("transfer"),
    });
  }

  return bills.sort((left, right) => left.dueDate.localeCompare(right.dueDate));
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/lib/finance-selectors.ts
git commit -m "feat: frequency-based subscription detection with amount consistency check"
```

---

## Task 8: Add Income Detection and Real Savings Rate

**Files:**
- Modify: `frontend/src/lib/finance-selectors.ts`

- [ ] **Step 1: Add income detection and savings rate functions**

Add these exported functions after `calculateCashFlowHistory` (around line 270):

```typescript
export function detectMonthlyIncome(transactions: TransactionRecord[]): number {
  const incomeTransactions = transactions.filter(isIncome);
  if (!incomeTransactions.length) return 0;

  // Group by month and average
  const grouped = new Map<string, number>();
  for (const transaction of incomeTransactions) {
    const key = toMonthKey(transaction.postedAt);
    grouped.set(key, (grouped.get(key) || 0) + Math.abs(transaction.amount));
  }

  const months = Array.from(grouped.values());
  if (!months.length) return 0;

  // Use last 3 months or whatever we have
  const recentMonths = months.slice(-3);
  return sum(recentMonths) / recentMonths.length;
}

export function calculateRealSavingsRate(transactions: TransactionRecord[]): {
  monthlySavings: number;
  monthlyIncome: number;
  monthlyExpenses: number;
  monthsAnalyzed: number;
  dateRange: string;
} {
  const grouped = new Map<string, { income: number; expenses: number }>();

  for (const transaction of transactions) {
    const key = toMonthKey(transaction.postedAt);
    const bucket = grouped.get(key) || { income: 0, expenses: 0 };

    if (isIncome(transaction)) {
      bucket.income += Math.abs(transaction.amount);
    }
    if (isExpense(transaction)) {
      bucket.expenses += sum(getExpenseAllocations(transaction).map((item) => item.amount));
    }

    grouped.set(key, bucket);
  }

  const sortedKeys = uniqueMonths(Array.from(grouped.keys()));
  const recentKeys = sortedKeys.slice(-3);
  const recentBuckets = recentKeys.map((key) => grouped.get(key)!).filter(Boolean);

  if (!recentBuckets.length) {
    return { monthlySavings: 0, monthlyIncome: 0, monthlyExpenses: 0, monthsAnalyzed: 0, dateRange: "" };
  }

  const monthlyIncome = sum(recentBuckets.map((b) => b.income)) / recentBuckets.length;
  const monthlyExpenses = sum(recentBuckets.map((b) => b.expenses)) / recentBuckets.length;

  return {
    monthlySavings: Math.max(0, monthlyIncome - monthlyExpenses),
    monthlyIncome,
    monthlyExpenses,
    monthsAnalyzed: recentBuckets.length,
    dateRange: recentKeys.length >= 2 ? `${recentKeys[0]} to ${recentKeys.at(-1)}` : recentKeys[0] || "",
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/lib/finance-selectors.ts
git commit -m "feat: add income detection and real savings rate calculation"
```

---

## Task 9: Update Planning Screen with Real Numbers

**Files:**
- Modify: `frontend/src/components/pages/planning-screen.tsx`

- [ ] **Step 1: Import the new functions**

Add to the imports from `finance-selectors` (line 7):
```typescript
import { calculateAccountSummary, calculateRealSavingsRate, calculateScenarioProjection } from "@/lib/finance-selectors";
```

- [ ] **Step 2: Use real savings data for defaults**

After line 14 (`const accountSummary = ...`), add:
```typescript
const savingsRate = calculateRealSavingsRate(workspace.transactions);
```

Replace line 15:
```typescript
const [monthlySavings, setMonthlySavings] = useState(workspace.scenarios[0]?.monthlySavings ?? 3200);
```
with:
```typescript
const [monthlySavings, setMonthlySavings] = useState(
  savingsRate.monthlySavings > 0 ? Math.round(savingsRate.monthlySavings) : (workspace.scenarios[0]?.monthlySavings ?? 0)
);
```

- [ ] **Step 3: Add "show your math" labels**

After the sliders section (around line 60), add a data source explanation panel:
```tsx
<div className="mt-4 rounded-2xl border border-[var(--panel-border)] bg-[var(--panel-soft)] px-4 py-3 text-xs text-[var(--text-muted)]">
  <p className="font-medium text-[var(--text-secondary)]">Where these numbers come from</p>
  <ul className="mt-2 space-y-1">
    <li>Monthly savings: {formatCurrency(savingsRate.monthlySavings)} (avg of {savingsRate.dateRange || "no data"})</li>
    <li>Detected monthly income: {formatCurrency(savingsRate.monthlyIncome)}</li>
    <li>Detected monthly expenses: {formatCurrency(savingsRate.monthlyExpenses)}</li>
    <li>Market return: Your assumption (not a prediction)</li>
    <li>Current net worth: {formatCurrency(accountSummary.netWorth)} (from connected accounts + manual assets)</li>
  </ul>
</div>
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/pages/planning-screen.tsx
git commit -m "feat: planning screen uses real savings rate with show-your-math labels"
```

---

## Task 10: Fix Spending Screen — Tappable Categories and Percentage Fix

**Files:**
- Modify: `frontend/src/components/pages/spending-screen.tsx`

- [ ] **Step 1: Read the full spending screen to locate the category rendering section**

Read the file completely to find where `categoryPerformance` items are rendered and where percentages are displayed.

- [ ] **Step 2: Add category drill-down state**

Add to the existing state declarations (around line 63-72):
```typescript
const [drillDownCategoryId, setDrillDownCategoryId] = useState<string | null>(null);
```

- [ ] **Step 3: Add drill-down component**

Add a drill-down modal/panel that shows when a category is clicked. This should display:
- Category name and budget vs actual bar
- All transactions in that category for the current date range
- List of merchants contributing to that category

The exact implementation depends on the rendering pattern found in Step 1 — use `ModalShell` from primitives for the drill-down.

- [ ] **Step 4: Make category items clickable**

Wherever `categoryPerformance` items are rendered, add `onClick={() => setDrillDownCategoryId(item.categoryId)}` and `cursor-pointer` styling.

- [ ] **Step 5: Fix percentage calculation**

Find where percentages are rendered and ensure the formula is:
```typescript
const totalExpenses = sum(categoryPerformance.map((item) => item.spent));
const percentage = totalExpenses > 0 ? ((item.spent / totalExpenses) * 100).toFixed(1) : "0";
```

- [ ] **Step 6: Add empty state for categories with no spending**

Where categories with `spent === 0` are shown, render "No spending this period" instead of 0%.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/pages/spending-screen.tsx
git commit -m "feat: tappable category drill-down with fixed percentages and empty states"
```

---

## Task 11: Restructure AI Adviser — Ollama Streaming + Card Generator

**Files:**
- Modify: `frontend/src/lib/finance-advisor.ts`
- Modify: `frontend/src/lib/finance-store.tsx`
- Modify: `frontend/src/components/pages/advisor-screen.tsx`

- [ ] **Step 1: Extract card-only generation from finance-advisor.ts**

Rename `buildAdvisorReply` to `buildAdvisorCards` and change it to return only cards (no canned text). Replace the entire export at line 272:

```typescript
export function buildAdvisorCards(source: FinanceSourceData, workspace: FinanceWorkspace, prompt: string): ChatCardPayload[] {
  const normalizedPrompt = prompt.toLowerCase();

  if (!source.accounts.length && !source.transactions.length) return [];

  const promptTransaction = findTransactionFromPrompt(workspace, normalizedPrompt);

  if (promptTransaction && (normalizedPrompt.includes("why") || normalizedPrompt.includes("marked"))) {
    return buildTransactionExplanation(promptTransaction, workspace).cards;
  }
  if (normalizedPrompt.includes("spending") && (normalizedPrompt.includes("increase") || normalizedPrompt.includes("change"))) {
    return buildSpendingChangeReply(source, workspace).cards;
  }
  if (normalizedPrompt.includes("net worth")) {
    return buildNetWorthReply(source, workspace).cards;
  }
  if (normalizedPrompt.includes("subscription")) {
    return buildSubscriptionReply(source).cards;
  }
  if (normalizedPrompt.includes("largest spending") || normalizedPrompt.includes("top categories")) {
    return buildLargestCategoriesReply(source, workspace).cards;
  }
  if (normalizedPrompt.includes("review") || normalizedPrompt.includes("categorization")) {
    return buildReviewQueueReply(workspace).cards;
  }

  return buildDefaultReply(source, workspace).cards;
}
```

- [ ] **Step 2: Update finance-store.tsx to use streaming Ollama**

Replace the `askAdvisor` function (lines 362-383) with:

```typescript
async function askAdvisor(prompt: string) {
  const nextPrompt = prompt.trim();
  if (!nextPrompt) return;

  const userMessage: AdvisorMessage = {
    id: generateId("msg"),
    role: "user",
    content: nextPrompt,
    createdAt: new Date().toISOString(),
  };

  // Generate structured cards client-side
  const cards = buildAdvisorCards(source, workspace, nextPrompt);

  // Create placeholder assistant message for streaming
  const assistantId = generateId("msg");
  const assistantMessage: AdvisorMessage = {
    id: assistantId,
    role: "assistant",
    content: "",
    cards,
    createdAt: new Date().toISOString(),
  };

  setAdvisorMessages((current) => [...current, userMessage, assistantMessage]);

  try {
    // Get primary user ID for the backend
    const primaryUserId = source.meta.primaryUserId;
    if (!primaryUserId) throw new Error("No primary user");

    const response = await fetch("/api/useorigin/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: primaryUserId,
        message: nextPrompt,
        history: advisorMessages.slice(-10).map((m) => ({ role: m.role, content: m.content })),
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Ollama returned ${response.status}`);
    }

    // Read SSE stream
    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    let fullText = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split("\n").filter((l) => l.startsWith("data: "));

      for (const line of lines) {
        try {
          const parsed = JSON.parse(line.slice(6));
          if (parsed.content) {
            fullText += parsed.content;
            setAdvisorMessages((current) =>
              current.map((m) => (m.id === assistantId ? { ...m, content: fullText } : m)),
            );
          }
        } catch {
          // Skip unparseable lines
        }
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    setAdvisorMessages((current) =>
      current.map((m) =>
        m.id === assistantId
          ? { ...m, content: `AI adviser unavailable: ${errorMessage}. Check if Ollama is running.` }
          : m,
      ),
    );
  }
}
```

Also update the import at line 15:
```typescript
import { buildAdvisorCards } from "@/lib/finance-advisor";
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/finance-advisor.ts frontend/src/lib/finance-store.tsx
git commit -m "feat: streaming Ollama adviser with client-side card generation"
```

---

## Task 12: Enhance Chat Context in Backend

**Files:**
- Modify: `backend/src/routes/chat.js`

- [ ] **Step 1: Add budget and subscription data to the context query**

In the `Promise.all` block (lines 23-75), add two more queries:

```javascript
// Budget performance by category
pool.query(
  `SELECT c.name AS category_name, c.monthly_budget,
          COALESCE(SUM(ABS(t.amount)), 0) AS actual_spent
   FROM categories c
   LEFT JOIN transactions t ON (
     COALESCE(t.custom_category, t.category) = c.category_key
     AND t.date >= CURRENT_DATE - INTERVAL '30 days'
     AND t.amount < 0
   )
   JOIN users u ON c.user_id = u.id
   WHERE u.id = $1 AND c.monthly_budget IS NOT NULL
   GROUP BY c.name, c.monthly_budget
   ORDER BY actual_spent DESC`,
  [user_id]
),
// Monthly income vs expenses (last 3 months)
pool.query(
  `SELECT
     TO_CHAR(t.date, 'YYYY-MM') AS month,
     SUM(CASE WHEN t.amount > 0 THEN t.amount ELSE 0 END) AS income,
     SUM(CASE WHEN t.amount < 0 THEN ABS(t.amount) ELSE 0 END) AS expenses
   FROM transactions t
   JOIN accounts a ON t.account_id = a.id
   JOIN teller_enrollments te ON a.teller_enrollment_id = te.id
   WHERE te.user_id = $1
     AND t.date >= CURRENT_DATE - INTERVAL '90 days'
   GROUP BY TO_CHAR(t.date, 'YYYY-MM')
   ORDER BY month DESC
   LIMIT 3`,
  [user_id]
),
```

- [ ] **Step 2: Add the new data to the system prompt**

Destructure the new results and add to the system prompt before the closing `═══` line:

```javascript
BUDGET PERFORMANCE (Last 30 Days):
${budgetSummary || "  No budgets configured."}

MONTHLY CASH FLOW (Last 3 Months):
${monthlyCashFlow || "  No monthly data available."}
```

- [ ] **Step 3: Strengthen the grounding instruction**

Update the system prompt rules to add:
```
- If a question requires data you don't have, say "I don't have enough data to answer that" rather than guessing.
- When citing numbers, identify their source (e.g., "Based on your last 30 days of transactions...").
```

- [ ] **Step 4: Commit**

```bash
git add backend/src/routes/chat.js
git commit -m "feat: richer financial context for Ollama with budget and cash flow data"
```

---

## Task 13: Fix Theme for Workspace Overlays

**Files:**
- Modify: `frontend/src/components/app-shell.tsx`
- Modify: `frontend/src/app/globals.css`

- [ ] **Step 1: Read app-shell.tsx completely to find overlay components**

Read the full file to identify all overlay panels (notifications, settings, workspace controls) and audit their color usage.

- [ ] **Step 2: Replace hardcoded colors with theme variables**

In any overlay panel, replace:
- `text-white` → `text-[var(--text-primary)]`
- `text-slate-400` or `text-gray-400` → `text-[var(--text-secondary)]`
- `text-slate-500` or `text-gray-500` → `text-[var(--text-muted)]`
- `bg-white/5` → `bg-[var(--panel-soft)]`
- `bg-slate-800` → `bg-[var(--panel-strong)]`
- `border-white/8` → `border-[var(--panel-border)]`
- Any other hardcoded dark-only colors

- [ ] **Step 3: Audit the advisor screen for hardcoded colors**

In `advisor-screen.tsx`, the assistant message bubble uses `text-white` (line 50). Change to `text-[var(--text-primary)]`.

The section heading uses `text-white` for the chat title (line 41). Change to `text-[var(--text-primary)]`.

- [ ] **Step 4: Verify both themes visually**

Open `http://localhost:3000` and toggle between dark and light mode. Check every screen for unreadable text.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/app-shell.tsx frontend/src/components/pages/advisor-screen.tsx frontend/src/app/globals.css
git commit -m "fix: workspace overlays and advisor use theme variables for both dark and light mode"
```

---

## Task 14: Add Sync Button with Feedback to App Shell

**Files:**
- Modify: `frontend/src/lib/utils.ts`
- Modify: `frontend/src/components/app-shell.tsx`
- Modify: `frontend/src/lib/finance-store.tsx`

- [ ] **Step 0: Add formatRelativeTime to utils.ts**

Add to `frontend/src/lib/utils.ts`:

```typescript
export function formatRelativeTime(isoDate: string) {
  const seconds = Math.round((Date.now() - new Date(isoDate).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}
```

- [ ] **Step 1: Add sync state and function to finance-store.tsx**

Add to the `FinanceStoreValue` interface:
```typescript
syncStatus: { state: "idle" | "syncing" | "success" | "error"; message: string; lastSyncedAt: string | null };
triggerSync: (fullHistory?: boolean) => Promise<void>;
```

Add state and function in the provider:
```typescript
const [syncStatus, setSyncStatus] = useState<FinanceStoreValue["syncStatus"]>({
  state: "idle",
  message: "",
  lastSyncedAt: null,
});

async function triggerSync(fullHistory = false) {
  setSyncStatus({ state: "syncing", message: "Syncing accounts...", lastSyncedAt: syncStatus.lastSyncedAt });
  try {
    const primaryUserId = source.meta.primaryUserId;
    if (!primaryUserId) throw new Error("No user linked");

    const result = await api<{
      success: boolean;
      transactions: { added: number; updated: number };
      errors: Array<{ code: string; message: string }>;
    }>("/teller/sync-transactions", {
      method: "POST",
      body: JSON.stringify({ user_id: primaryUserId, full_history: fullHistory }),
    });

    if (result.errors?.length) {
      setSyncStatus({
        state: "error",
        message: result.errors[0].message,
        lastSyncedAt: syncStatus.lastSyncedAt,
      });
    } else {
      setSyncStatus({
        state: "success",
        message: `Added ${result.transactions.added}, updated ${result.transactions.updated}`,
        lastSyncedAt: new Date().toISOString(),
      });
      await refreshWorkspace();
    }
  } catch (error) {
    setSyncStatus({
      state: "error",
      message: error instanceof Error ? error.message : "Sync failed",
      lastSyncedAt: syncStatus.lastSyncedAt,
    });
  }
}
```

- [ ] **Step 2: Add sync button and last-synced display to app-shell.tsx**

In the workspace header area, add:
```tsx
<button onClick={() => triggerSync()} disabled={syncStatus.state === "syncing"}>
  <RefreshCcw className={`h-4 w-4 ${syncStatus.state === "syncing" ? "animate-spin" : ""}`} />
  {syncStatus.state === "syncing" ? "Syncing..." : "Sync"}
</button>
{syncStatus.lastSyncedAt && (
  <span className="text-xs text-[var(--text-muted)]">
    Last synced: {formatRelativeTime(syncStatus.lastSyncedAt)}
  </span>
)}
{syncStatus.state === "error" && (
  <span className="text-xs text-red-400">{syncStatus.message}</span>
)}
{syncStatus.state === "success" && (
  <span className="text-xs text-green-400">{syncStatus.message}</span>
)}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/finance-store.tsx frontend/src/components/app-shell.tsx
git commit -m "feat: sync button with progress feedback and last-synced timestamp"
```

---

## Task 15: Add "All Time" Option to Date Range Selector UI

**Files:**
- Modify: `frontend/src/components/app-shell.tsx`

- [ ] **Step 1: Locate the date range selector in app-shell.tsx**

Find where `setDateRange` is called with the range options ("30d", "90d", etc.) and add `"all"` to the list with label "All Time".

- [ ] **Step 2: Add the option**

Add alongside the existing options:
```tsx
<button onClick={() => setDateRange("all")} className={dateRange === "all" ? activeClass : inactiveClass}>
  All Time
</button>
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/app-shell.tsx
git commit -m "feat: add All Time option to date range selector"
```

---

## Task 16: Ollama Batch Categorization (Phase 2)

**Files:**
- Modify: `backend/src/routes/chat.js`
- Modify: `backend/src/routes/teller.js`

- [ ] **Step 1: Add batch categorization endpoint to chat.js**

Add before the `module.exports`:

```javascript
let isBatchRunning = false;

router.post("/batch-categorize", async (req, res) => {
  if (isBatchRunning) {
    return res.json({ status: "already_running" });
  }

  const { user_id } = req.body;
  if (!user_id) {
    return res.status(400).json({ error: "user_id is required" });
  }

  // Fire and forget — respond immediately
  res.json({ status: "started" });

  isBatchRunning = true;
  try {
    // Get uncategorized transactions (no custom_category, category is null or generic)
    const uncategorized = await pool.query(
      `SELECT t.id, t.description, t.counterparty_name, t.amount
       FROM transactions t
       JOIN accounts a ON t.account_id = a.id
       JOIN teller_enrollments te ON a.teller_enrollment_id = te.id
       WHERE te.user_id = $1
         AND t.custom_category IS NULL
         AND (t.category IS NULL OR t.category = '')
       ORDER BY t.date DESC
       LIMIT 100`,
      [user_id]
    );

    if (!uncategorized.rows.length) return;

    // Get available categories
    const categories = await pool.query(
      `SELECT category_key, name FROM categories WHERE user_id = $1`,
      [user_id]
    );
    const categoryList = categories.rows.map((c) => c.name).join(", ");

    // Process in batches of 10
    for (let i = 0; i < uncategorized.rows.length; i += 10) {
      const batch = uncategorized.rows.slice(i, i + 10);
      const batchText = batch
        .map((t) => `- "${t.counterparty_name || t.description}": $${Math.abs(parseFloat(t.amount)).toFixed(2)}`)
        .join("\n");

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);

      try {
        const ollamaRes = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            model: OLLAMA_MODEL,
            messages: [
              {
                role: "system",
                content: `You categorize financial transactions. Available categories: ${categoryList}. For each transaction, respond with ONLY a JSON array of objects: [{"merchant": "...", "category": "..."}]. Use exact category names from the list.`,
              },
              {
                role: "user",
                content: `Categorize these transactions:\n${batchText}`,
              },
            ],
            stream: false,
          }),
        });

        clearTimeout(timeout);

        if (ollamaRes.ok) {
          const data = await ollamaRes.json();
          const content = data.message?.content || "";

          try {
            const jsonMatch = content.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
              const results = JSON.parse(jsonMatch[0]);
              for (const result of results) {
                if (result.merchant && result.category) {
                  const categoryKey = result.category.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
                  await pool.query(
                    `INSERT INTO categorization_rules (user_id, name, description, criteria, actions, source)
                     VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, 'ai')
                     ON CONFLICT (user_id, name) DO UPDATE SET
                       criteria = EXCLUDED.criteria,
                       actions = EXCLUDED.actions,
                       updated_at = NOW()`,
                    [
                      user_id,
                      `AI: ${result.merchant} → ${result.category}`,
                      `Auto-categorized by Ollama.`,
                      JSON.stringify([{ type: "merchant_contains", value: result.merchant.toLowerCase() }]),
                      JSON.stringify([{ type: "set_category", categoryId: categoryKey }]),
                    ]
                  );
                }
              }
            }
          } catch {
            console.warn("[Chat] Failed to parse batch categorization response");
          }
        }
      } catch (batchError) {
        clearTimeout(timeout);
        console.warn("[Chat] Batch categorization timeout/error:", batchError.message);
      }
    }
  } catch (error) {
    console.error("[Chat] Batch categorization error:", error.message);
  } finally {
    isBatchRunning = false;
  }
});
```

- [ ] **Step 2: Trigger batch categorization after sync**

In `teller.js`, after the successful sync response (just before `res.json({...})`), add:

```javascript
// Fire-and-forget: trigger batch categorization
fetch(`http://localhost:${process.env.PORT || 4000}/api/chat/batch-categorize`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ user_id }),
}).catch((err) => console.warn("[Teller] Batch categorize trigger failed:", err.message));
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/routes/chat.js backend/src/routes/teller.js
git commit -m "feat: Ollama batch categorization triggered after sync (Phase 2)"
```

---

## Task 17: Final Integration Test and Docker Rebuild

- [ ] **Step 1: Rebuild Docker containers**

Run: `cd "D:\Useorigin copy" && docker compose build --no-cache backend frontend`

- [ ] **Step 2: Restart all services**

Run: `docker compose up -d`

- [ ] **Step 3: Test sync endpoint**

Run: `curl -s -X POST http://localhost:4000/api/teller/sync-transactions -H "Content-Type: application/json" -d '{"user_id":"<EMIL_USER_ID>","full_history":true}' | jq`

- [ ] **Step 4: Verify workspace loads with all new data**

Run: `curl -s http://localhost:4000/api/workspace?days=365 | jq '.enrollments[0].last_synced_at'`

- [ ] **Step 5: Open the app and test each screen**

Open: `http://localhost:3000`

Verify:
- [ ] Date range selector shows "All Time" option
- [ ] Sync button shows progress and last-synced timestamp
- [ ] Spending screen: categories are tappable with drill-down
- [ ] Planning screen: shows real savings rate with source labels
- [ ] Advisor screen: responses stream from Ollama (not canned)
- [ ] Dark/light toggle: all overlays readable in both modes
- [ ] Subscriptions: frequency-based detection shows real recurring charges

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "chore: final integration verification"
```
