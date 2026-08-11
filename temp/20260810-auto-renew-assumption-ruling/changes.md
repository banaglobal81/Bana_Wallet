# Changes — Auto-renew ASSUMPTION adjudication

Date: 2026-08-10 · Owner: `pm`

## Why

`web/src/lib/stakingRenew.ts` and `web/src/lib/stakingRenewMath.ts` were written by
`web-shared-expert` while the two parent documents they cite —
`docs/specs/staking-auto-renew-prd.md` (Revision 2) and
`docs/specs/staking-auto-renew-ruling.md` — were **absent from the repository** and still are.
The engineer correctly refused to silently guess: five business rules were reconstructed from
secondary evidence and each was marked `ASSUMPTION` in-code with an explicit instruction to
"flag these to `pm`/`product-planner` once the parent docs are available."

The parent docs have not reappeared. Leaving five unadjudicated business rules inside the only
function permitted to flip a `StakePosition` to `MATURED` is not acceptable — that function
decides whether a user's principal is released or locked for another full term. This change
closes them out on the available evidence and makes the resulting rules authoritative in their
own right, so the code stops depending on documents that may never exist.

## What is changing

Documentation only. `pm` writes no code.

1. **New doc** — `docs/specs/staking-auto-renew-assumption-ruling.md`. Authority-level ruling
   (the role the missing `staking-auto-renew-ruling.md` occupied) that adjudicates all five
   `ASSUMPTION` markers as APPROVED / APPROVED-WITH-CHANGE, states the reasoning and the
   evidence each verdict rests on, and lists the resulting handoff items for
   `web-shared-expert`.

2. **No code edits.** Three code changes fall out of the ruling (A2-C1, A3-C1, A4-C1) and are
   handed to `web-shared-expert` as a scoped list in §5 of the new doc. One is P1
   (operational visibility of a state that strands user principal), two are P2 defensive
   hardening of currently-unreachable paths.

## Scope boundary

- `pm` decides the **Why** only. Every item in §5 states the required behaviour, never the
  implementation shape — `web-shared-expert` owns the How.
- No change to `docs/specs/staking-auto-renew-copy-spec.md` (owned by `product-planner`). A
  suggested one-line cross-reference is raised as a follow-up in §6, not applied here.
- No change to `web/prisma/schema.prisma`. The "E9" comment on `FAILED_GRANTED_POSITION` is
  reinterpreted, not rewritten; §6 raises the comment clarification for `prisma-db-expert`.
