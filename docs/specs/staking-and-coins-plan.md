# Plan — Staking & Coin Management

> Status: **DRAFT for review** (senior + team). No code written yet.
> Source: senior's requirements (translated). Scope: BANA Wallet (Next.js 15 + Prisma 7 + Nia-Hub).

---

## 1. Summary

Two admin-driven features:

1. **Staking** — a platform-run, fixed-term savings product. Admin opens/closes staking
   products per coin, each with its own **term** and **daily interest rate**. Users lock
   funds for the term; interest accrues daily; at maturity the principal unlocks back into
   the wallet plus the earned interest. Multiple coins supported.
2. **Coin management** — admin maintains the list of coins shown to users (toggle Nia's
   supported coins + add/remove custom EVM tokens).

**Key nature:** this is **platform-defined interest**, not on-chain yield — the platform
owes the interest. The principal and interest are real funds, so money movement is the
critical design point (see §4 and §7).

## 2. Locked decisions

- **No early unstake** — funds are locked until maturity (simplest, safest to launch).
- **Coin scope** — a single "managed coin list": toggle Nia coins + add custom EVM tokens,
  with custom tokens clearly marked "deposit/withdraw not yet available" unless Nia supports
  them (no fake functionality).
- **Deliver in 2 phases** — Phase 1 is everything we fully control; Phase 2 is the interest
  payout into the Nia wallet (depends on a Nia capability — see §7).

---

## 3. Staking

### 3.1 Concepts
- **StakingProduct** — an offer the admin creates: a coin + term (days) + daily rate +
  open/closed state + optional min/max amount and capacity.
- **StakePosition** — a single user's stake into a product: principal, rate snapshot,
  start time, maturity time, status, accrued interest.

### 3.2 Data model (Prisma — new tables, migration only)
```prisma
enum StakingProductStatus { OPEN CLOSED }        // CLOSED = no new stakes; existing keep running
enum StakePositionStatus  { ACTIVE MATURED PAID } // PAID = principal+interest settled to wallet

model StakingProduct {
  id            String   @id @default(cuid())
  coin          String                       // e.g. "USDT" (must exist in the managed coin list)
  name          String                       // admin-facing label, e.g. "USDT 30-Day"
  termDays      Int                           // lock duration
  dailyRatePct  String                        // daily interest %, decimal string (e.g. "0.05" = 0.05%/day)
  minAmount     String?                       // optional per-stake minimum
  maxAmount     String?                       // optional per-stake maximum
  capacity      String?                       // optional total principal cap across all users
  status        StakingProductStatus @default(OPEN)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  positions     StakePosition[]
}

model StakePosition {
  id           String   @id @default(cuid())
  userId       String                         // session-derived, never client-supplied
  productId    String
  coin         String
  principal    String                         // decimal string
  dailyRatePct String                         // snapshot of the rate at stake time (rate changes don't affect existing)
  termDays     Int                            // snapshot
  startAt      DateTime @default(now())
  maturityAt   DateTime                       // startAt + termDays
  status       StakePositionStatus @default(ACTIVE)
  paidAt       DateTime?
  createdAt    DateTime @default(now())
  product      StakingProduct @relation(fields: [productId], references: [id])
  @@index([userId, status])
}
```
All money fields are **decimal strings** (CLAUDE.md rule 2 — `decimal.js` only).

### 3.3 Interest accrual (no fragile cron)
Computed **on read** so it's always correct without a background job:
```
elapsedDays = clamp(floor(now - startAt in days), 0, termDays)
accrued     = principal × (dailyRatePct / 100) × elapsedDays      // simple daily interest
matured     = now >= maturityAt
payout      = principal + (principal × dailyRatePct/100 × termDays) // full term interest at maturity
```
- Simple (non-compounding) daily interest — matches "daily interest rate" wording.
- The rate is **snapshotted** per position, so an admin changing a product's rate later does
  **not** change stakes already running.

### 3.4 Principal locking (Phase 1, fully ours)
- On stake: verify the user's **available** Nia balance ≥ amount, then create an ACTIVE
  position. The principal is **soft-locked** in our DB — it physically stays in the Nia
  wallet but becomes **non-withdrawable**.
- Enforcement: `availableToWithdraw(coin) = niaBalance(coin) − Σ(active staked principal for coin)`.
  This is applied in the **withdrawal route** and the balance display (so locked funds can't
  be withdrawn or double-spent).
- At maturity: the position's principal stops being locked (it was never moved, so it's
  simply "released" back to available) — this satisfies requirement #5 for the **principal**.

### 3.5 Maturity & payout
- A position becomes **MATURED** once `now >= maturityAt` (marked lazily on read, and/or by a
  small daily settlement job for reliability).
- **Interest payout (Phase 2):** the earned interest must be credited into the user's Nia
  wallet. This needs a Nia capability (broker-credit or treasury transfer) — see §7. Until
  then, accrued/earned interest is shown to the user and tracked in our ledger, settled to
  PAID when the payout mechanism is live.

### 3.6 Admin screens (`/admin/staking`)
- **Products table:** coin, name, term, daily rate, APR (= dailyRate×365), status, total
  staked / capacity, # active positions.
- **Create / edit product:** coin (from managed coin list), name, term days, daily rate %,
  optional min/max/capacity. **Open / Close** toggle (close = stop new stakes; existing run on).
- **Positions view:** all user positions per product (user, principal, accrued, maturity,
  status) for oversight.
- Every change **audit-logged** (reuse existing `recordAudit`), in plain language.

### 3.7 User screens (replace the current "coming soon" Staking page)
- **Available products:** cards per open product — coin logo, term, **APR**, daily rate, min/max.
- **Stake flow:** pick product → enter amount (≤ available balance) → confirm → position created.
- **My Stakes:** active positions with **live accrued interest**, a **maturity countdown**,
  principal, and projected total; plus matured/paid history.
- All amounts real (from Nia balance + our positions). No mock.

### 3.8 API (all auth-guarded; userId from session)
- `GET  /api/staking/products` — open products (user)
- `POST /api/staking/stake` — `{ productId, amount }` → creates a position (validates balance, min/max, capacity, product OPEN)
- `GET  /api/staking/positions` — my positions + computed accrued/maturity
- Admin: `GET/POST /api/admin/staking/products`, `PATCH .../[id]` (open/close/edit),
  `GET /api/admin/staking/positions`

---

## 4. Coin management

### 4.1 Data model
```prisma
enum CoinSource { NIA CUSTOM }

model ManagedCoin {
  id              String   @id @default(cuid())
  symbol          String   @unique           // e.g. "USDT"
  name            String                       // e.g. "Tether"
  source          CoinSource @default(CUSTOM)  // NIA = mirrors a hub coin; CUSTOM = admin-added token
  networks        Json                         // [{ code, contractAddress?, decimals, depositEnabled, withdrawEnabled }]
  logoKey         String?                       // /public/coins/<key>.svg, else colored-initial fallback
  visible         Boolean  @default(true)       // show in the user coin list
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}
```

### 4.2 How the user coin list is built
`userCoinList = merge(Nia /markets currencies, ManagedCoin overrides)`:
- Nia coins appear by default; admin can **hide** them (`visible=false`).
- Admin **custom EVM tokens** appear too (with contract address + decimals + logo).
- **Deposit/withdraw availability** is driven by what Nia actually supports — a custom token
  shows **"deposit/withdraw not yet available"** until Nia supports it (no fake flows).

### 4.3 Admin screen (`/admin/coins`)
- Coin table: logo, symbol, name, source (Nia/Custom), networks, visible toggle, deposit/withdraw status.
- **Add coin:** symbol, name, network(s) + contract address + decimals, optional logo upload/URL.
- **Remove** (custom only) / **hide** (any). Audit-logged.

### 4.4 User side
- The Deposit/Withdraw coin dropdowns and balances read the **merged** list, so an admin add
  instantly shows up for users (requirement #2). Reuses the logo system we already built
  (`/public/coins` + colored-initial fallback).

---

## 5. Cross-cutting
- **i18n:** all new copy in 6 locales (en/ko/ja/zh/vi/th).
- **Audit logging:** every admin staking/coin change recorded in plain language.
- **Decimal.js** for every amount; **migrations only** (no `db push`); secrets stay server-side.
- **Settings:** optionally add a global "Staking enabled" master switch to PlatformSetting.

## 6. Phasing
- **Phase 1 (build now — 100% ours):** all data models + migrations; admin staking products
  (open/close/term/per-product rate/multi-coin); user staking page (stake, positions, live
  accrual, countdown); principal soft-lock + withdrawal enforcement; admin coin management +
  user list integration; maturity detection; audit + i18n.
- **Phase 2 (after Nia confirmation):** real **interest payout** into the Nia wallet at
  maturity; real deposit/withdraw for any custom tokens Nia adds.

## 7. Open questions for senior / Nia
1. **Interest payout:** does Nia expose a way for the broker to **credit a user's wallet**
   (or a treasury→user transfer)? This is what Phase 2 needs. If not, how should interest be
   funded/settled?
2. **Principal:** is soft-locking in our DB acceptable, or must the principal be **moved** to a
   separate staking/treasury account on Nia? (Affects whether we need a Nia transfer on stake.)
3. **Custom tokens:** for admin-added EVM tokens, will Nia support deposits/withdrawals for
   them, or are they display-only for now?
4. **Rounding/precision** for interest, and **min stake** defaults.
5. **Auto-renew** at maturity — wanted, or always return to wallet?

## 8. Out of scope (for now)
- Early unstake / penalties (locked-until-maturity only).
- Compounding interest, tiered rates, referral bonuses.
- Real on-chain staking/validators.
