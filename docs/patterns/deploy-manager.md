# Pattern Library — deploy-manager

Read on demand by `deploy-manager` only, when the current task's scope overlaps an entry below. See `CLAUDE.md` § Agent Self-Update Protocol for edit rules.

### GitHub CLI account mismatch during push (2026-08-09) — critical incident
- **Scenario:** `deploy-manager` committed staking page redesign with correct authorship (`git config user.name=banaglobal81`, `git config user.email=banaglobal81@users.noreply.github.com`). Push immediately rejected: HTTP 403.
- **Root cause:** Multiple GitHub accounts were logged into the same `gh` CLI (`linetrader`, `mentor7lee-ai`, `banaglobal81`). The active account was `linetrader`. When pushing over HTTPS, `git` uses `gh auth git-credential`, which returns the **active account's token**. Since the repo is owned by `banaglobal81`, the push was rejected by GitHub.
- **Critical insight:** `git config user.name/email` controls **commit authorship metadata** only — it has **no effect on push authentication**. Push auth is driven by whichever account is active in `gh auth status`. This is a separate concern from authorship.
- **Resolution:** `gh auth switch --hostname github.com --user banaglobal81` → `gh auth status` confirmed new active account → `git push` succeeded.
- **Mitigation:** Before every `git push`, run:
  1. `git remote -v` — confirm origin is the intended repo owner (BANA = `banaglobal81/Bana_Wallet`)
  2. `gh auth status` — **mandatory check** — confirm active GitHub account matches the repo owner
  3. If mismatch: `gh auth switch --hostname github.com --user <correct-account>`
  4. Re-verify with `gh auth status`
  5. Only then proceed with `git push`
  - This check must run **before every push**, not once. Multiple accounts can be logged in, and the active one can change between sessions.
  - Procedure is documented in `docs/architecture/deploy.md` § Pre-push account verification and enforced in `deploy-manager.md` § Push authority.
