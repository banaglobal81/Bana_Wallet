# Harness Engineering

> Referenced from `CLAUDE.md` → Docs Index. Primary readers: `qa-lead`,
> `web-shared-expert`, `doc-keeper`.

**Test-Harness First · Encapsulation · Observability · Validation**

- **The React frontend (`web/src/app/` / `web/src/components/`) is harness-exempt** → E2E (Playwright, `web/e2e/`) only.
- **`web/src/lib/nia/client.ts` + `web/server/core/nia-signing.js` are the primary harness targets.** Pure signing logic lives in `web/server/core/nia-signing.js` (reusable), and `web/src/lib/nia/client.ts` wraps it with Next.js-specific context (environment, request handling). Real dependencies (fetch, next/server) stay server-only.
- 3-step workflow: (1) define mocks/inputs/expectations in `web/tests/harness/<feature>/` → (2) keep `core` pure, integration in `web/src/lib/nia/*` → (3) submit harness logs + diff → commit after `qa-lead` approval.
- Test runner: **vitest**, from `web/` (`npm test` / `npx vitest run`). `web/vitest.config.ts`'s `include` must cover both `src/**/*.test.ts` (co-located unit tests, e.g. `web/src/lib/stakingMath.test.ts`) and `tests/harness/**/*.test.js` (the harness suite) — verify after touching that config, since a narrowed `include` will silently drop one of the two suites from `npm test` with no error.
- Doc-drift check: `sync-harness-docs.sh` lives at the **repo root** (sibling to `CLAUDE.md` and `.claude/`) and checks `web/`-relative paths internally — run it from the repo root, not from `web/`.

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

It's a text-pattern/regex heuristic on `tool_input.command`, not a shell-aware parser —
detection matches the git/railway/write-vector tokens anywhere in the command string
(not just as the literal first token) specifically to resist the common wrapper-command
bypass class (`eval '...'`, `sh -c '...'`, `xargs`, newline-joined commands). It cannot
and does not try to catch bypasses that break up the literal token itself (a quoted
command name, a renamed/symlinked binary, a command built from string concatenation at
runtime) — closing that would need real shell tokenization. See
`.claude/hooks/test-enforce-agent-boundaries.sh` for the regression suite covering both
what's caught and what's a documented, knowingly-open gap. That's an acceptable tradeoff
(denial is recoverable, silent bypass isn't). Extending the allow/deny-by-agent set means
editing this script, not `.claude/settings.json` permissions.
