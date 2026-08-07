# Harness Engineering

> Referenced from `CLAUDE.md` → Docs Index. Primary readers: `qa-lead`,
> `web-shared-expert`, `doc-keeper`.

**Test-Harness First · Encapsulation · Observability · Validation**

- **The React frontend (`web/src/app/` / `web/src/components/`) is harness-exempt** → E2E (Playwright, `web/e2e/`) only.
- **`web/src/lib/nia/client.ts` + `web/server/core/nia-signing.js` are the primary harness targets.** Pure signing logic lives in `web/server/core/nia-signing.js` (reusable), and `web/src/lib/nia/client.ts` wraps it with Next.js-specific context (environment, request handling). Real dependencies (fetch, next/server) stay server-only.
- 3-step workflow: (1) define mocks/inputs/expectations in `web/tests/harness/<feature>/` → (2) keep `core` pure, integration in `web/src/lib/nia/*` → (3) submit harness logs + diff → commit after `qa-lead` approval.
- Test runner: **vitest**, from `web/` (`npm test` / `npx vitest run`). `web/vitest.config.ts`'s `include` must cover both `src/**/*.test.ts` (co-located unit tests, e.g. `web/src/lib/stakingMath.test.ts`) and `tests/harness/**/*.test.js` (the harness suite) — verify after touching that config, since a narrowed `include` will silently drop one of the two suites from `npm test` with no error.
- Doc-drift check: `sync-harness-docs.sh` lives at the **repo root** (sibling to `CLAUDE.md` and `.claude/`) and checks `web/`-relative paths internally — run it from the repo root, not from `web/`.

## Known limitation: `.claude/settings.json` permissions are not per-agent
`permissions.allow`/`deny` in `.claude/settings.json` gate by tool+command pattern only —
there is no concept of "only agent X may run this." So CLAUDE.md rules 5/6 (git
commit/push is `deploy-manager`-only) are enforced by each agent's own `## Forbidden`
prose, not by a technical permission gate: any agent with the `Bash` tool can
technically invoke `git commit`/`git push` (both are in the global `allow` list, needed
so `deploy-manager` isn't interactively prompted on every push per rule 6). Treat this as
an accepted tradeoff of the current harness, not a bug to silently "fix" by removing
those commands from `allow` — doing so would just make `deploy-manager` prompt on every
push, which rule 6 explicitly says not to do. If this ever needs real enforcement, it
requires a `PreToolUse` hook that can identify the calling agent, not a settings.json edit.
