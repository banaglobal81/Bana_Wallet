# Copy & Flow Spec — Auto-Renew: the D-3 cap, the `PATCH` 409s, the D-1 admin warning, the two emails

> Status: **BUILD-READY SPEC.** Owner: `product-planner`. Date: 2026-08-09.
> **Parent:** `docs/specs/staking-auto-renew-prd.md` (Revision 2) — read §4, §5, §7.1 and §9 there for
> the reasoning; this document holds the exact conditions and exact strings.
> **Authority:** `docs/specs/staking-auto-renew-ruling.md` (`pm`, 2026-08-09), §5 ownership table:
> *"Own the detailed screens/flows/strings for the D-3 cap (S1 hiding + 409 copy), the D-1 admin
> warning, and the localized email templates."*
>
> **Who reads which section**
>
> | Section | Owner |
> |---|---|
> | §1 — D-3 cap: S1 hiding, S2 states | `web-wallet-expert` |
> | §2 — `PATCH …/auto-renew` responses and 409 copy | `web-shared-expert` (server) + `web-wallet-expert` (rendering) |
> | §3 — D-1 admin rate-lowering warning | `web-admin-expert` |
> | §4 — the two emails, **English source only** | `web-shared-expert` (build) |
> | §5 — translation brief | `ui-ux-designer` |
> | §6 — AC cross-reference | `qa-lead` |
> | §7 — flags raised, not fixed here | `pm` / `ui-ux-designer` |

---

## 0. Constraints binding on every string in this document

These are not tone guidance. Each one is carried from the PRD or the ruling and each has an
acceptance criterion behind it.

1. **No word from the PRD §9 prohibited-copy list, in any locale, in any string in this document —
   including the admin-facing ones.** The list: *streak · keep it going · don't lose · maintain ·
   uninterrupted · continuous · loyal / loyalty · reward · bonus · extra · boost · exclusive ·
   recommended · most popular · smart choice.* Also prohibited: any comparison implying an
   auto-renewing user does better than a manual restaker, and any framing of turning auto-renew
   **off** as a loss. → AC-23.
2. **No rate, APR, or projected-earnings figure in either email, in any locale.** → PRD §7.1, AC-22.
   This is why the email variants of the §8.2 copy map differ from the in-app variants (§4.3 below).
   Term lengths, principal amounts, and `minAmount` / `maxAmount` limits are **not** rate figures and
   are permitted.
3. **The confirm-sheet lock line is verbatim, everywhere it appears:**
   **"Staked funds cannot be withdrawn before the new term ends."**
   It may not be softened, shortened, reordered, split, or moved into a tooltip, in any locale. It
   appears in three places in this spec: the S2 confirm sheet (PRD §4), the pre-maturity reminder
   email (§4.1), and the renewed-outcome email (§4.2). → AC-4.
4. **`AUTO_RENEW_MAX_TERM_DAYS = 90`** is a named code constant with a comment citing the ruling —
   **not** an env var, **not** admin-editable (R-3). Every string that shows the number renders it
   from that constant as `{maxTermDays}`; **do not hardcode "90" into any locale file.**
5. **Neutral register throughout:** factual, second person, present/future indicative. Successes and
   failures get the same visual weight (PRD §4 S3).

---

## 1. D-3 cap — the S1 hide condition and the S2 states (`web-wallet-expert`)

### 1.1 The exact condition

Auto-renew is **offered** on a product iff:

```ts
product.termDays <= AUTO_RENEW_MAX_TERM_DAYS   // 90
```

Boundary: **`termDays === 90` shows the control. `termDays === 91` does not.** `<=`, not `<`.

**No new API field is needed for S1.** The stake-flow product card already renders `p.termDays`
(`web/src/components/Staking.tsx:188`), so the condition is computable from data already on the
client.

For a **position** (S2, and the endpoint in §2), eligibility is:

```ts
eligible = position.termDays <= AUTO_RENEW_MAX_TERM_DAYS
        && position.grantedByAdminId == null      // R-5
```

The server exposes this to the client as a single derived boolean `autoRenewEligible` on
`serializePosition` (PRD §4 S4). **The client must not re-implement the rule**, and
`grantedByAdminId` itself is never serialized to the client — the admin's identity is not the user's
business.

### 1.2 Nothing else on the card. Silence is the spec. (The question, answered.)

**On a product with `termDays > 90`, render no auto-renew control, no disabled control, no greyed
label, no reserved layout space, and no explanatory text anywhere on the product card, the product
list, the stake flow, or the staking page.** A 180- or 360-day product page says nothing at all about
auto-renew.

This was raised as an open question — does a long-term product need a line explaining that
auto-renew isn't offered? **No.** Three reasons, in order of weight:

1. **A prose note about an absent feature is the disabled control in a different costume.** The PRD's
   own S1 rationale is that a disabled control "invites a 'how do I unlock this' support ticket for a
   feature that carries no benefit." A sentence saying *"auto-renew isn't available on this term"*
   produces exactly the same ticket, from exactly the same user, with the same non-answer at the end
   of it. The stated principle already decides this case; the only new thing is noticing that prose
   is not exempt from it.
2. **It would steer term selection, which is the one thing term copy must not do.** An absence-note
   on the long products makes the short products read as feature-richer by comparison. Term length
   should be chosen on how long the user is willing to lock capital — nothing else. Manufacturing a
   soft preference for shorter terms via a convenience rider is a nudge we did not decide to make,
   and PRD §9 already prohibits copy that steers between options (*recommended*, *most popular*).
   A comparative absence is that steer without the vocabulary.
3. **There is no expectation to violate.** Auto-renew is opt-in, incentive-free by ruling, has no
   marketing surface, and appears nowhere in onboarding. A user on a 360-day product who has never
   seen the control has lost nothing and been told nothing false. Disclosure obligations attach to
   things that happen to your money; nothing happens here.

**One thing that is *not* silence, and is the reason the S2 table below has five rows rather than
three:** if a position somehow carries `autoRenew = true` while being ineligible, its state **must**
still be shown. Hiding a live standing instruction is the failure mode M-2 exists to prevent
(PRD §7.2). Silence applies to the *offer*, never to an *active instruction*.

### 1.3 S2 — position row states, exact strings

Row shown only when `status === 'ACTIVE'`. Evaluate in this precedence order; **first match wins.**

| # | Condition | Render | Off-toggle |
|---|---|---|---|
| 1 | `!eligible && !autoRenew` | **Nothing.** No row, no label, no space. | n/a |
| 2 | `autoRenew && grantedByAdminId != null` | `staking.autoRenew.stateOnGranted` | Yes, must work |
| 3 | `autoRenew && termDays > maxTermDays` | `staking.autoRenew.stateOnOverCap` | Yes, must work |
| 4 | `autoRenew && product.status === 'CLOSED'` | `staking.autoRenew.stateOnClosed` | Yes, must work |
| 5 | `autoRenew` (eligible, product open) | `staking.autoRenew.stateOn` | Yes, must work |
| 6 | `eligible && !autoRenew` | `staking.autoRenew.stateOff` + toggle | n/a — tap opens the confirm sheet |

Precedence rationale: the grant and cap conditions are **permanent** properties of the position, the
closed-product condition is **reversible**. Showing a reversible cause when a permanent one also
applies would tell the user to wait for something that will not help.

Rows 2 and 3 are reachable only by a direct DB write or by a **downward** change to
`AUTO_RENEW_MAX_TERM_DAYS`. They are cheap and they are what makes such a change safe (PRD §5, E2a).

**Strings** — namespace `staking.autoRenew.*`, ICU message format:

| Key | English source |
|---|---|
| `optInLabel` | `Auto-renew at maturity` |
| `optInHelp` | `When this term ends, the same amount is staked again on this product for another {termDays} days. Interest already earned is not included. You can turn this off any time before maturity.` |
| `stateOff` | `Auto-renew: Off` |
| `stateOn` | `Auto-renew: On · renews {date}` |
| `stateOnClosed` | `Auto-renew: On · this product is closed to new stakes, so renewal will probably not be possible.` |
| `stateOnOverCap` | `Auto-renew: On · this stake's term is longer than {maxTermDays} days, so it will not renew. Your principal will be available when it matures on {date}.` |
| `stateOnGranted` | `Auto-renew: On · this stake was granted by BANA, so it will not renew. Your principal will be available when it matures on {date}.` |
| `offToast` | `Auto-renew is off. Your principal will be available when this stake matures on {date}.` |
| `confirmTitle` | `Turn on auto-renew?` |
| `confirmBody1` | `On {maturityDate}, {principal} {coin} will be staked again on {productName} for another {termDays} days at the rate offered at that time.` |
| `confirmLock` | `Staked funds cannot be withdrawn before the new term ends.` **← verbatim, bold, mandatory** |
| `confirmBody2` | `Interest already earned is not restaked.` |
| `confirmBody3` | `You can turn this off any time before {maturityDate}.` |
| `confirmYes` | `Turn on` |
| `confirmCancel` | `Cancel` |

`confirmLock` renders **bold and inline in the sheet body** — not as a footnote, not collapsed, not
in a smaller type size than the surrounding lines.

---

## 2. `PATCH /api/staking/positions/[id]/auto-renew` — responses and 409 copy

Owner: `web-shared-expert` (server), `web-wallet-expert` (rendering).

### 2.1 Response shape

```jsonc
// success
{ "ok": true, "data": { /* serialized position, incl. autoRenew + autoRenewEligible */ } }

// failure
{ "ok": false, "error": "<English message>", "code": "<STABLE_CODE>" }
```

`code` is **new and additive** — existing routes return `{ ok, error }` and adding a third key breaks
nothing. It exists because this app ships six locales and the client must render a translated string,
not a server-generated English one. The client maps `code` → `staking.autoRenew.error.<CODE>` and
falls back to `error` if the key is missing. **The English `error` string is still returned** so that
logs, curl, and any non-localized consumer stay readable.

### 2.2 The ordered check table

`ON` means `body.autoRenew === true`; `OFF` means `false`.

| # | Check | Applies to | HTTP | `code` | English `error` |
|---|---|---|---|---|---|
| 1 | `requireUser()` | both | 401 | *(existing handling)* | *(existing)* |
| 2 | `typeof body.autoRenew === 'boolean'` | both | 400 | `INVALID_REQUEST` | `Invalid request.` |
| 3 | Position exists **and** `position.userId === session.user.id` | both | **404** | `POSITION_NOT_FOUND` | `Stake not found.` |
| 4 | **Idempotency short-circuit:** `position.autoRenew === body.autoRenew` | both | **200** | — | *(no write; return the serialized position)* |
| 5 | `position.status === 'ACTIVE'` | both | 409 | `POSITION_NOT_ACTIVE` | `This stake has already matured — auto-renew can no longer be changed.` |
| 6 | `position.grantedByAdminId == null` | **ON only** | 409 | `AUTO_RENEW_GRANTED_POSITION` | `This stake was granted by BANA and can't be set to renew. When it matures, your principal becomes available in your wallet.` |
| 7 | `position.termDays <= AUTO_RENEW_MAX_TERM_DAYS` | **ON only** | 409 | `AUTO_RENEW_TERM_TOO_LONG` | `Auto-renew is available on stakes with a term of {maxTermDays} days or less. This stake's term is {termDays} days.` |

Three ordering facts that are load-bearing, not stylistic:

- **404 before everything else** (check 3). Never 403, never a different status for "exists but isn't
  yours" — no existence leak (CLAUDE.md rule 8, AC-2).
- **Idempotency before the eligibility checks** (check 4 before 6/7). A no-op `{ autoRenew: false }`
  on an ineligible position returns **200**, not 409. Refusing a request that asks for the state the
  row is already in would be theatre.
- **Checks 6 and 7 gate the on-ramp only.** PRD §2's tie-breaking principle is that the off-ramp is
  always cheaper than the on-ramp, and M-3 says the off-switch has no gate. An off request on an
  ineligible position that somehow carries `autoRenew = true` (S2 rows 2 and 3) **must succeed** —
  otherwise the one row that most needs an exit is the one row that cannot use it.

**No maintenance gate in either direction.** Turning **off** during `maintenanceMode` must succeed
(AC-3). Turning **on** is also permitted: it locks nothing at the moment of the call, changes no
balance, and is reversible with one tap, so a gate would add an inconsistency without protecting
anything. Stated explicitly so nobody adds one later on symmetry grounds.

### 2.3 Why the grant 409 and the cap 409 must differ

Revision 1 of the PRD used one string — `Auto-renew isn't available for this stake.` — for the grant
case, written before the cap existed. **Reusing it for both is wrong**, and the reason is not tone:

- The **cap** refusal is **actionable and general**. It tells the user something true about the
  product line that they can use: shorter terms carry the option. It also correctly implies the
  refusal is about the *term*, not about them or their stake in particular.
- The **grant** refusal is **not actionable and is specific to this one position**. Sending a granted
  user off to "try a shorter term" would be a false lead — every grant is ineligible regardless of
  term. The honest message names the cause (this position came from BANA) and closes the loop by
  saying what happens instead (the principal becomes available at maturity), so there is nothing left
  to ask support.

A shared generic string gives both users the same non-answer and generates a support ticket from
each. The cap message is the one that must carry `{maxTermDays}` and `{termDays}`; the grant message
must carry neither, because the term is irrelevant to it.

Neither message uses a prohibited word, and neither implies the user did anything wrong.

### 2.4 Client keys

| Key | English source |
|---|---|
| `staking.autoRenew.error.INVALID_REQUEST` | `Invalid request.` |
| `staking.autoRenew.error.POSITION_NOT_FOUND` | `Stake not found.` |
| `staking.autoRenew.error.POSITION_NOT_ACTIVE` | `This stake has already matured — auto-renew can no longer be changed.` |
| `staking.autoRenew.error.AUTO_RENEW_GRANTED_POSITION` | `This stake was granted by BANA and can't be set to renew. When it matures, your principal becomes available in your wallet.` |
| `staking.autoRenew.error.AUTO_RENEW_TERM_TOO_LONG` | `Auto-renew is available on stakes with a term of {maxTermDays} days or less. This stake's term is {termDays} days.` |

Rendered inline in the position row, in the same neutral weight as the other S2 states — not a toast,
not a modal, not error-red. A 409 here is a rule the user could not have known, not a mistake they
made. (Rows 1 and 6 of the S2 table mean a user should never see 6 or 7 through the UI at all; these
strings exist for the direct-API, stale-client, and cap-lowered cases.)

---

## 3. D-1 admin warning — rate lowering (`web-admin-expert`, R-1)

Surface: `web/src/app/[locale]/admin/staking/page.tsx` — the inline product-edit panel (`:285-304`)
and its save action `saveEdit` (`:96-109`).

### 3.1 Trigger condition — precise

Show the warning **iff both** hold:

```ts
import Decimal from 'decimal.js';

const lowering =
  editForm.dailyRatePct.trim() !== '' &&
  (() => { try { return new Decimal(editForm.dailyRatePct).lt(new Decimal(product.dailyRatePct)); }
           catch { return false; } })();

const show = lowering && product.autoRenewActiveCount > 0;
```

- **decimal.js, never `Number()` / `parseFloat()`** — CLAUDE.md rule 2. `0.050` and `0.05` must
  compare **equal** and therefore show nothing.
- **Only on a lowering.** A raise shows nothing. An unchanged value shows nothing. An empty or
  unparseable input shows nothing (the existing save-side validation handles those).
- **Suppressed at zero.** If no `ACTIVE` position on the product has `autoRenew = true`, show neither
  the inline warning nor the confirmation step. A warning about zero affected users trains admins to
  click through warnings, which costs us the one time it matters.
- Evaluated **live** as the rate field changes, and **again** at save time.
- The other four editable fields (`name`, `minAmount`, `maxAmount`, `capacity`) do **not** trigger it.
  They have their own renewal consequences (E5/E6/E7) but the ruling scoped R-1 to the rate, and rate
  is the one where the operator's action and the user's outcome are least obviously connected.

### 3.2 Data — one field, no new query

`GET /api/admin/staking/products` returns, per product:

```ts
autoRenewActiveCount: number
// = count(StakePosition where productId = p.id AND status = 'ACTIVE' AND autoRenew = true)
```

The route already scans every `ACTIVE` position (`products/route.ts:31-41`) selecting
`{ productId, principal }`. Add `autoRenew: true` to the `select` and increment a second counter in
the **same loop**. No additional query, no additional round trip.

The count is a read at page-load time and may be seconds stale. That is acceptable: R-1 scopes this
to a **read-only count that does not alter the PATCH's decision logic** — the admin can always save,
and the number is there to inform, not to gate.

### 3.3 Inline warning — exact copy

Placement: directly beneath the **Daily rate** input inside the edit panel, above the Save/Cancel
row. Warning weight (amber), not error weight (rose) — this is a legitimate operation with a
consequence, not a mistake.

> **Lowering the rate will refuse {count, plural, one {# pending auto-renewal} other {# pending auto-renewals}}.**
>
> {count, plural, one {# active position} other {# active positions}} on {productName} {count, plural, one {has} other {have}} auto-renew on. Each one is checked against this product's rate at the moment it matures. If the saved rate is lower than the rate on the position, that renewal is refused and the principal is released to the user's wallet instead of being staked again.
>
> Raising the rate back before a position matures restores that position's renewal — only the value at the moment of maturity is used.
>
> Positions already staked keep the rate they were staked at. This change does not alter what any existing position earns.

The last paragraph is the one admins most need and are most likely to assume the opposite of.
`dailyRatePct` is snapshotted onto the position at stake time (`schema.prisma:232`) and settlement
pays from the position's own value — lowering the product rate changes what **new** stakes and
**renewals** get, and nothing else. Leaving it unsaid invites an admin to lower a rate believing they
are cutting live liability, discover they are not, and lower it further.

### 3.4 Confirmation step — exact copy

Interposed on **Save**, and only when §3.1's condition holds at save time. A raise or an unchanged
rate saves in one click exactly as it does today — do not add friction to the common path.

> **Save a lower rate on {productName}?**
>
> New daily rate {newRate}% — currently {oldRate}%.
>
> {count, plural, one {# active position} other {# active positions}} on this product {count, plural, one {has} other {have}} auto-renew on. Those renewals will be refused at maturity and the principal released to the user's wallet.
>
> Existing positions keep the rate they were staked at.
>
> [ Save lower rate ]   [ Cancel ]

Primary button is `Save lower rate` — named for the action, not "Confirm" / "OK", so a
click-through still reads as a decision in the audit trail of the admin's own memory. Cancel returns
to the edit panel with the typed value intact.

### 3.5 What must not happen

- The warning must not block, disable, or delay the save. R-1 is disclosure, not a gate.
- The warning must not appear on a rate **raise**, even though a raise also renews positions (at the
  higher rate). That is the harmless direction and warning about it dilutes the warning that matters.
- No count of *all* active positions in place of the auto-renew count. The number's whole value is
  that it is the number of people this specific consequence lands on.

### 3.6 Keys

Namespace `adminStaking.autoRenewWarning.*` (the admin page is localized —
`useTranslations('adminStaking')`, `page.tsx:18`): `inlineTitle`, `inlineBody`, `inlineRestore`,
`inlineSnapshot`, `confirmTitle`, `confirmRates`, `confirmBody`, `confirmSnapshot`, `confirmYes`,
`confirmCancel`. **The §9 prohibited-copy list applies to these keys too** — recommend `qa-lead`
extend AC-23's scan to cover `adminStaking.autoRenewWarning.*` alongside `staking.autoRenew.*`.

---

## 4. Emails — English source (`web-shared-expert` builds; `ui-ux-designer` translates)

Precedent: `web/src/lib/email/resend.ts:21-79`. Both existing templates are plain and factual, send
`text` **and** `html`, use `system-ui` at `max-width:480px`, `#0b1f3a` headings, `#64748b` small
print, `#2E7DFF` for the single action button, and end on a short reassurance line. Match that shape.
No preheader marketing line, no logo banner, no footer links beyond the one deep link.

**Send mechanics common to both** (PRD §8.1, R-8/R-9):

| | |
|---|---|
| Recipient | **`user.email`, not `position.email`.** The position carries a snapshot that goes stale after an email change. |
| Locale | `user.locale ?? 'en'`. The worker has no request context, so `next-intl`'s request locale is unavailable — the persisted column is the only source. |
| Dates | Formatted in the user's locale, not a hardcoded `en-US` format. |
| Deep link | `{APP_URL}/{locale}/staking` — the locale segment is required by the `[locale]` route structure. |
| Timing | **After commit**, best-effort, never inside the maturity transaction, never able to roll it back. |
| Idempotency | `maturityReminderSentAt` (reminder) / `renewalNotifiedAt` (outcome), stamped **only on a successful send** so a failure retries next cycle. |
| Never sent | `renewalStatus = FAILED_ACCOUNT_INACTIVE` → no outcome email at all. `renewalStatus = NONE` (auto-renew was off) → no outcome email; that is a plain maturity and this feature does not add an email to it. |

### 4.1 Pre-maturity reminder (PRD §7.1, M-1 — ship condition)

Send condition (all four):
`status = ACTIVE` · `autoRenew = true` · `maturityReminderSentAt IS NULL` ·
`now < maturityAt <= now + lead(termDays)`.

Lead: `termDays <= 10` → 1 day; `11..90` → 3 days; `> 90` → 7 days **(defensive code branch only —
unreachable while R-2 is in force; keep in code, keep out of the product description)**.

`maturityAt > now` is a hard condition: if the worker was down through the whole lead window the
reminder is **skipped, not sent late**. A warning about a deadline that has already passed is worse
than no warning, and the outcome email covers that case accurately.

**Subject**

```
Your {productName} stake matures on {maturityDate} and is set to renew
```

**Text body**

```
Your stake of {principal} {coin} on {productName} matures on {maturityDate}.

Auto-renew is on for this stake. Unless you turn it off before then, the same
amount — {principal} {coin} — will be staked again on {productName} for another
{termDays} days at the rate offered at that time. Interest already earned is not
included.

Staked funds cannot be withdrawn before the new term ends.

To turn auto-renew off: open BANA Wallet, go to Staking, find this stake under
My Stakes, and switch auto-renew off. It takes one tap, there is no confirmation
step, and you can do it any time before {maturityDate}.

{stakingUrl}

If auto-renew is off when this stake matures, your principal simply becomes
available in your wallet.
```

**HTML body** — same content, `resend.ts` shape:

```
<h2>          Your {productName} stake matures on {maturityDate}
<p>           Your stake of <strong>{principal} {coin}</strong> matures on {maturityDate}.
<p>           Auto-renew is on for this stake. Unless you turn it off before then, the same
              amount will be staked again on {productName} for another {termDays} days at the
              rate offered at that time. Interest already earned is not included.
<p><strong>   Staked funds cannot be withdrawn before the new term ends.
<p><a button> Manage this stake            → {stakingUrl}
<p small>     To turn auto-renew off, open Staking and switch it off on this stake. One tap,
              no confirmation step, any time before {maturityDate}. If auto-renew is off when
              this stake matures, your principal simply becomes available in your wallet.
```

**Deliberate omissions, each with a reason so nobody adds them back:**

| Omitted | Why |
|---|---|
| Rate / APR / projected interest | AC-22. Including a projected return turns a transactional email into a marketing message and drags six markets' marketing-consent rules into it (PRD §7.1). |
| Any encouragement to keep it on | PRD §9. The only call to action in this email is the off-switch. That asymmetry is the whole point of M-1. |
| A "turn off" one-click link | An unauthenticated state-changing link on a capital-lock instruction is a phishing template. The user signs in and taps the toggle; that is one extra step and it is worth it. |
| The product's current rate as context | Same as row 1. "At the rate offered at that time" states the mechanism without stating a number. |

**Two edge behaviours, stated so nobody "fixes" them:**

- **A late opt-in still gets the email.** A user who turns auto-renew on 12 hours before maturity on
  a 30-day product matches the query and receives the reminder on the next worker pass. Redundant,
  factually correct, at most one email — and suppressing it would need an `autoRenewSetAt` column the
  PRD deliberately declines to add.
- **Sent even when renewal currently looks impossible** (e.g. the product is already `CLOSED`).
  Eligibility is only decided inside the maturity transaction. A moot reminder costs nothing; a
  skipped one that turns out to have been needed is the exact failure M-1 exists to prevent.

### 4.2 Renewal outcome email

Sent once per maturity where `renewalStatus != NONE` and `!= FAILED_ACCOUNT_INACTIVE`.

#### 4.2.1 `RENEWED`

**Subject**

```
Your {productName} stake renewed for another {termDays} days
```

**Text body**

```
Your stake on {productName} matured on {maturedAt} and was staked again.

  Amount staked again:  {principal} {coin}
  Product:              {productName}
  New term:             {termDays} days
  New term started:     {startAt}
  New term ends:        {newMaturityAt}

Interest earned on the previous term was not included — only the principal was
staked again.

Staked funds cannot be withdrawn before the new term ends.

Auto-renew is still on for the new stake. To turn it off, open Staking in BANA
Wallet and switch it off on this stake.

{stakingUrl}
```

**HTML body** — `<h2>` = *Your {productName} stake renewed*, the five values as a two-column
definition list in `#64748b` labels / `#0b1f3a` values, the two body paragraphs, the verbatim lock
line bold, one `#2E7DFF` button *View this stake* → `{stakingUrl}`, and the "auto-renew is still on"
sentence as the closing small print.

**"Auto-renew is still on for the new stake" is mandatory.** The flag is inherited (PRD §6.2), so
this email is the moment the user learns that one tick has become a standing arrangement. Omitting
it would make the successor position the first thing this feature does without telling anyone.

#### 4.2.2 Not renewed

**Subject**

```
Your {productName} stake matured and was not renewed
```

**Text body**

```
Your stake on {productName} matured on {maturedAt} and was not staked again.

{reasonSentence}

Your {principal} {coin} principal is available in your wallet.

If you want to stake it again, open Staking in BANA Wallet.

{stakingUrl}
```

`{reasonSentence}` by `renewalStatus`:

| `renewalStatus` | Email reason sentence |
|---|---|
| `FAILED_PRODUCT_CLOSED` | `{productName} is closed to new stakes.` |
| `FAILED_TERM_TOO_LONG` | `Auto-renew isn't available on stakes with a term longer than {maxTermDays} days.` |
| `FAILED_CAPACITY` | `{productName} is full.` |
| `FAILED_BELOW_MIN` | `The minimum stake for {productName} is now {minAmount} {coin}, which is more than your stake.` |
| `FAILED_ABOVE_MAX` | `The maximum stake for {productName} is now {maxAmount} {coin}, which is less than your stake.` |
| `FAILED_RATE_LOWERED` | `The rate for {productName} is now lower than the rate on your stake, so it was not staked again on different terms.` |
| `FAILED_TERMS_CHANGED` | `The terms of {productName} changed.` |
| `FAILED_SYSTEM` | `We couldn't complete the renewal.` |
| `FAILED_GRANTED_POSITION` | `We couldn't complete the renewal.` *(same as `FAILED_SYSTEM` — see PRD §3)* |
| `FAILED_ACCOUNT_INACTIVE` | *(no email)* |

Every variant ends by stating where the money is. That is the only thing the user actually needs.

### 4.3 The email variants deliberately differ from the PRD §8.2 in-app strings

**Do not build the emails by copying the §8.2 table.** Two rows carry rate figures in-app and must
not carry them in email:

| | In-app (PRD §8.2) | Email (§4.2 above) |
|---|---|---|
| `RENEWED` | `…for {termDays} days at {dailyRatePct}%/day.` | Rate omitted entirely. |
| `FAILED_RATE_LOWERED` | `…changed to {dailyRatePct}%/day, lower than the {oldRate}%/day on your stake.` | `…is now lower than the rate on your stake…` — no figures. |

The in-app surface keeps the figures because the rate is already on the same screen and the staking
page is not a channel with marketing-consent obligations attached. The email drops them per AC-22.

**Omitting the rate from the renewed email hides nothing**, and that is worth stating because it is
the obvious objection: E4 refuses any renewal at a rate **lower** than the one on the position, so
the new rate is always ≥ the old one. There is no state in which the omission conceals a downgrade —
the downgrade case produces the *other* email.

### 4.4 Token list

`{productName}` `{principal}` `{coin}` `{termDays}` `{maturityDate}` `{maturedAt}` `{startAt}`
`{newMaturityAt}` `{minAmount}` `{maxAmount}` `{maxTermDays}` `{stakingUrl}`

`{principal}`, `{minAmount}`, `{maxAmount}` are **decimal strings from the DB rendered as-is** —
never `Number()`-formatted, never rounded (CLAUDE.md rule 2). `{maxTermDays}` renders from
`AUTO_RENEW_MAX_TERM_DAYS`. There is deliberately **no rate token** in the email set.

---

## 5. Translation brief for `ui-ux-designer`

Locales: ko, ja, zh, vi, th. English above is the source.

1. **The PRD §9 prohibited-copy list is binding in every locale, not just English** — including the
   *concept*, not only the literal word. A Korean or Japanese rendering that reads as "이어가세요" /
   「続けましょう」 ("keep it going") violates the list even though no listed English token appears.
   Translate the *fact*, never the *encouragement*. → AC-23 should scan all six files.
2. **`confirmLock` / the email lock line is verbatim in every locale**, meaning: one sentence, stated
   as a flat prohibition, not softened by a politeness register that turns it into advice. In ko/ja
   in particular, resist the honorific hedge that converts "cannot" into "would be difficult". It
   must read as a fact about the product, not a request.
3. **No rate/APR/earnings figure may enter the emails via translation** — including a translator's
   helpful addition of "(연 이율 …)" style context. → AC-22 is asserted across all six locales.
4. **Financial vocabulary matches the existing staking page strings exactly** (decision §6):
   principal, interest, term, maturity. Do not introduce a second word for any of them.
5. **Admin strings (§3) are in scope for rules 1 and 4** even though the audience is operators.
6. **`{maxTermDays}` is a token, never a literal.** Do not bake "90" into any locale file.
7. Success and failure copy get the **same** register and the **same** visual weight (PRD §4 S3). No
   celebratory particle on the renewed case, no apologetic one on the failure case.

Also assigned to you by the ruling, and it lands next to this copy: **F-1** —
`staking.maturedNote` (`web/messages/en.json:244`) currently claims interest "is paid out" at
maturity, which is false (no payout mechanism exists). Its replacement may not assert a wallet
payout. See §7 below for a wording collision I found in the ruling's suggested replacement.

---

## 6. Acceptance-criteria cross-reference (`qa-lead`)

| This spec | PRD AC |
|---|---|
| §1.1 boundary (90 shows, 91 hides), §1.2 no explanatory text | **AC-27** |
| §1.3 rows 2/3 render with a working off-toggle | **AC-31** |
| §1.3 `confirmLock` present and verbatim | **AC-4** |
| §2.2 checks 6/7 distinct messages; OFF succeeds on ineligible; no-op returns 200 | **AC-28** |
| §2.2 check 3 (404, no existence leak), check 5 (409 non-ACTIVE), idempotency | **AC-2** |
| §2.2 off during `maintenanceMode` | **AC-3** |
| §3.1 trigger only on a lowering; `0.050` == `0.05`; suppressed at count 0 | **AC-32** |
| §4.1 never sent once `maturityAt <= now`; exactly one per position | **AC-20** |
| §4.2 exactly one outcome email; retry on failure; never rolls back the renewal | **AC-21** |
| §4.3 no rate/APR/projected figure in either email, all six locales | **AC-22** |
| §5.1 prohibited-copy scan across all six locale files (+ `adminStaking.autoRenewWarning.*`) | **AC-23** |
| §4 send mechanics — `user.email`, locale fallback, locale-formatted dates, locale-segmented link | **AC-34** |
| Grant exclusion at all three layers | **AC-30** |
| E2a ordering (fires before E3/E4) | **AC-29** |

---

## 7. Flags raised here, not fixed here

- **F-6 — a prohibited-word collision inside F-1's own suggested replacement.** The ruling (§5,
  `ui-ux-designer` row) says F-1's replacement should "state that principal becomes available and
  interest is credited to the **rewards** ledger." **"reward" is on the PRD §9 prohibited-copy
  list.** `staking.maturedNote` is outside the `staking.autoRenew.*` namespace that AC-23 scans, so
  it would pass the test while sitting one line away from auto-renew copy — which is precisely the
  adjacency PRD §1.2 flagged when it raised F-1 in the first place. Suggested neutral wording:
  *"…and the interest earned is recorded on your staking record."* This is `pm`'s and
  `ui-ux-designer`'s call, not mine — I am naming the collision, not resolving it.
- **F-7 — `AUTO_RENEW_MAX_TERM_DAYS` and the reminder lead-time table are two constants that must
  agree.** The `11..90` lead-time row's upper bound is the cap. If the cap is ever changed (a code
  change, per R-3), the lead-time table must be revisited in the same change or a newly eligible term
  falls into the unreachable `> 90` branch by accident. Suggest deriving the row boundary from the
  constant rather than writing `90` twice. → `web-shared-expert`.
- **F-8 — the R-13 pause lever has no specified home.** PRD §6.4 requires that auto-renew can be
  paused (new opt-ins suspended, renewal execution stopped) as an incident response, but does not say
  where the switch lives. It is an **incident lever, not a product setting**, and it must not be
  confused with R-3's forbidden config-flip cap. → `web-shared-expert` to specify; worth confirming
  with `pm` that an operator-flippable pause does not re-open the R-3 reasoning.

---

*Companion to `docs/specs/staking-auto-renew-prd.md` (Revision 2). Implements the
`product-planner` row of `docs/specs/staking-auto-renew-ruling.md` §5. Strings here are the English
source of record; `ui-ux-designer` owns ko/ja/zh/vi/th. Supersedes nothing.*
