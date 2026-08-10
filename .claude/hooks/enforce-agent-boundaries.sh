#!/usr/bin/env bash
# PreToolUse hook (matcher: Bash). Enforces CLAUDE.md boundaries that
# .claude/settings.json permission rules cannot express, because allow/deny there
# is keyed by command pattern only — not by which agent is calling. Subagent Bash
# calls carry an `agent_type` field in the hook stdin payload (main-thread calls
# do not); that's the only place caller identity is available, so this hook is the
# only real enforcement point.
#
# 1) CLAUDE.md rules 5/6: git commit/add/push is deploy-manager-only.
# 2) Review/detect/ops-only agents (no Edit/Write in their tools:) must not use Bash to
#    route around that — wallet-security-expert, code-compliance-checker, routine-tasks,
#    deploy-manager (deploy-manager's job is git/Railway CLI calls, not file edits).
# 3) CLAUDE.md rule 6 (Railway control): any `railway` CLI invocation is deploy-manager-only.
#    Read-only verbs (status/logs/whoami/help) auto-allow; anything else (redeploy/restart/up/
#    down/variables/service/...) forces a live "ask" permission prompt — see rule 3b below.
# 4) CLAUDE.md rule 5 (QA gate): deploy-manager's `git commit` requires a fresh
#    .claude/.qa-passed marker (written by qa-lead after a passing run); missing it
#    forces an "ask" rather than a hard deny. Single-use — consumed on every commit.
#
# Detection strategy (documented, not a real shell parser — substring/regex only):
# a command is flagged if the restricted token is EITHER (a) anchored — the actual
# leading word of the whole command (optionally after leading whitespace), of a
# segment after `;`/`&`/`|`, inside a subshell/command-substitution opener
# (backtick or `$(`), or right after a `then`/`do`/`else`/`elif` keyword (grep's `^`
# also anchors per-line, so newline-joined commands are covered for free) — OR (b) a
# known wrapper keyword (`eval`, `xargs`, `env`, `exec`, `nohup`, `sudo`, `timeout`,
# `sh -c`, `bash -c`, `zsh -c`) is anchored in the same command AND the token appears
# anywhere in it. (b) exists specifically to catch `eval "git commit -m x"` / `sh -c
# "git push"` / `xargs git commit` — bypasses that (a) alone misses because the token
# isn't the command's literal first word there.
#
# This two-tier design replaced a first attempt that just matched the token ANYWHERE,
# unconditionally — that broke ordinary, frequent operations for multiple agents:
# `grep -rn "git commit" docs/` (routine for doc-keeper/code-compliance-checker, whose
# job is searching this repo's docs — CLAUDE.md itself contains the phrases "git
# commit" and "railway" repeatedly) and `git commit -m "chore: install dep, mv
# config"` (an ordinary deploy-manager commit message — "install"/"mv" as English
# words, not commands) were both false-denied. Gating the unanchored match behind a
# real wrapper-keyword invocation keeps the wrapper-bypass coverage while excluding
# plain search/argument text.
#
# Trade-off accepted knowingly: this reopens a narrower gap than the false-positive it
# fixes — `\git commit -m x` (backslash is a shell no-op, git still runs) is neither
# anchored nor wrapper-invoked, so it's allowed. Closing it without reintroducing the
# grep/commit-message false positives needs actual shell tokenization, not regex — out
# of scope here; the false positives were the worse failure mode (constant, on routine
# ops) versus this one (rare, requires deliberately atypical syntax). See
# .claude/hooks/test-enforce-agent-boundaries.sh for both the bypasses this catches
# and the residual gaps it knowingly still lets through.
set -uo pipefail

input="$(cat)"
cmd="$(echo "$input" | jq -r '.tool_input.command // ""')"
agent="$(echo "$input" | jq -r '.agent_type // "main"')"

deny() {
  jq -n --arg reason "$1" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$reason}}'
  exit 0
}

ask() {
  jq -n --arg reason "$1" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"ask",permissionDecisionReason:$reason}}'
  exit 0
}

# Command-position anchor: start of string (leading whitespace tolerated), after a
# `;`/`&`/`|` segment separator, inside a subshell/substitution opener (backtick or
# `$(`), or right after a `then`/`do`/`else`/`elif` keyword.
ANCHOR='(^[[:space:]]*|[;&|][[:space:]]*|`|\$\(|\b(then|do|else|elif)[[:space:]]+)'

WRAPPER_ANCHORED="${ANCHOR}(eval|xargs|env|exec|nohup|sudo|timeout)\\b|${ANCHOR}(sh|bash|zsh)\\s+-c\\b"
has_wrapper() { echo "$cmd" | grep -qE "$WRAPPER_ANCHORED"; }

# anchored(token_anchored_regex, token_bare_regex) -> 0 if flagged
flagged() {
  echo "$cmd" | grep -qE "$1" && return 0
  has_wrapper && echo "$cmd" | grep -qE "$2" && return 0
  return 1
}

# Rule 5/6
if flagged "${ANCHOR}git\\s+(commit|push|add)\\b" '\bgit\s+(commit|push|add)\b' \
   && [ "$agent" != "deploy-manager" ]; then
  deny "CLAUDE.md rule 5/6: git commit/add/push is deploy-manager-only (caller: $agent)."
fi

# Rule 5 (QA sign-off gate): qa-lead.md says "only on pass, call deploy-manager" and
# deploy-manager.md's Forbidden list already says "committing when tests have not
# passed" — this makes that convention machine-checked instead of relying purely on
# agents reading their own instructions. Same reasoning as the Railway ask-gate below:
# the hook can't see conversation state, so it can't confirm qa-lead actually ran this
# session. Instead of a hard deny (which would brick doc-only/config commits with no
# way to self-certify), it looks for evidence — a marker file qa-lead writes after a
# passing run — and falls back to a live "ask" when that evidence is missing, so a
# human sees it before an unverified commit lands either way.
if flagged "${ANCHOR}git\\s+commit\\b" '\bgit\s+commit\b' && [ "$agent" = "deploy-manager" ]; then
  qa_root="$(git rev-parse --show-toplevel 2>/dev/null || echo "$PWD")"
  qa_marker="$qa_root/.claude/.qa-passed"
  if [ -f "$qa_marker" ]; then
    # Single-use: consumed the moment it clears a commit through, so the next commit
    # needs a fresh qa-lead pass rather than reusing stale sign-off.
    rm -f "$qa_marker"
  else
    ask "CLAUDE.md rule 5 (QA gate): no qa-lead sign-off found (.claude/.qa-passed missing) for this commit — confirm you want to proceed without a fresh QA pass, or have qa-lead run tests and sign off first."
  fi
fi

# Rule 6 (Railway control)
if flagged "${ANCHOR}railway\\b" '\brailway\b'; then
  # 3a) Env var/secret changes and service create/delete are human-only — deny
  # unconditionally, even for deploy-manager, even with confirmation. Checked before
  # the caller check below so the reason surfaced is the more specific one.
  if echo "$cmd" | grep -qE '\brailway\s+(variables|environment|env)\s+(set|delete|remove|unset|add)\b|\brailway\s+service\s+(create|delete|remove|new)\b|\brailway\s+(add|remove)\b'; then
    deny "CLAUDE.md rule 6: env var/secret changes and creating/deleting Railway services are human-only — no agent, including deploy-manager, may perform them regardless of confirmation (caller: $agent)."
  fi
  if [ "$agent" != "deploy-manager" ]; then
    deny "CLAUDE.md rule 6: Railway control (status/logs/redeploy/restart) is deploy-manager-only (caller: $agent)."
  fi
  # 3b) Even for deploy-manager: read-only verbs auto-allow, everything else (redeploy/
  # restart/up/down/link/run/...) forces a live confirmation prompt. This makes
  # CLAUDE.md rule 6's "redeploy/restart needs explicit user confirmation first"
  # technically enforced instead of resting purely on deploy-manager.md convention —
  # the hook cannot see conversation state to check whether confirmation already
  # happened, so it asks every time a non-read-only verb is invoked, by design.
  if ! echo "$cmd" | grep -qE '\brailway\s+(status|logs|whoami|list|help|--help|-h)\b'; then
    ask "CLAUDE.md rule 6: this Railway command is not on the read-only allowlist (status/logs/whoami/list/help) — confirm before deploy-manager runs it, since it may affect live traffic."
  fi
fi

# Review/detect-only agents: Bash is for read-only inspection, never for writing files.
# Same two-tier (anchored, or wrapper-gated) strategy as above — anchored alone would
# miss `bash -c "sed -i ... "`; unconditionally unanchored would false-trigger on
# deploy-manager's own commit-message text (see header comment).
case "$agent" in
  wallet-security-expert|code-compliance-checker|routine-tasks|deploy-manager)
    # Strip whitespace-free angle-bracket tokens (`<user@host>` trailers like
    # `Co-Authored-By: Name <noreply@anthropic.com>`, URLs, HTML-ish tags) before the
    # redirect-operator check below. Without this, a commit message's closing `>` at
    # end-of-line false-flags as a shell redirect and denies every ordinary
    # deploy-manager commit that carries the mandated Co-Authored-By trailer.
    cmd_noangle="$(printf '%s' "$cmd" | sed -E 's/<[^[:space:]<>]*>//g')"
    write_anchored="${ANCHOR}(sed\\s+-i|mv|cp|rm|mkdir|touch|tee|dd|install|truncate|xargs)\\b"
    write_anchored+='|(^|[^0-9])>{1,2}\|?(\s|$)'
    write_anchored+="|${ANCHOR}(python3?|node|ruby|perl|osascript|php)\\b"
    write_anchored+="|${ANCHOR}(curl|wget)\\b[^;&|]*(-o\\b|--output\\b|-O\\b)"
    write_bare='\b(sed\s+-i|mv|cp|rm|mkdir|touch|tee|dd|install|truncate|xargs)\b'
    write_bare+='|>{1,2}'
    write_bare+='|\b(python3?|node|ruby|perl|osascript|php)\b'
    write_bare+='|\b(curl|wget)\b.*(-o\b|--output\b|-O\b)'
    flagged_noangle() {
      echo "$cmd_noangle" | grep -qE "$1" && return 0
      has_wrapper && echo "$cmd_noangle" | grep -qE "$2" && return 0
      return 1
    }
    if flagged_noangle "$write_anchored" "$write_bare"; then
      deny "$agent is review/detect-only — Bash may not write, move, or delete files, run a general-purpose script interpreter, or download to a file (CLAUDE.md § Forbidden)."
    fi
    ;;
esac

exit 0
