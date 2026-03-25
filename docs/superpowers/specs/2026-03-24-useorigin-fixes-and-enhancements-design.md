# UseOrigin Fixes & Enhancements Design

**Date:** 2026-03-24
**Status:** Approved
**Author:** Emil + Claude (brainstorming)

## Context

UseOrigin is a self-hosted, privacy-first household finance dashboard built with Next.js 15, Express, PostgreSQL, and Ollama (Llama 3 8B). It connects to real bank accounts via Teller.io with mTLS authentication. The app is functional but has significant issues with data accuracy, interactivity, and AI features.

**Primary user:** Emil (sole active user; household features deprioritized).

## Goals

1. Make financial data trustworthy — accurate categorization, real numbers, no phantom figures.
2. Restore reliable data connectivity via Teller sync with clear feedback.
3. Make the UI interactive where it should be (tappable categories, drill-downs).
4. Make the AI adviser useful by leveraging the already-running Ollama instance.
5. Enable deep analysis on demand via Claude Code data skills against PostgreSQL.

## Non-Goals

- Household/multi-user features (deprioritized — sole user).
- Cloud sync or telemetry.
- Claude API integration in the app (Ollama stays as in-app AI).
- Mobile app or responsive redesign.

---

## Phase 1: Fix What's Broken

### 1.1 Teller Sync & Data Connectivity

**Problem:** Sync fails silently. No user feedback. No way to know if data is fresh.

**Changes:**

- **Backend `POST /api/teller/sync-transactions`** returns structured error states: `cert_expired`, `enrollment_stale`, `rate_limited`, `success`. Wrap Teller API calls in try/catch with specific error classification.
- **Frontend sync feedback:** Progress indicator ("Syncing 3 accounts..."), success summary ("Added 47 transactions, updated 12"), or actionable error ("Enrollment expired — please re-link your bank").
- **Re-enrollment flow:** If enrollment is stale, surface a button to re-connect via the existing Teller Connect widget.
- **Last sync timestamp:** Display "Last synced: 2 hours ago" in the workspace header. Store timestamp in `localStorage` after each successful sync.
- **Full historical pull:** On first sync or user request, fetch all available history from Teller (typically 1-2 years depending on institution). Existing deduplication on `teller_transaction_id` prevents duplicates.

**Files affected:**
- `backend/src/routes/teller.js` — error handling, full history option
- `frontend/src/lib/finance-store.tsx` — sync state, progress tracking
- `frontend/src/components/` — sync button UI, last-sync display

### 1.2 Categorization Engine (Rule-Based Fixes)

**Problem:** ~10 hardcoded regex patterns. Unrecognized merchants get miscategorized silently.

**Changes:**

- **Expand pattern library:** Query actual merchant names from the transactions table and build rules that match real spending patterns, not generic assumptions.
- **Fix confidence scores:** Replace hardcoded 0.52-0.95 values with meaningful scores. Exact merchant match = 0.95, fuzzy match = 0.70, pattern match = 0.50, no match = 0.0.
- **Uncategorized bucket:** Transactions with no rule match are marked "Uncategorized" with a visible flag instead of being silently assigned to an incorrect category.
- **User corrections create rules:** When a user manually recategorizes a transaction, auto-create a `categorization_rule` for that merchant. Future transactions from the same merchant are categorized correctly without manual intervention.

**Files affected:**
- `frontend/src/lib/categorization.ts` — expanded patterns, confidence logic, uncategorized handling
- `backend/src/routes/transactions.js` — auto-rule creation on category override
- `database/init.sql` — no schema changes needed (categorization_rules table exists)

### 1.3 Budget vs Actual & Interactive UI

**Problem:** Category items not clickable. Percentages may be wrong. Budgets are hardcoded defaults.

**Changes:**

- **Tappable categories:** Clicking a category opens a drill-down view showing: all transactions in that category for the selected date range, budget vs actual bar, list of contributing merchants.
- **Fix percentage calculation:** `category spend / total expenses * 100`. Audit `calculateCategoryPerformance()` in `finance-selectors.ts` to ensure the divisor is total expenses, not some other value.
- **Budgets from real data:** Replace hardcoded default budgets ($950 groceries, $2500 rent) with calculated 3-month averages from actual spending. User can still manually override.
- **Empty state:** Categories with no transactions show "No spending this period" instead of misleading 0%.

**Files affected:**
- `frontend/src/components/pages/spending-screen.tsx` — drill-down UI, click handlers
- `frontend/src/lib/finance-selectors.ts` — percentage fix, budget calculation from actuals

### 1.4 Date Range — All Time & Historical Data

**Problem:** Only 30d/90d/180d/365d options. No way to see full financial history.

**Changes:**

- **"All Time" option:** Add to the date range selector alongside existing options. No date filter applied — pulls all stored transactions.
- **Chart granularity adaptation:** When "All Time" is selected, charts group by month instead of day/week to remain readable.
- **Sync depth:** Full historical pull (Section 1.1) ensures "All Time" has meaningful data to show.

**Files affected:**
- `frontend/src/lib/finance-store.tsx` — date range state, "all" option
- `frontend/src/components/` — date range selector UI
- `frontend/src/lib/finance-selectors.ts` — granularity logic for charts

### 1.5 Subscription Detection

**Problem:** Hardcoded regex matches only Netflix, Spotify, Apple, HBO, Notion. Real subscriptions go undetected.

**Changes:**

- **Frequency-based detection:** Analyze transaction history per merchant. Charges at regular intervals (25-35 days = monthly, 85-95 days = quarterly, 350-380 days = annual) are flagged as subscriptions.
- **Amount consistency:** Combine frequency detection with amount similarity check. Same merchant + similar amount + regular interval = high-confidence subscription.
- **Subscriptions dashboard:** Display detected subscriptions with: merchant name, amount per cycle, frequency, annualized cost, next expected charge date, total monthly subscription spend.
- **Manual add/remove:** User can mark any transaction as a subscription or dismiss a false positive.

**Files affected:**
- `frontend/src/lib/finance-selectors.ts` — `calculateBills()` rewrite with frequency/amount logic
- `frontend/src/components/pages/` — subscriptions dashboard component
- `frontend/src/lib/categorization.ts` — remove hardcoded subscription regex dependency

### 1.6 Future Planning (Real Numbers)

**Problem:** Projections use hardcoded defaults ($3200/mo savings, 6.5% return). Mysterious $620 figure.

**Changes:**

- **Real savings rate:** `Monthly savings = Total income - Total expenses` averaged over last 3 months of actual data. Display: "Based on your data, you save ~$X/month."
- **Income detection:** Identify income transactions (payroll, direct deposits) from Teller data by direction and amount. Display: "Detected monthly income: $X" with manual correction option.
- **Market return as user assumption:** Keep the slider but label it "Your assumption" — not presented as a fact.
- **Remove phantom numbers:** Any projection value that can't trace to real data or a user-set assumption is removed.
- **Show your math:** Each projection line item shows its source. "Monthly savings: $2,100 (avg of Jan-Mar 2026)" not just "$2,100".

**Files affected:**
- `frontend/src/components/pages/planning-screen.tsx` — real data integration, show-your-math labels
- `frontend/src/lib/finance-selectors.ts` — income detection, savings rate calculation

### 1.7 Theme & UI Bug Fixes

**Problem:** Dark/light toggle works on main app but workspace controls overlay has hardcoded colors — text unreadable in one mode.

**Changes:**

- **Theme variable inheritance:** All overlay components (Linked Institutions, Notifications, Privacy/Security, Household Access) use CSS custom properties (`--text-muted`, `--bg-surface`, etc.) instead of hardcoded colors.
- **Contrast audit:** Verify every overlay panel renders correctly in both dark and light mode.
- **Test coverage:** Both themes tested across all screens before completion.

**Files affected:**
- `frontend/src/components/` — workspace overlay components, CSS/Tailwind classes
- `frontend/src/app/globals.css` or equivalent — theme variable definitions

### 1.8 AI Adviser (Ollama-First)

**Problem:** Adviser returns canned responses from `buildAdvisorReply()`. Ollama is running but underutilized.

**Changes:**

- **Remove static fallback:** Delete the `buildAdvisorReply()` canned response path. Every query goes to Ollama. If Ollama is unreachable, show a clear error: "AI adviser unavailable — check if Ollama is running."
- **Richer financial context:** Expand the context sent to Ollama to include: full spending breakdown by category, monthly income vs expenses trend (last 3-6 months), budget vs actual per category, detected recurring bills/subscriptions, actual savings rate.
- **Grounded system prompt:** "Only reference numbers from the provided data. If you don't have enough data to answer, say so. Never invent figures."
- **Streaming responses:** Ensure the frontend uses the existing streaming infrastructure so responses appear progressively.

**Files affected:**
- `frontend/src/lib/finance-advisor.ts` — remove fallback, expand context gathering
- `backend/src/routes/chat.js` — richer context query, improved system prompt
- `frontend/src/components/pages/advisor-screen.tsx` — streaming display, error states

---

## Phase 2: Smart Enhancements (Background)

### 2.1 Ollama Batch Categorization

After sync completes, a background job sends uncategorized transactions to Ollama in batches of 10. Prompt: "Given this merchant name and amount, what spending category does this belong to? Choose from: [user's category list]." Results are applied with a confidence score.

**Files affected:**
- `backend/src/routes/teller.js` — post-sync categorization job
- `backend/src/routes/chat.js` — batch categorization endpoint

### 2.2 Learning from Corrections

User category overrides automatically create categorization rules in the `categorization_rules` table. Future transactions from the same merchant match instantly without hitting Ollama. This is implemented in Phase 1 (Section 1.2) but the feedback loop with Ollama categorization is Phase 2.

### 2.3 Low-Confidence Review Queue

Transactions where Ollama assigns a category with less than 0.60 confidence are flagged in a review queue. User sees a notification: "12 transactions need your review." Reviewing and confirming/correcting trains the rule set.

**Files affected:**
- `frontend/src/components/` — review queue UI, notification badge
- `frontend/src/lib/finance-selectors.ts` — low-confidence filter

### 2.4 Claude Code Data Skills Integration

No code changes. Document how to connect Claude Code data skills to the PostgreSQL instance:

- **Connection:** `localhost:5432`, database `useorigin`, credentials from `docker-compose.yml`
- **Available skills:** `data:analyze`, `data:build-dashboard`, `data:create-viz`, `data:statistical-analysis`
- **Use cases:** Spending trend analysis, anomaly detection, custom visualizations, deep financial reports

The categorization improvements in Phase 1 directly enhance the quality of any data skill queries.

---

## Architecture Notes

- **No schema changes required.** All tables needed already exist.
- **No new dependencies.** Ollama, Teller, PostgreSQL are already in the stack.
- **Privacy preserved.** No data leaves the local network. Ollama runs locally. Claude Code data skills query the local database directly.
- **Incremental delivery.** Phase 1 items are independent and can be completed in any order. Phase 2 items depend on Phase 1 categorization being in place.

## Key Files Reference

| Component | File |
|-----------|------|
| Teller sync | `backend/src/routes/teller.js` |
| Transaction routes | `backend/src/routes/transactions.js` |
| Chat/Adviser routes | `backend/src/routes/chat.js` |
| Workspace routes | `backend/src/routes/workspace.js` |
| Finance store | `frontend/src/lib/finance-store.tsx` |
| Selectors | `frontend/src/lib/finance-selectors.ts` |
| Categorization | `frontend/src/lib/categorization.ts` |
| Advisor logic | `frontend/src/lib/finance-advisor.ts` |
| Spending screen | `frontend/src/components/pages/spending-screen.tsx` |
| Planning screen | `frontend/src/components/pages/planning-screen.tsx` |
| Advisor screen | `frontend/src/components/pages/advisor-screen.tsx` |
| Settings screen | `frontend/src/components/pages/settings-screen.tsx` |
