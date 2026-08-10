# Harness Engineering

> Referenced from `CLAUDE.md` → Docs Index. Primary readers: `qa-lead`,
> `web-shared-expert`, `doc-keeper`.

**Test-Harness First · Encapsulation · Observability · Validation**

- **The React frontend (`web/src/app/` / `web/src/components/`) is harness-exempt** → E2E (Playwright, `web/e2e/`) only.
- **`web/src/lib/nia/client.ts` + `web/server/core/nia-signing.js` are the primary harness targets.** Pure signing logic lives in `web/server/core/nia-signing.js` (reusable), and `web/src/lib/nia/client.ts` wraps it with Next.js-specific context (environment, request handling). Real dependencies (fetch, next/server) stay server-only.
- 3-step workflow: (1) define mocks/inputs/expectations in `web/tests/harness/<feature>/` → (2) keep `core` pure, integration in `web/src/lib/nia/*` → (3) submit harness logs + diff → commit after `qa-lead` approval.
- Test runner: **vitest**, from `web/` (`npm test` / `npx vitest run`). `web/vitest.config.ts`'s `include` must cover both `src/**/*.test.ts` (co-located unit tests, e.g. `web/src/lib/stakingMath.test.ts`) and `tests/harness/**/*.test.js` (the harness suite) — verify after touching that config, since a narrowed `include` will silently drop one of the two suites from `npm test` with no error.
- Doc-drift check: `sync-harness-docs.sh` lives at the **repo root** (sibling to `CLAUDE.md` and `.claude/`) and checks `web/`-relative paths internally — run it from the repo root, not from `web/`.

## Standard Pipeline Order

This is convention, not a hard state machine — the orchestrating thread decides which
agent runs next based on CLAUDE.md's per-agent scope descriptions. There is no scheduler
enforcing step order; the two links that ARE hook-enforced are called out below.

1. **Spec** — `pm` (PRD, product-facing why/what) → `product-planner` (FRD, the
   implementable how) for wallet features; `game-planner` instead of `product-planner`
   for the game surface. Output lands in `docs/specs/` (or `docs/specs/growth/` for
   growth-pm's own initiatives).
2. **Implementation** — the responsible code agent per CLAUDE.md's Agent Team table
   (`web-wallet-expert` / `web-admin-expert` / `web-shared-expert` / `prisma-db-expert` /
   `ui-ux-designer` / `game-developer` / `game-designer`), scoped to the area the FRD
   touches.
3. **Security review** — `wallet-security-expert` for anything touching HMAC signing,
   withdrawal routes, auth, or decimal precision on money. Review-only, no code edits;
   flags back to the implementing agent.
4. **QA** — `qa-lead` runs the 3-step Run Flow above. **This is the one step with a real
   enforcement teeth**: qa-lead's pass is what writes the `.claude/.qa-passed` marker
   that `enforce-agent-boundaries.sh` checks before letting a `deploy-manager` commit
   through without a live prompt — see "QA sign-off gate" below.
5. **Deploy** — `deploy-manager` commits + pushes to `main`, then Railway
   redeploy/restart if needed (with the confirmation gate already documented below).

`doc-keeper` and `code-compliance-checker` sit outside this flow — they run on-demand
against whatever's currently in the tree, not as a pipeline stage.

## Per-agent enforcement: `.claude/hooks/enforce-agent-boundaries.sh`
`permissions.allow`/`deny` in `.claude/settings.json` gate by tool+command pattern
only — there is no concept of "only agent X may run this" at that layer, so it cannot
by itself enforce CLAUDE.md rules 5/6 (git commit/push is `deploy-manager`-only), rule 6's
Railway-control clause (any `railway` CLI call is also `deploy-manager`-only), or the
"Bash must not write files" boundary for review/detect-only agents
(`wallet-security-expert`, `code-compliance-checker`, `routine-tasks`).

That enforcement instead lives in a `PreToolUse` hook on the `Bash` matcher
(wired in `.claude/settings.json` → `hooks`). A subagent's Bash tool call carries an
`agent_type` field in the hook's stdin JSON (a main-thread call does not) — that's the
only place caller identity is available, discovered by probing hook stdin directly. The
hook (`.claude/hooks/enforce-agent-boundaries.sh`) denies:
- `git commit`/`git add`/`git push` when `agent_type` isn't `deploy-manager` (covers the
  main thread too — rule 5/6 says "no other agent may push", and the orchestrating
  thread isn't `deploy-manager` either)
- any `railway` CLI invocation when `agent_type` isn't `deploy-manager` (same main-thread
  coverage as above)
- write-shaped commands (`sed -i`, `mv`, `cp`, `rm`, `mkdir`, `touch`, `tee`, `dd`,
  `install`, `truncate`, `xargs`, `>`/`>>`), general-purpose script interpreters
  (`python`/`node`/`ruby`/`perl`/`osascript`/`php` — none of these agents' documented
  tasks need one), and `curl`/`wget` with `-o`/`-O`/`--output`, when `agent_type` is one
  of the three review/detect-only agents above

The hook also **asks** (forces a live user permission prompt, distinct from allow/deny)
rather than auto-allowing when `deploy-manager` runs a `railway` command that isn't on
the read-only allowlist (`status`/`logs`/`whoami`/`list`/`help`). This makes CLAUDE.md
rule 6's "redeploy/restart needs explicit user confirmation first" technically enforced
instead of resting purely on `deploy-manager.md` convention — the hook still can't see
conversation state (so it can't tell whether confirmation already happened this turn),
but it can force the harness's own permission prompt on every non-read-only Railway call,
which achieves the same outcome (a human sees it before it runs).

### QA sign-off gate (CLAUDE.md rule 5)

`qa-lead.md` already said "only on pass, call `deploy-manager`" and `deploy-manager.md`'s
Forbidden list already said "committing when tests have not passed" — both were pure
convention, unenforced by anything except the agents reading their own instructions. The
hook makes it machine-checked: before letting a `deploy-manager` `git commit` through, it
looks for `.claude/.qa-passed` (repo-root-relative, resolved via `git rev-parse
--show-toplevel` so it works regardless of cwd). `qa-lead` writes that marker as the last
step of a passing Run Flow; the hook deletes it the moment it clears a commit through, so
it's single-use — the next commit needs a fresh QA pass, not a reused stale marker.

Same reasoning as the Railway ask-gate above: the hook can't see conversation state, so it
can't confirm QA genuinely ran this session, only that the marker exists. Rather than a
hard deny (which would brick doc-only/config commits that legitimately don't go through
qa-lead), a missing marker falls back to `ask` — a live confirmation prompt — so a human
makes the call instead of an unverified commit landing silently. `.claude/.qa-passed` is
gitignored; it never gets committed.

It's a text-pattern/regex heuristic on `tool_input.command`, not a shell-aware parser,
using a **two-tier match**: a token is flagged if it's (a) anchored — the literal first
word of the command or of a segment after `;`/`&`/`|` (grep's `^` also anchors per line,
so newline-joined commands are covered for free) — or (b) a known wrapper keyword
(`eval`, `xargs`, `env`, `exec`, `nohup`, `sudo`, `timeout`, `sh -c`, `bash -c`, `zsh -c`)
is anchored in the same command AND the token appears anywhere in it. (b) exists to catch
`eval "git commit -m x"` / `sh -c "git push"` / `xargs git commit` — bypasses (a) alone
misses because the token isn't the command's literal first word there.

An earlier version matched the token anywhere, unconditionally, with no wrapper gate —
that broke routine work: `grep -rn "git commit" docs/` (normal for `doc-keeper` /
`code-compliance-checker`, since CLAUDE.md itself contains the phrases "git commit" and
"railway" repeatedly) and an ordinary `deploy-manager` commit message like `git commit -m
"chore: install dep, mv config"` (English words "install"/"mv", not commands) were both
false-denied. The wrapper-keyword gate keeps the bypass coverage while excluding plain
search/argument text — traded off against reopening a narrower gap (`\git commit -m x`,
where the backslash is a shell no-op but isn't anchored or wrapper-invoked, so it's
allowed) that's rare and requires deliberately atypical syntax, versus false positives
that hit routine ops constantly. It does not and cannot catch bypasses that break up the
literal token itself (a quoted command name, a renamed/symlinked binary, a command built
from string concatenation at runtime) — closing that would need real shell tokenization.
See `.claude/hooks/test-enforce-agent-boundaries.sh` for the regression suite covering
both what's caught and what's a documented, knowingly-open gap. Extending the
allow/deny-by-agent set means editing this script, not `.claude/settings.json`
permissions.
