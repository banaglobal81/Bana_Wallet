# Ruling — Auto-Renew: adjudicating the five reconstructed business rules

> Status: **AUTHORITATIVE RULING.** Owner: `pm`. Date: 2026-08-10.
> **Subject:** every `ASSUMPTION` marker in `web/src/lib/stakingRenew.ts` and
> `web/src/lib/stakingRenewMath.ts`.
> **Companion:** `docs/specs/staking-auto-renew-copy-spec.md` (`product-planner`, BUILD-READY,
> 2026-08-09) — unchanged and unsuperseded by this document.
> **Standing in for:** `docs/specs/staking-auto-renew-ruling.md`, which the copy-spec names as its
> authority and which **does not exist in this repository**. Neither does
> `docs/specs/staking-auto-renew-prd.md` (Revision 2). This ruling is written on secondary evidence
> and is authoritative until one of them reappears; see §7 for what happens if it does.

---

## 0. Why this document exists

`matureOrRenewPosition` is the only function permitted to flip a `StakePosition` to `MATURED`. It
decides, at the moment a term ends, whether a user's principal is released to them or locked for
another full term. Five of the business rules governing that decision were reconstructed by
`web-shared-expert` from secondary sources and marked `ASSUMPTION` in-code, with an explicit
instruction to escalate.

Refusing to guess was the right call. But an unadjudicated assumption inside a capital-lock
decision does not become safer by sitting still, and the parent documents have not reappeared.
This ruling closes all five on the evidence that does exist, so the code stops depending on
documents that may never arrive.

**Evidence base.** Nothing below rests on a recollection of the missing PRD. Every verdict cites
the copy-spec, the three applied migrations, the schema comments, or live code:

| Source | What it settles |
|---|---|
| `docs/specs/staking-auto-renew-copy-spec.md` | E3-E7 identities; AC-29; PATCH and S2 precedence + their stated rationales; the email reason map |
| `migrations/20260809044114_staking_auto_renew` | the **Revision-1** `StakeRenewalStatus` enum |
| `migrations/20260809045206_staking_auto_renew_status_values` | `FAILED_TERM_TOO_LONG` + `FAILED_GRANTED_POSITION` are **Revision-2 additions** |
| `web/prisma/schema.prisma` | the "E2a" / "E9" labels; `renewalAttempts >= 3`; the `User` field set |
| `api/staking/positions/[id]/auto-renew/route.ts` | the live opt-in check order |
| `api/admin/staking/products/[id]/route.ts` | exactly which product fields an admin can change |
| `api/admin/staking/positions/route.ts` | the grant route never sets `autoRenew` |
| `web/src/auth.ts` | what actually blocks a login |

---

## 1. A1 — Grant-exclusion check order ("E9")

**The assumption** (`stakingRenewMath.ts`, ordered-check doc comment, item 2): the grant check runs
**second**, immediately after the account-disabled check and ahead of E2a, even though
`schema.prisma:442` labels it **E9** — a number that, read as a sequence position, would put it
**last**.

### VERDICT: APPROVED as implemented. No logic change.

The grant check stays at position 2, ahead of the term cap and ahead of every product-economics
check. Four reasons, in order of weight.

**1. The E-numbers are labels, not an execution sequence.** The decisive evidence is AC-29, which
exists solely to assert that *"E2a ordering (fires before E3/E4)"*. If the numbering itself encoded
order, that acceptance criterion would be a tautology and nobody would have written it. It was
written because the numbers are identifiers in the PRD §3 status table and the order had to be
pinned separately.

The migration history confirms the mechanism. The Revision-1 enum
(`20260809044114`) contained ten values; `FAILED_TERM_TOO_LONG` and `FAILED_GRANTED_POSITION` were
both added later, in `20260809045206`, as Revision-2 work. **"E2a" is an insertion label and "E9"
is an append label** — two different ways of adding a row to an already-published numbered table
without renumbering it. Neither is a claim about runtime. Had E9 been intended as "run last", the
author would not have needed a lettered suffix for the other new check.

**2. Two live, already-spec'd surfaces put grant first, and the stated rationale is general.**
The copy-spec is BUILD-READY and internally consistent on this:

- §2.2, the `PATCH .../auto-renew` table: check **6 = grant**, check **7 = cap**.
- §1.3, the S2 position-row precedence table: row **2 = granted**, row **3 = over cap**, rows 4-5 =
  product state.

§1.3's rationale is not surface-specific — it is a principle: *"the grant and cap conditions are
**permanent** properties of the position, the closed-product condition is **reversible**. Showing a
reversible cause when a permanent one also applies would tell the user to wait for something that
will not help."*

Apply that principle at maturity and it orders the checks for us. Grant is permanent. The cap is
permanent for a given position. Everything from E3 down — product status, rate, min, max, capacity —
is an admin edit away from being reversed (`api/admin/staking/products/[id]/route.ts` accepts
exactly `status`, `name`, `dailyRatePct`, `minAmount`, `maxAmount`, `capacity`). So: permanent
first, reversible after. That is the implemented order.

**3. The grant status is a broken-invariant guard, and guards belong at the top.** A granted
position cannot reach maturity with `autoRenew = true` through any supported path. The grant route
deliberately never reads `autoRenew` from the request body (R-6 — an admin may not opt a user into
a capital lock), so grants are created with `autoRenew = false`. The PATCH route 409s the on-ramp.
The successor created by a renewal does not inherit `grantedByAdminId`. Reaching
`FAILED_GRANTED_POSITION` therefore means an invariant has **already** broken — a direct DB write or
a bug. Schema calls it "defensive" for exactly this reason.

Evaluating product economics on a position that should never have entered the queue is backwards.
A guard that says "this row should not be here" runs before the rules that assume it is.

**4. Being wrong here is cheap, and inconsistency is not.** Ordering changes only the recorded
`renewalStatus` and the email reason sentence. Every branch ends the same way: plain maturity, no
successor, principal released. There is no path on which this ordering costs a user money. Against
that, a third layer that disagrees with the other two about the same rule is a permanent source of
confusion for everyone who reads this feature afterwards. Consistency wins.

### 1.1 One consequence, recorded so it is not "fixed" later

A granted position that *also* trips a specific reason (closed product, below minimum, and so on)
records `FAILED_GRANTED_POSITION`, whose outcome email reads **"We couldn't complete the
renewal."** — the same generic sentence as `FAILED_SYSTEM` (copy-spec §4.2.2).

**This is intended, not a copy bug.** It looks like one because copy-spec §2.3 argues at length
that the *PATCH 409* must name the grant specifically rather than share a generic string. The two
are not in tension, because they answer different situations:

- The PATCH 409 answers a **user action on a legitimate state**. The user tapped a toggle; they are
  owed a reason, and "this stake was granted by BANA" is true, complete, and closes the loop.
- The maturity-time status answers a **state that should not exist**. It is an anomaly, and the
  anomaly copy is correct even where a more specific product reason happens to coexist — because
  the honest answer is "something is wrong with this position", not "the product is full".

Every variant still ends by stating where the money is, which copy-spec §4.2.2 identifies as the
only thing the user actually needs.

### 1.2 The confirmed ordering, in full

This is now the specified order, not a reconstruction:

| # | Check | Status on failure | Tier |
|---|---|---|---|
| 1 | Account disabled | `FAILED_ACCOUNT_INACTIVE` (silent — no email) | guard |
| 2 | `grantedByAdminId != null` | `FAILED_GRANTED_POSITION` | guard |
| 3 | E2a — `termDays > AUTO_RENEW_MAX_TERM_DAYS` | `FAILED_TERM_TOO_LONG` | permanent policy |
| 4 | E3 — product not `OPEN` | `FAILED_PRODUCT_CLOSED` | reversible |
| 5 | E4 — product rate `<` position rate | `FAILED_RATE_LOWERED` | reversible |
| 6 | E5 — principal `<` product `minAmount` | `FAILED_BELOW_MIN` | reversible |
| 7 | E6 — principal `>` product `maxAmount` | `FAILED_ABOVE_MAX` | reversible |
| 8 | E7 — restaking exceeds `capacity` | `FAILED_CAPACITY` | reversible |
| 9 | E8 — snapshotted product terms changed (§2) | `FAILED_TERMS_CHANGED` | structural |

The E3-E7 identities are not assumptions: copy-spec §4.3 fixes **E4 = rate lowered** ("E4 refuses
any renewal at a rate lower than the one on the position"), and copy-spec §3.1 fixes
**E5/E6/E7 = min/max/capacity** ("the other four editable fields — `name`, `minAmount`,
`maxAmount`, `capacity` — ... have their own renewal consequences (E5/E6/E7)"). AC-29 places E2a
before E3 and E4. Only the two guards and E8 needed a ruling.

---

## 2. A2 — `FAILED_TERMS_CHANGED` (E8): `product.termDays !== position.termDays`

**The assumption** (`stakingRenewMath.ts`, item 9): E8 is unlabeled in every available document,
and the trigger was inferred to be a change in the product's term length.

### VERDICT: APPROVED as the core rule — with one required scope widening (A2-C1).

**The inference is sound by elimination.** Copy-spec §3.1 accounts for the entire admin-editable
field set: `dailyRatePct` → E4, `minAmount`/`maxAmount`/`capacity` → E5/E6/E7, `name` → no renewal
consequence at all; `status` is E3. Confirmed against the live PATCH route, which accepts those six
fields and nothing else. E8 therefore cannot be an editable field — there are none left. What
remains is the set of product attributes a position **snapshots at stake time**:
`schema.prisma:390-391` marks `dailyRatePct` and `termDays` as snapshots, and `coin` is copied the
same way. `dailyRatePct` is already E4. That leaves `termDays` and `coin`.

**E8 is load-bearing, not ornamental.** The successor is created with `termDays: position.termDays`
(the old term) but `dailyRatePct: product.dailyRatePct` (the current rate, per "at the rate offered
at that time"). Mixing an old term with a new rate is only coherent while the term still matches
the product. E8 is precisely what makes that mix safe. Without it, a term change would silently
mint a position whose term contradicts the product it belongs to — and nothing downstream would
ever notice, because settlement reads the position's own snapshot.

The generic email sentence — *"The terms of {productName} changed."* — is the right register for a
rare, structural, non-actionable cause. It stays.

**E8's position (last) is also approved.** It is a structural check with no user-actionable
content; the reversible economic reasons above it are the ones a user can act on or an admin can
undo, so they should win the copy when both apply. It is unreachable today in any case.

### A2-C1 (required, P2) — E8 must also compare `coin`

`StakePosition.coin` is a snapshot of `StakingProduct.coin`, carried unchanged onto the successor,
and — exactly like `termDays` — is **not** exposed by the admin product PATCH route. The two fields
are in an identical position: immutable through the product API, snapshotted onto the position,
copied forward on renewal. If E8 is worth keeping for `termDays` on defensive grounds, the same
argument applies unchanged to `coin`. Covering one and not the other is an inconsistency, not a
scope decision.

**Rule, as now specified:**

> `FAILED_TERMS_CHANGED` fires when any product attribute that (a) the position snapshotted at
> stake time and (b) the successor carries forward unchanged no longer matches the product's
> current value. As of this ruling that set is exactly **{`termDays`, `coin`}**. `dailyRatePct` is
> excluded — it is snapshotted but deliberately *not* carried forward (the successor takes the
> product's current rate), and its own mismatch case is E4.

Adding a field to a product that positions snapshot means revisiting this set in the same change.

---

## 3. A3 — `FAILED_ACCOUNT_INACTIVE`: `User.disabled === true`

**The assumption** (`stakingRenewMath.ts`, item 1): the trigger was inferred to be the `disabled`
flag.

### VERDICT: APPROVED as the trigger — with one required fix (A3-C1).

**It is the only candidate.** `User` (`schema.prisma:272-323`) has no soft-delete column, no status
enum, no lockout field, no suspension timestamp. `disabled` is the sole account-state flag.

**It is also the semantically correct one, not merely the available one.** The harm this check
prevents is specific: extending a capital lock for another full term on an account whose owner
cannot get in to cancel it. `disabled` is exactly "cannot get in" — `auth.ts` rejects it on all
three login paths (credentials `:82`, passkey `:163`, Google `:197`). This is the same asymmetry
that produced M-3 (the off-switch is never gated): if the user has no off-switch, we must not start
a new term on their behalf.

It also explains the otherwise-odd "no email at all" rule in copy-spec §4. An account disabled for
compromise or abuse is precisely the account we should not be mailing a statement of holdings to.
The silence is a security property, not a copy preference.

**Scope, stated so it is not widened by analogy.** The following are **not** triggers: a 2FA
lockout, an unverified pending email change, a non-null `previousEmailBlockedUntil`, a null
`locale`, or a stale `position.email`. None of them prevents the owner from signing in and turning
auto-renew off. Only `disabled` does.

### A3-C1 (required, P2) — a missing user row must fail closed

`stakingRenew.ts:179` reads `userDisabled: user?.disabled ?? false`. `StakePosition` holds `userId`
as a **plain scalar with no foreign key to `User`**, so an orphaned position is structurally
possible. The current expression fails **open**: an orphan renews, and the successor is created with
`email: user?.email ?? ''` (`stakingRenew.ts:214`) — a live position with no owner and no address.

**Rule:** a position whose owner row cannot be found must be treated as `FAILED_ACCOUNT_INACTIVE` —
matured, not renewed, and silent (there is no address to send to, which is the same reason the
disabled case is silent).

Unreachable today: the application exposes no user-deletion path. Same defensiveness class as E8,
and the same justification — the check is nearly free and the failure mode it prevents is one
nobody would detect.

---

## 4. A4 / A5 — retry mechanics and the `RENEWAL_DEFERRED` outcome

**The assumptions** (`stakingRenew.ts`): that `MAX_RENEWAL_ATTEMPTS = 3` governs an
increment-and-defer loop (A4), and that a `RENEWAL_DEFERRED` outcome literal may be added (A5).

### VERDICT: both APPROVED as implemented — with one required addition (A4-C1).

**The `3` is not an assumption.** It is quoted verbatim from `schema.prisma:434-435`: *"At >= 3,
force plain maturity with FAILED_SYSTEM so the principal is never stranded behind a retry loop."*
That is a spec artifact. Only the mechanics were reconstructed, and they satisfy the stated intent.

**The bound, now stated as the requirement.** What the schema comment is buying is not a count of
attempts but a **ceiling on delay** — the number exists so that principal is released rather than
held. The implemented loop defers on calls 1-3 (incrementing to 3) and forces `FAILED_SYSTEM` on
call 4. So:

> A position must never remain `ACTIVE` for more than **three settlement cycles** past its
> maturity because of renewal retries. The fourth cycle must resolve it, in either direction.

This is what the current code does; it is recorded here so that a later refactor treats the
off-by-one as a decision rather than an accident. Note the cost being bounded: while deferred, the
position sits past `maturityAt`, principal unavailable, accruing nothing (`daysPaid` is capped at
`termDays`). In daily-schedule worker mode that is up to four days. Three cycles is an acceptable
ceiling for a transient infrastructure fault; more is not.

**A5 is approved with no change.** `RENEWAL_DEFERRED` is an internal return-type variant, not a
`StakeRenewalStatus` value. It adds no user-visible surface and no locale key. It must **never** be
promoted into the enum: a deferred position's `renewalStatus` stays at its default `NONE` while it
remains `ACTIVE`, which is correct — the schema documents `renewalStatus` as "written exactly once,
inside the maturity transaction", and a deferred position has not had that transaction commit. This
is also why the Pass-3 notify sweep (`stakingSettle.ts:173-176`, keyed on
`renewalProcessedAt IS NOT NULL`) correctly ignores deferred rows.

### A4-C1 (required, **P1**) — deferred renewals must be visible to operators

`stakingSettle.ts:97-99` increments `matured`, `renewed`, and `renewalsFailed`. A
`RENEWAL_DEFERRED` outcome increments **nothing**. `SettlementResult` therefore reports a deferred
position as though it simply were not there.

This is the item I care most about in this ruling, and the only one with a live consequence for
user money. Deferral is the one auto-renew outcome that leaves a matured user's principal
unavailable, and it is the only one an operator cannot see. A silent three-cycle hold is
indistinguishable, on the admin settlement view, from nothing having happened.

**Rule:** `SettlementResult` must carry a `renewalsDeferred` count, incremented on the
`RENEWAL_DEFERRED` branch, and it must be surfaced everywhere `matured` and `renewalsFailed` are
surfaced. A non-zero value is an operational signal, not a statistic.

Deliberately **not** required: an alert, a threshold, or an admin action. Disclosure first; if the
number is ever non-zero in practice we will know what to build next. Adding a lever for a state
that has never occurred is how features get built for nobody.

---

## 5. Handoff — `web-shared-expert`

Three code changes fall out of this ruling. Each states required behaviour only; the
implementation shape is `web-shared-expert`'s call.

| ID | Priority | File | Required behaviour |
|---|---|---|---|
| **A4-C1** | **P1** | `web/src/lib/stakingSettle.ts` | Add a `renewalsDeferred` counter to `SettlementResult`, incremented on the `RENEWAL_DEFERRED` branch, and surface it wherever `matured` / `renewalsFailed` already appear. §4. |
| **A2-C1** | P2 | `web/src/lib/stakingRenewMath.ts` | E8 must also fire when the product's `coin` no longer matches the position's. Requires `coin` on both sides of `RenewalEligibilityInput`, supplied by `stakingRenew.ts`. §2. |
| **A3-C1** | P2 | `web/src/lib/stakingRenew.ts` | A missing `User` row must produce `FAILED_ACCOUNT_INACTIVE` (matured, not renewed, silent) instead of the current fail-open `user?.disabled ?? false`. §3. |

**Also required, and it is the point of the exercise:** replace every `ASSUMPTION` marker in
`stakingRenew.ts` and `stakingRenewMath.ts` with a settled citation of this document. The module
header in `stakingRenew.ts` should record that the parent PRD/ruling are still absent and that this
document now carries the authority, so the next reader does not re-open a closed question. **No
`ASSUMPTION` marker should survive in these two files.**

**Explicitly not changing:**

- The grant check stays at position 2. Do not move it to last on the strength of the "E9" label
  (§1).
- `AUTO_RENEW_MAX_TERM_DAYS = 90` stays a named code constant — not an env var, not admin-editable
  (R-3, copy-spec §0.4).
- `FAILED_GRANTED_POSITION` keeps the generic email sentence (§1.1).
- `RENEWAL_DEFERRED` stays out of `StakeRenewalStatus` (§4).

---

## 6. Follow-ups for other owners

- **`qa-lead`** — `stakingRenewMath.test.ts` currently asserts the reconstructed order. Those
  assertions are now assertions about a ruling and should say so. Add coverage for: grant-before-cap
  when both apply (§1); E8 firing on a `coin` mismatch (A2-C1); a missing user row producing
  `FAILED_ACCOUNT_INACTIVE` (A3-C1); and `renewalsDeferred` incrementing (A4-C1).
- **`prisma-db-expert`** — `schema.prisma:442` reads "ineligible for auto-renew at every layer
  (ruling R-5/R-6/R-9, E9)". The E9 label is a table identifier, not a check position; the comment
  should say so, since it is what sent the engineer looking in the first place. Comment-only, no
  migration.
- **`product-planner`** — `docs/specs/staking-auto-renew-copy-spec.md`'s header names an authority
  document that does not exist. A one-line pointer to this ruling in that header would stop the next
  reader repeating this investigation. That doc is yours; raising, not editing.
- **`pm` (me), carried** — F-6 and F-8 from copy-spec §7 remain unaddressed and are **not** resolved
  here. F-6 is a prohibited-word collision in `staking.maturedNote`'s proposed replacement; F-8 is
  the R-13 incident pause lever, which has no specified home and needs a decision on whether an
  operator-flippable pause re-opens the R-3 reasoning. Both are mine and both are still open.

---

## 7. If the parent documents reappear

- **A1 (ordering)** — the PRD wins. If it states a check order that contradicts §1.2, follow the
  PRD and supersede this section. Nothing about the current order costs a user money, so the switch
  is cheap.
- **A2-C1, A3-C1, A4-C1** — these stand regardless. They are additive hardening and an
  observability gap; a PRD that is silent on them does not contradict them.
- **The `3` in A4** — already sourced from the schema, which was itself written against the PRD.
  Unlikely to move.

If neither document reappears, nothing further is needed: this ruling is the authority.

---

*Adjudicates every `ASSUMPTION` in `web/src/lib/stakingRenew.ts` and
`web/src/lib/stakingRenewMath.ts`. Companion to
`docs/specs/staking-auto-renew-copy-spec.md`, which it does not supersede. Working notes:
`temp/20260810-auto-renew-assumption-ruling/`.*
