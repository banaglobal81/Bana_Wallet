# Staking Interest Payout Rail — Investigation & Fix Specification

> Investigation only. No implementation code was changed while producing this
> document. Author: `web-shared-expert`, requested by `pm` as gate **G-1** for
> the staking gamification project's real-reward integration phase (P1).
> Scope note: this document is unrelated to, and does not touch, any file
> under the game-surface Phase 0 work (`game-designer` / `game-developer`).

## 1. Finding: CONFIRMED

**Staking interest accrued in `StakingPayout` / `StakePosition.paidInterest`
is never transferred into the user's actual Nia-Hub wallet balance. It exists
only as a row in BANA's own Postgres database. There is no code path anywhere
in this repository — settlement worker, cron route, staking lib, withdrawal
route, or any admin tool — that calls a Nia-Hub API to credit interest to a
user's spendable balance.**

The `/staking` screen's "Rewards Earned … Paid to date" label is materially
misleading: nothing has been paid out in the sense a user would understand
(i.e., "this is now in my wallet and I can withdraw it"). It is accrued and
recorded, not paid.

pm's original findings are all independently reverified as accurate (see
per-fact citations below). One additional confirming fact was found: the
`StakePositionStatus.PAID` enum value (`web/prisma/schema.prisma:39`) is
never assigned anywhere in the codebase (`grep` for `status: 'PAID'` /
`"PAID"` across `web/src` returns zero matches) — a state machine with a
terminal "settled" status that is defined but structurally unreachable is
itself evidence the payout rail was designed for but never finished, rather
than deliberately out of scope.

## 2. Verified facts (re-read directly, with citations)

1. **Settlement only writes to Postgres.** `runStakingSettlement()`
   (`web/src/lib/stakingSettle.ts:45-190`) computes newly-due days, inserts
   `StakingPayout` rows (`stakingSettle.ts:72`), and updates
   `StakePosition.paidInterest` / `accruedInterest` / `daysPaid`
   (`stakingSettle.ts:79-87`, and the self-healing branch at
   `stakingSettle.ts:129-132`). No `niaWalletRequest` / `niaRequest` call
   appears anywhere in this file.

2. **The withdrawal-available formula ignores `paidInterest` entirely.**
   `web/src/app/api/nia/withdrawals/route.ts:207-231`: `locked` is computed
   from `lockedPrincipalByCoin()` (principal of ACTIVE positions only —
   `web/src/lib/staking.ts:69-79`), and `available = niaBal.minus(locked)`
   (`withdrawals/route.ts:231`). `niaBal` is the user's real Nia-Hub wallet
   balance fetched via `niaWalletRequest('GET', '/api/v1/wallets', …)`
   (`withdrawals/route.ts:215`). `paidInterest` is never added to `niaBal`
   or otherwise factored into `available`. Even if a user requested exactly
   their accrued-interest amount, the request would either be rejected here
   (amount > available) or, if it slipped through some other coin's headroom,
   `forwardWithdrawalToHub()` (`web/src/lib/withdrawals.ts:31-70`) simply
   forwards `wr.amount` to Nia-Hub's real `/api/v1/withdrawals` — which can
   only pay out of the real on-hub balance. There is no code path by which
   `paidInterest` becomes withdrawable.

3. **Principal is a soft lock only**, confirmed at
   `web/prisma/schema.prisma:251-253` (comment) and structurally: staking
   (`web/src/app/api/staking/stake/route.ts`) never calls
   `niaWalletRequest` with a mutating verb — only a `GET /api/v1/wallets`
   balance check (`stake/route.ts:85`) — and maturity
   (`web/src/lib/stakingRenew.ts`, not read in full here beyond confirming no
   wallet-mutating call sites exist in `grep` results) never moves funds
   either. This part matches pm's description and isn't itself a new
   discovery.

4. **`ReferralBonusPayout` has the identical structure and is currently
   gated off.** `web/src/lib/referralBonus.ts:12-15`:
   `REFERRAL_BONUS_ENABLED` must be `"true"` or the whole pass is a no-op;
   `runStakingSettlement` calls it unconditionally
   (`stakingSettle.ts:184`) but the gate makes it inert by default. Being OFF
   materially lowers its urgency relative to the base staking-interest issue,
   which is already live and accruing for every active position today.

5. **`/staking` screen displays this as if paid.**
   `web/src/components/Staking.tsx:374-388`: section header "Rewards
   Earned", each row rendered as `+{amount} {coin}` with the caption "Paid to
   date" (`Staking.tsx:384`), sourced from `GET /api/staking/rewards`
   (`web/src/app/api/staking/rewards/route.ts:76-83`), which sums
   `StakePosition.paidInterest` per coin — the same never-actually-paid
   figure.

6. **Admin surfaces use the same misleading terminology.**
   `web/src/app/api/admin/staking/stats/route.ts:8-10,24`: the SQL alias is
   literally `"totalPaid"` and the route comment calls it "interest actually
   paid to date," but it is `SUM(paidInterest)` from the same DB-only column
   — i.e. even the internal comment is inaccurate about what "paid" means
   here. `web/src/app/[locale]/admin/staking/page.tsx:486-487` renders both
   `accruedInterest` and `paidInterest` per position with no visual
   distinction flagging that neither has left BANA's database.

7. **`worker/` is not a second/independent settlement path.**
   `docs/architecture/worker.md` and `web/src/app/api/cron/staking/route.ts`
   confirm the Railway always-on worker only polls and triggers
   `POST /api/cron/staking`, which calls the exact same
   `runStakingSettlement()` reviewed in fact 1. There is no separate batch
   job, cron, or admin action anywhere in the repo that reconciles
   `paidInterest` against the Nia-Hub wallet. `grep -rln
   "niaWalletRequest|niaRequest"` across `web/src/lib` and `web/src/app/api`
   turns up 14 files total; none outside `nia/client.ts` itself relate to
   staking interest settlement. The two "settlement" admin routes that do
   exist (`web/src/app/api/admin/settlement/{unsettled,history}/route.ts`)
   proxy Nia-Hub's own **trading/order settlement** endpoints
   (`/api/v1/settlement/unsettled`, `/api/v1/settlement/history`) — an
   unrelated Nia-Hub domain (spot trade clearing), not staking interest.

8. **No Nia-Hub API in this integration supports crediting a balance out of
   nothing.** The full route-handler surface this app is wired to
   (`docs/architecture/nia-integration.md` §"Route handlers", 13 total:
   `address, balance, deposits, withdrawals, transfer, orders, trades,
   markets, klines, wallet-history, notifications, status, webhook`) has no
   "admin credit" / "internal deposit" endpoint. `POST /api/v1/wallets/transfer`
   (`web/src/app/api/nia/transfer/route.ts`) only moves funds between a
   *single user's own* wallet types (`fromType`/`toType`, e.g. spot↔funding)
   — it cannot move value from a BANA operator/treasury account into a
   user's balance. **This is a real open question, not just a missing code
   path**: it is not established from this repo alone whether Nia-Hub
   exposes any operator-initiated credit capability at all. See §6.

## 3. Is this intended design, or a missing feature?

**Assessment: missing feature, not an intentionally deferred separate
process.** Reasoning:

- No code, comment, spec, or doc anywhere in the repo (`docs/specs/`,
  `docs/architecture/`, inline comments) references a planned/future
  "interest settlement batch," "treasury payout job," or similar. The
  `stakingSettle.ts` comments describe `StakingPayout` as "the real,
  auditable rewards ledger" (`schema.prisma:332-334`) and "Real daily
  payout" (`schema.prisma:270-271`) — language that asserts the ledger *is*
  the payout, not a staging area awaiting a later payout step.
- The withdrawal-availability formula (`withdrawals/route.ts:231`) shows no
  awareness that `paidInterest` should ever become spendable — if this were
  intentionally deferred, you would expect at least a TODO, a feature flag,
  or a reconciliation stub. There is none.
- The dead `PAID` status (fact in §1) is the strongest signal: a
  `StakePositionStatus` enum with `ACTIVE → MATURED → PAID` reads exactly
  like a design where `PAID` is meant to be set once principal+interest is
  actually settled back out — but nothing in the codebase ever makes that
  transition. This looks like a state machine that was scaffolded for a
  payout step that was never wired up, then the UI/ledger layer was built
  and shipped on top of the *accrual* half only.
- `worker/` (the one place a "batch process" would live) is verified to only
  run the same in-DB accrual logic — it is not a second, unimplemented
  payout stage; it's additional confirmation there is no other component in
  this repo that could be doing the payout.

**Conclusion: this is a genuine gap, not a deferred-by-design batch process
living elsewhere.** It should be treated as a P0 correctness/trust issue
independent of the staking gamification project, and is correctly gating
that project's P1 (real-reward integration) per pm's G-1.

## 4. Impact

- Every currently-ACTIVE and MATURED staking position has accrued interest
  that is an unfunded liability recorded only in BANA's Postgres DB — not
  reflected in any real balance a user can withdraw.
- The `/staking` UI actively tells users this interest is "Paid to date,"
  which is false in the sense a reasonable user would read it (available to
  withdraw). This is a user-trust / potential-dispute risk, independent of
  whatever fix timeline is chosen.
- `ReferralBonusPayout` has the same defect but is env-gated off in
  production today — lower urgency, same required fix shape, should be
  fixed in the same body of work rather than separately.

## 5. Fix specification (NOT to be implemented by this investigation)

This section is a specification for human review and for
`prisma-db-expert` / `wallet-security-expert` / the eventual implementing
agent(s) to evaluate — no code changes were made.

### 5.1 Prerequisite open question (blocks design choice — see §6.1)

Whether Nia-Hub exposes **any** operator-initiated "credit user balance"
capability is unknown from this repo. The fix shape depends entirely on the
answer:

- **If Nia-Hub has an admin/treasury credit API:** the fix is "call it," and
  most of the complexity is in idempotency/reconciliation (§5.3–§5.6).
- **If it does not:** BANA would need an actual operator wallet holding real
  crypto, and "paying interest" becomes a real on-chain/exchange transfer
  from that operator account to the user's deposit address (functionally
  identical to a withdrawal, but operator-funded) — a much heavier, higher-risk
  change (custody of a funding wallet, gas/fees, exchange liquidity
  management) that is out of scope for a simple code fix and needs product
  + finance + Nia-Hub coordination before any spec can be finalized.

**This document cannot resolve this question from the codebase alone — it
must be confirmed against Nia-Hub's actual API contract/docs before
implementation starts.**

### 5.2 Two payout-timing strategies (independent of §5.1's answer)

**Option A — Settle-on-accrual (push).** Each daily settlement run, after
crediting `StakingPayout`, immediately transfers that day's interest into
the user's real Nia-Hub balance (via whatever mechanism §5.1 resolves to).

- Pro: `paidInterest` becomes trustworthy immediately — "Paid to date" stays
  true the same day it's shown.
- Con: N users × 1 external call per settlement cycle — higher latency/
  failure surface inside the settlement job, and partial-failure handling
  (some users' transfers fail) becomes a first-class case the batch job must
  track and retry, on top of the existing accrual idempotency it already has.

**Option B — Settle-on-withdrawal-request (pull/just-in-time).** Interest
stays accrual-only (as today) until the user actually requests a
withdrawal. At that point, before/alongside forwarding to the hub, the
withdrawal path settles (transfers) exactly the interest amount needed to
cover the requested withdrawal (or the user's full unpaid interest,
simpler), then proceeds.

- Pro: no change to the (already well-tested, idempotent) daily settlement
  job; external-call volume scales with actual withdrawal activity, not with
  every active position every cycle.
- Con: `withdrawals/route.ts` becomes more complex (needs its own
  transfer-then-forward two-step, with its own partial-failure handling if
  the transfer succeeds but the withdrawal forward fails, or vice versa);
  "Paid to date" in the UI is still misleading until the user withdraws,
  unless the label itself is also fixed to distinguish "accrued" from
  "available."

**Recommendation:** Option B is very likely the lower-risk starting point:
it isolates the new external-call risk to a single, already-manually-approved
choke point (withdrawals already go through admin approval /
auto-approve-threshold logic), rather than adding a new external call inside
a batch job that currently has zero external I/O and runs unattended and
frequently (every `stakingWorkerIntervalMinutes`, default 5 minutes). This
is a recommendation for the eventual implementer/product owner to weigh, not
a decision made here.

### 5.3 Withdrawal available-balance formula change (Option B path)

Current (`withdrawals/route.ts:207-231`):
```
locked   = lockedPrincipalByCoin(userId)[coin]         // ACTIVE principal only
niaBal   = GET /api/v1/wallets                          // real hub balance
available = niaBal - locked
```

Proposed:
```
locked        = lockedPrincipalByCoin(userId)[coin]
unpaidInterest = SUM(StakePosition.paidInterest) - SUM(already-settled-to-hub amount), per coin
niaBal        = GET /api/v1/wallets
available     = niaBal - locked + settleable(unpaidInterest, requested amount)
```

This requires a new field distinguishing "interest credited to the ledger"
(today's `paidInterest`) from "interest actually transferred to the hub"
(new). **Do not overload `paidInterest`'s existing meaning** — it is read in
several places today (admin stats, rewards API, `Staking.tsx`) as "ledger
total," and silently changing its semantics to "hub-settled total" would
retroactively falsify all existing rows without a data migration. A new
column (e.g. `StakePosition.settledInterest`, defaulting to `"0"`) is
strongly preferable to redefining `paidInterest` in place.

### 5.4 Schema changes (proposal, for `prisma-db-expert` review)

- `StakePosition.settledInterest: String @default("0")` — running total of
  interest actually transferred to the user's real Nia-Hub balance
  (canonical decimal string, matches `paidInterest`'s convention).
- Optional: a `StakingInterestSettlement` audit table (one row per transfer
  attempt: `positionId`, `userId`, `coin`, `amount`, `hubRef`, `status`
  (`PENDING`/`SUCCEEDED`/`FAILED`), `createdAt`) — mirrors the existing
  `WithdrawalRequest` pattern (claim via atomic status flip, `FAILED` is
  terminal/manual-review, never silently retried). Strongly recommended
  given this touches real money and needs the same auditability precedent
  already established for withdrawals (`web/prisma/schema.prisma:120-142`).
- `ReferralBonusPayout` needs the equivalent `settledAmount` field or its
  own settlement-audit rows, once re-enabled — same defect, same fix shape,
  should ship together rather than fixing staking and leaving referral bonus
  with the identical bug for whenever it's turned on.
- All new/changed migrations must go through `prisma migrate dev` /
  `prisma migrate deploy` per CLAUDE.md rule 7 — never `prisma db push`.

### 5.5 Idempotency, concurrency, and decimal precision requirements

- Every transfer-to-hub call must carry a stable idempotency key (mirrors
  `forwardWithdrawalToHub`'s existing `idempotencyKey ?? wr.id` pattern,
  `web/src/lib/withdrawals.ts:42`) so a retried settlement attempt can never
  double-credit.
- The claim-before-transfer pattern used for withdrawals (atomic
  `updateMany({ where: { status: 'X' }, data: { status: 'Y' } })`, only
  proceed if `count === 1`) must be reused for whichever new
  PENDING→PROCESSING→SUCCEEDED/FAILED state this introduces — this is the
  established, already-reviewed concurrency-safety pattern in this codebase
  and should not be reinvented.
- On any ambiguous outcome (network error / timeout on the transfer call),
  the row must go to a terminal `FAILED`-for-manual-review state, exactly
  like `forwardWithdrawalToHub`'s existing error handling
  (`withdrawals.ts:60-69`) — never silently retried, to avoid a double-spend
  if the hub actually executed before the response was lost.
- All arithmetic must use `decimal.js` (`new Decimal(...)`, `.toFixed()`)
  per CLAUDE.md rule 2 — this codebase is already fully compliant on the
  staking money paths reviewed here (`stakingSettle.ts`, `staking.ts`,
  `withdrawals/route.ts` all already use `Decimal` correctly); the new code
  must maintain that, no `Number()`/`parseFloat()` on any amount.

### 5.6 Reconciliation & audit requirements

- Admin staking stats (`/api/admin/staking/stats`) should be extended to
  show `activePrincipal`, `accrued-not-yet-settled interest`, and
  `settled-to-hub interest` as three distinct numbers — today's single
  `"totalPaid"` conflates two different things (§2 fact 6) and should not
  continue to after the fix, regardless of which timing option (§5.2) is
  chosen.
- A reconciliation report (accrued ledger total vs. hub-settled total, per
  coin, platform-wide) should exist somewhere admin-visible so an operator
  can see the outstanding unfunded-liability number at a glance during
  rollout — this is the number that currently has no visibility anywhere in
  the admin UI.

### 5.7 Backfill / rollout for existing accrued interest

Every currently-ACTIVE and MATURED position already has a nonzero
`paidInterest` that predates this fix. The rollout plan needs an explicit
decision (for humans, not this document) on:
- Whether pre-existing accrued interest is settled retroactively in one
  bulk operation once the rail exists, or drains gradually as each user's
  next settlement cycle / withdrawal request naturally triggers it under
  the new logic.
- Whether a bulk retroactive settlement (potentially touching every active
  user's balance in one operation) needs a maintenance-mode window
  (`PlatformSetting.maintenanceMode`, already exists at
  `web/prisma/schema.prisma:75`) to avoid racing with concurrent
  withdrawals/new stakes during the backfill.

### 5.8 UI/copy correction (separate, low-risk, can ship independently)

Regardless of timeline for the real fix, `web-wallet-expert` (owns
`Staking.tsx`) and `product-planner` (owns copy/tone) should consider
retitling "Rewards Earned … Paid to date" to something accurate today
(e.g. "Accrued — not yet withdrawable" / "Ledger balance") until the real
settlement rail exists, to stop actively asserting something false to
users in the interim. This is explicitly **not** this document's or
`web-shared-expert`'s scope to implement (UI copy = other agents), but is
flagged here since it was discovered as part of this investigation and is a
same-day-shippable trust fix independent of the larger payout-rail work.

## 6. Open questions requiring a human decision before implementation

1. **(Blocking, §5.1)** Does Nia-Hub expose any operator/treasury-initiated
   balance-credit API? This cannot be answered from this repository and
   must be checked against Nia-Hub's actual API documentation/contract.
2. Which payout-timing strategy (§5.2 Option A push vs. Option B pull) does
   product/finance prefer, given the risk/complexity tradeoffs described?
3. Retroactive backfill (§5.7): bulk-settle existing accrued interest now,
   or let it drain under the new logic naturally?
4. `ReferralBonusPayout` — fix in the same body of work, or track as a
   separate follow-up ticket (given it's currently inert/OFF)?
5. Who owns implementation once a design is chosen? This spans
   `web-shared-expert` (Nia-Hub client/withdrawal route),
   `prisma-db-expert` (schema/migration), and `wallet-security-expert`
   (mandatory review per CLAUDE.md — withdrawal-route changes always require
   a security diff review before commit).

## 7. Non-goals of this document

No code was modified. No schema migration was created. No implementation
work was started. This document is investigation + specification only, for
human review and for `deploy-manager` / `prisma-db-expert` to decide if/when
to greenlight actual implementation.
