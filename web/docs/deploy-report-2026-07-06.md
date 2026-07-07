# BANA Wallet — Production Deploy Report

**Date:** 2026-07-06
**Trigger:** `git push` → Railway auto-deploy of the **Bana_Wallet** service (production).
**Overall:** ✅ **Deploy is GREEN and the site is live.** Two production config items need action before the daily payout / MLM can operate (below).

---

## 1. Git — pushed ✅
- `origin/main` = `3e4995a` — in sync with local, nothing unpushed.
- Both referral migrations are on the remote (`add_referral_tree`, `add_referral_bonus_payout`).

## 2. Railway deploy — GREEN ✅
From the deploy logs:
- **20 migrations found**, and the 2 new ones **applied successfully**:
  `add_referral_tree`, `add_referral_bonus_payout`.
- **Staking seed ran:** BANA-only — 5 products, 0 created (already existed), 0 non-BANA removed.
- **App started clean:** `next start` → Ready on :8080.

## 3. Production live checks ✅
| Check | Result |
|---|---|
| `banawallet.com/en/login` | 200 ✅ |
| `banawallet.com/api/auth/csrf` | 200 ✅ |
| `/en/staking` (logged out) | 302 → login ✅ (access-control fix working) |
| `/api/coins` (logged out) | 401 ✅ (protected) |

## 4. Safety flags — correct ✅
| Flag | State | Meaning |
|---|---|---|
| `REFERRAL_BONUS_ENABLED` | **not set** | MLM commission **OFF** — correct (waiting on legal + spec) |
| `STAKING_DAY_MS` / `NEXT_PUBLIC_STAKING_DAY_MS` | **not set** | Real **24h day** — correct (no test clock in prod) |

## 5. What is now LIVE on production
- Referral **tree** (records who invited whom) + invite link/code on the Staking page.
- **Admin commission view** (shows "flag OFF" until enabled).
- MLM **commission engine** — present but **OFF** (safe).
- BANA-only staking, admin staking tools (run settlement, editable products, KPIs).
- The logged-out **admin access-control fix**.

---

## ⚠️ Action items before launch (config/ops — not code)

### A. CRON_SECRET is NOT set → daily staking interest will NOT pay automatically
- `POST /api/cron/staking` on production returns **503 ("CRON_SECRET not configured")**.
- **Fix:** set `CRON_SECRET` on the **Bana_Wallet** service (Railway → Variables), value e.g. `openssl rand -hex 32`.
- Then set the **same value** on the **wallet-worker** service and give it a **Cron Schedule** (`0 0 * * *`) with `WEB_URL=https://banawallet.com`, so the daily payout actually runs. (Until this is done, interest only accrues on-screen but is never credited by the daily job.)

### B. Earnings → withdrawable balance (the "make it real" gap)
- Staking interest **and** referral commission are recorded in ledgers but **not yet moved into a user's spendable/withdrawable balance**. A user would see earnings but couldn't withdraw them. This is the #1 item to make earnings actually usable.

### C. MLM go-live prerequisites (keep OFF until done)
- Senior confirms the **uni-level base** (currently: each generation's daily interest).
- **Legal / regulatory sign-off** (deck marks it DRAFT).
- Only then set `REFERRAL_BONUS_ENABLED=true`.

---

## Summary
- ✅ Push + deploy succeeded; migrations applied; site healthy; safety flags correct.
- ⚠️ **Set `CRON_SECRET`** (A) so daily interest pays; wire the worker cron.
- ⚠️ **Credit earnings to real balance** (B) so they're withdrawable.
- ⏳ MLM stays OFF until legal + spec (C).

No code changes needed for A/C — they're Railway settings + decisions. B needs the Nia balance integration (code) — flag if you want me to scope it.
