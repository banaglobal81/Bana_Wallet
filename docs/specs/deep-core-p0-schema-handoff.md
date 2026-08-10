# DEEP CORE Phase 0 — schema handoff to `prisma-db-expert`

> Written by `game-developer` · scope: `docs/specs/deep-core-00..06` (Phase 0 only — no
> `GameBonusPayout`, no `gameBonus*` `PlatformSetting` fields; those stay gated behind
> `deep-core-00-overview-and-gate.md` §6.2 G-1/G-2/G-3).
>
> Per this task's instruction and CLAUDE.md rule 7, `game-developer` does not edit
> `web/prisma/schema.prisma` or run any `prisma migrate` / `prisma db push` command. This
> document is the spec; `prisma-db-expert` owns turning it into an actual migration.

## What already works with zero schema change (shipped in this pass)

Level, XP, chapter, unlock table, operating-days odometer, well rendering, and the whole
HUD/canvas/control-bar surface are **fully derived, read-only, computed on every request**
from the existing `StakePosition` / `StakingPayout` tables (`web/src/lib/deepCoreProgressMath.ts`
+ `deepCoreProgress.ts`). No new table was needed for any of that — see the module header
comments for the exact reasoning (P-1/P-5 compliance: XP only ever comes from rows the
settlement worker actually wrote).

The M-1 defect (`docs/specs/deep-core-00-overview-and-gate.md` §6.3 — unbounded `charter_open`
farming) is also fixed with **no schema change**: it's a smarter read (day-key capping +
concurrent-active-position capping + `minAmount != null` filtering), not a new write path.
Unit-tested in `deepCoreProgressMath.test.ts` (AC-P11 / AC-D11 analogues).

## What is blocked on schema (not shipped in this pass)

Two things in the approved Phase 0 scope (`deep-core-00` §6.5 Q4 — SV/cosmetics path) are
**irreducibly** stateful and can't be derived from existing tables:

1. **Spending SV on a cosmetic** (`deep-core-03-credits-and-depot-frd.md` §5/§6, Outfitting
   tab). "SV earned to date" is derived and works today
   (`DeepCoreState.svEarned`); "SV *balance after spending*" and "which cosmetics does this
   user own" cannot be derived from anything — a purchase is a genuine new fact with no
   trace anywhere else.
2. **`xp.presence`** (`deep-core-02-progression-frd.md` §2 — up to 5 XP/day for opening the
   app with an active position, idempotent once/day). This needs a per-day idempotency
   marker; there is no existing row that "opening the app" naturally produces.

Current behavior: the Outfitting tab (`DepotSheet.tsx`) is browse-only — it shows the real
derived SV balance, the catalog, and the price-tier legend, but the purchase action is not
wired to a persisting backend (`game.depot.purchaseUnavailable` copy, factual/neutral tone,
no FOMO language). `xp.presence` is simply not awarded yet — this costs the user at most
~33% of one day's XP (02 §2's own cap on `xp.presence`'s share) and blocks nothing else
(no level, chapter, or unlock depends on it).

## Proposed migration (additive only, matches `deep-core-02-progression-frd.md` §6 /
`deep-core-03-credits-and-depot-frd.md` §6, trimmed to the Phase 0 subset)

```prisma
// Minimal per-user game row. Only fields Phase 0 actually needs are here —
// xpTotal/level/chapter/operatingDays are NOT duplicated here (they stay
// derived-on-read; do not add them as columns, that would create a second
// source of truth that can drift from the StakingPayout ledger).
model GameProfile {
  userId          String   @id // BANA user id (session-derived, no client-supplied id — rule 8)
  // xp.presence idempotency key (dayKey = floor(now / stakingDayMs())), 1 award/day.
  lastPresenceKey String?
  // Equipped cosmetic per slot, e.g. {"crew_helmet": "dc_cosmetic_helmet_02", ...}.
  // Ownership itself is NOT tracked here — it's derived from GameLedgerEntry
  // rows below (a slot is "owned" if a purchase row exists for that item id).
  cosmetics       Json     @default("{}")
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}

// Append-only SV ledger. Phase 0 only ever writes `currency = "SV"` rows with
// `reason = "depot_purchase"` (negative delta). CC rows (`reason` starting
// with `cc.`) stay P1-gated — do not use this table for CC until the P1 gate
// (deep-core-00 §6.2) clears.
model GameLedgerEntry {
  id            String   @id @default(cuid())
  userId        String
  currency      String   // "SV" only in Phase 0
  delta         Int      // negative for a purchase
  reason        String   // "depot_purchase"
  refId         String   // the cosmetic item id being purchased
  balanceAfter  Int      // derived SV-earned-to-date (at write time) + sum(prior deltas) — snapshot for audit, not a second source of truth for reads
  dayKey        String
  createdAt     DateTime @default(now())

  @@unique([userId, currency, reason, refId]) // idempotency — the same item can't be bought twice
  @@index([userId, createdAt])
}
```

### Notes for the migration author

- `GameXpEntry` (the full append-only XP audit log from `deep-core-02-progression-frd.md`
  §6) is **deliberately not included above** — Phase 0's `xp.lift` / `xp.charter_open` /
  `xp.charter_complete` are all derived from `StakingPayout`/`StakePosition` directly and
  don't need a parallel audit log to function. Add it only if a future requirement needs a
  literal per-event XP history (the Ledger sheet currently shows source *totals*, not a row
  log, which the FRD's own C-8 requirement — "balance and full history visible" — reads as
  satisfied for a non-spendable resource; SV *is* spendable, which is why it gets a real
  ledger table and XP does not).
- The purchase route (`GameLedgerEntry` write) must live behind `requireUser()`, take only
  `{ cosmeticId }` from the client (server looks up the price from a server-side catalog —
  03 §6.1 rule 1), and run price/level-gate/ownership checks inside one transaction — same
  pattern as every other money-adjacent write in this codebase
  (`web/src/app/api/staking/stake/route.ts`). `game-developer` will wire that route once
  this migration lands; it is not part of this handoff.
- `GameGear`, `GameBonusPayout`, and the `gameBonus*` `PlatformSetting` fields remain fully
  out of scope — P1 gate, not to be migrated per `deep-core-00` §6.5 Q4's explicit
  instruction to `prisma-db-expert`.
