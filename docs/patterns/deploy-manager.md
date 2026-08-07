# Pattern Library — deploy-manager

Read on demand by `deploy-manager` only, when the current task's scope overlaps an entry below. See `CLAUDE.md` § Agent Self-Update Protocol for edit rules.

### Pre-push account verification (2026-08-07)
- BANA Wallet dev environments use multi-account tooling: `git` and `railway` CLI can be logged into different accounts independently. This creates a risk: if git is logged in under a personal account, `git push` will attribute commits to that account instead of the BANA account, even if the code is correct. Blindly pushing without verification broke BANA's git history and audit trail.
- **Mitigation:** Before every `git push`, run `git config user.name` and `git config user.email` and verify they match the BANA account (`banaglobal81` / `banaglobal81@users.noreply.github.com`). If they don't match or are unset, **stop and flag to the user** — never auto-switch credentials or guess the intended account. This check is mandatory and enforced in the "Push authority" section of `deploy-manager.md`.
