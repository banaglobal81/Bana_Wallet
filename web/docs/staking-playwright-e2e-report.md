# BANA Staking — Playwright (browser) E2E Report

**Date:** 2026‑07‑02
**Tool:** `@playwright/test@latest` (Chromium)
**Scope:** Real browser E2E of the **Staking UI** — login → staking page → product + staked position with live accrued interest.
**Result:** ✅ **1 passed** (7.7s). HTML report: `web/playwright-report/index.html`.

```
✓  e2e/staking.spec.ts › Staking › user logs in and sees the product + their
    staked position with accrued interest (7.7s)
  1 passed (11.6s)
```

---

## 1. What the test does

Runs against a real dev server (Playwright boots `npm run dev`), driving an actual Chromium browser:

1. **Log in** through the real credentials form (`/en/login`, fills `#email`/`#password`, submits).
2. Waits for the post‑login redirect, then opens **`/en/staking`**.
3. Asserts the **Staking** page renders (`data-testid="staking-title"`).
4. Asserts the **Earn** section shows the seeded product's daily rate (**0.7%**).
5. Asserts **My Stakes** shows the staked position (`data-testid="staking-position"`) with the **principal (5,000 USDT)** and the **live accrued interest (175 USDT)**.

**Accrued check:** `5,000 × 0.7% × 5 days = 175 USDT` — computed live by the UI and asserted in the browser.

## 2. Setup (files added)

| File | Purpose |
|---|---|
| `playwright.config.ts` | Chromium project; `webServer` boots `npm run dev`; HTML + list reporters; `globalSetup`. |
| `e2e/global-setup.ts` | Seeds (idempotently) a test user with a bcrypt password + one OPEN 90‑day/0.7% product + a back‑dated position (5 days elapsed). |
| `e2e/staking.spec.ts` | The test above. |
| `src/components/Staking.tsx` | Added stable `data-testid`s: `staking-title`, `staking-position`, `position-accrued`. |

Seed data is named `E2E …` / `e2e-staking@example.com` and is **cleaned up** before each run and after this report's run (no pollution of the real product list).

> Note: the position is seeded directly (not staked via the UI) because staking through the form requires a funded **Nia‑Hub** balance, which isn't available on a local machine. The **stake form validation** (amount brackets, capacity, available balance) is enforced in `/api/staking/stake` and covered by code review; the **payout engine** is covered by the backend E2E (`staking-e2e-report.md`).

## 3. How to run

```bash
cd web
npm run test:e2e            # runs Playwright (boots the dev server automatically)
npx playwright show-report # opens the HTML report
```

## 4. Coverage summary

| Layer | Covered by | Status |
|---|---|---|
| Daily interest **payout engine** (worker/cron, math, idempotency, maturity) | `docs/staking-e2e-report.md` (backend E2E) | ✅ 6/6 |
| **Staking UI** (login → products → position → accrued interest, in a real browser) | this Playwright E2E | ✅ 1/1 |

Together they cover the core staking system end‑to‑end: the UI a customer sees **and** the settlement the worker performs.
