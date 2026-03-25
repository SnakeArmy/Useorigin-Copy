# Northstar Frontend

Premium authenticated fintech UI built with `Next.js + TypeScript + Tailwind + Recharts + Framer Motion`.

## What’s included

- Multi-page authenticated app shell with sidebar, top command/search, notifications, theme toggle, and persistent AI entry point
- Original product identity and layout system for `Overview`, `Spending`, `Investments`, `Planning`, `Household`, `Advisor`, and `Settings`
- Realistic finance seed data for accounts, transactions, budgets, goals, holdings, bills, insights, and household activity
- Frontend categorization engine with:
  - merchant normalization
  - seeded category taxonomy
  - confidence states
  - rule criteria + actions
  - recurring/subscription detection
  - bulk edit and review queue flows
- Same-origin frontend proxy for the existing backend so the browser no longer needs to call `localhost:4000` directly

## App structure

- [`src/app/(app)`](/D:/Useorigin%20copy/frontend/src/app/(app)) contains the authenticated route pages
- [`src/components/app-shell.tsx`](/D:/Useorigin%20copy/frontend/src/components/app-shell.tsx) defines the navigation shell, command palette, notifications tray, and topbar
- [`src/components/pages`](/D:/Useorigin%20copy/frontend/src/components/pages) contains the page-level product screens
- [`src/lib/finance-store.tsx`](/D:/Useorigin%20copy/frontend/src/lib/finance-store.tsx) is the shared client store for workspace state, edits, and AI/chat actions
- [`src/lib/mock-data.ts`](/D:/Useorigin%20copy/frontend/src/lib/mock-data.ts) holds the realistic seed dataset
- [`src/lib/categorization.ts`](/D:/Useorigin%20copy/frontend/src/lib/categorization.ts) contains taxonomy, merchant normalization, rule logic, and confidence handling
- [`src/app/api/useorigin/[...path]/route.ts`](/D:/Useorigin%20copy/frontend/src/app/api/useorigin/[...path]/route.ts) proxies frontend requests to the backend

## Backend integration

The UI is designed to work in two modes:

1. Mock-first fallback
   - The app always has polished demo data from `mock-data.ts`.
2. Live hydration
   - On mount, `FinanceStoreProvider` attempts to load:
     - `/accounts/users`
     - `/accounts`
     - `/transactions`
   - If successful, live account and transaction data replace the matching parts of the mock workspace.

That means:

- `Overview` and `Spending` already plug into your current account + transaction backend when available.
- `Investments`, `Planning`, `Household`, and some advisor cards still use frontend seed data until you expose corresponding endpoints.

## Proxy behavior

Browser requests go to `/api/useorigin/...` instead of the backend directly.

The proxy will try these targets in order:

- `USEORIGIN_BACKEND_URL`
- `INTERNAL_API_URL`
- `http://backend:4000`
- `http://localhost:4000`

Set one of the env vars above if you want deterministic routing outside the current Docker/local setup.

## Categorization extension points

If you want to connect the frontend categorization workspace to your real import pipeline, the main handoff points are:

- `mapBackendTransaction(...)` in [`src/lib/finance-store.tsx`](/D:/Useorigin%20copy/frontend/src/lib/finance-store.tsx)
- `normalizeMerchant(...)` in [`src/lib/categorization.ts`](/D:/Useorigin%20copy/frontend/src/lib/categorization.ts)
- `enrichTransactions(...)` in [`src/lib/categorization.ts`](/D:/Useorigin%20copy/frontend/src/lib/categorization.ts)

Recommended backend additions later:

- category groups + subcategories API
- tag CRUD
- persistent rules API
- transaction audit history
- AI categorization suggestions API
- household permissions API
- investment and planning endpoints

## Commands

```bash
npm run dev
npm run lint
npm run build
```
