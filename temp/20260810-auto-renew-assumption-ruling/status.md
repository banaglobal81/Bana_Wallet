# Status — Auto-renew ASSUMPTION adjudication

Date: 2026-08-10 · Owner: `pm`

## Progress

| # | Step | State |
|---|------|-------|
| 1 | Locate every `ASSUMPTION` marker in `stakingRenew.ts` / `stakingRenewMath.ts` | done — 5 found (A1-A5) |
| 2 | Gather secondary evidence (copy-spec, 3 migrations, schema comments, live PATCH route, auth.ts, admin product PATCH, grant route) | done |
| 3 | Adjudicate A1 — grant-exclusion check order ("E9") | done — APPROVED as implemented |
| 4 | Adjudicate A2 — `FAILED_TERMS_CHANGED` / E8 trigger | done — APPROVED, scope widened (coin) |
| 5 | Adjudicate A3 — `FAILED_ACCOUNT_INACTIVE` trigger | done — APPROVED, fail-closed fix required |
| 6 | Adjudicate A4 — `MAX_RENEWAL_ATTEMPTS = 3` + retry mechanics | done — APPROVED, observability gap found |
| 7 | Adjudicate A5 — `RENEWAL_DEFERRED` outcome literal | done — APPROVED, no change |
| 8 | Write `docs/specs/staking-auto-renew-assumption-ruling.md` | done |
| 9 | Hand §5 change list to `web-shared-expert` | **pending — parent agent to route** |
| 10 | `qa-lead` to extend `stakingRenewMath.test.ts` for the ruled behaviours | pending |

## Evidence relied on (none of it is the missing PRD/ruling)

- `docs/specs/staking-auto-renew-copy-spec.md` — §1.3, §2.2, §2.3, §3.1, §4, §4.2.2, §4.3, §6
- `web/prisma/migrations/20260809044114_staking_auto_renew/migration.sql` — Revision-1 enum
- `web/prisma/migrations/20260809045206_staking_auto_renew_status_values/migration.sql` —
  Revision-2 enum additions (`FAILED_TERM_TOO_LONG`, `FAILED_GRANTED_POSITION`)
- `web/prisma/migrations/20260809044500_staking_auto_renew_r7_backfill_decision/migration.sql`
- `web/prisma/schema.prisma` — `StakeRenewalStatus`, `User`, `StakePosition`, `StakingProduct`
- `web/src/app/api/staking/positions/[id]/auto-renew/route.ts` — live PATCH check order
- `web/src/app/api/admin/staking/products/[id]/route.ts` — the admin-editable field set
- `web/src/app/api/admin/staking/positions/route.ts` — the grant route
- `web/src/auth.ts` — the three login paths' `disabled` checks
- `web/src/lib/stakingSettle.ts` — settlement counters and the Pass-3 notify sweep

## Open / carried

- The two parent docs remain absent. If either resurfaces and contradicts this ruling, the PRD
  wins on A1 (ordering) and this ruling is superseded; A2-C1, A3-C1 and A4-C1 are additive
  hardening and stand regardless.
- §6 follow-ups: copy-spec cross-reference (`product-planner`), schema comment clarification
  (`prisma-db-expert`), test coverage (`qa-lead`).
