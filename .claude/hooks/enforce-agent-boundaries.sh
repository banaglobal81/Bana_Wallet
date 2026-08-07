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
#
# Known limitation (documented, not silently assumed away): detection below is
# substring/regex matching, not a real shell parser. It closes the "wrapper" bypass
# class (eval '...', bash -c '...', xargs, newline-separated commands, quoted outer
# commands) by matching the git/railway token anywhere in the string rather than only
# at the start of a `;`/`&`/`|` segment. It does NOT and cannot catch bypasses that
# break up the literal "git commit"/"git push"/"git add" substring itself — `"git"
# commit` (quote breaks the \s+ adjacency), `g\it commit`, a renamed/symlinked git
# binary, or a command built up via string concatenation/variable expansion at
# runtime. (`\git commit` is NOT such a bypass — the backslash is a no-op to the
# shell and the literal substring "git commit" is still there, so this hook still
# catches it; verified in the test suite below.) Closing the remaining gap
# requires actual shell tokenization, not a regex — out of scope here. See
# .claude/hooks/test-enforce-agent-boundaries.sh for the regression suite covering
# both what this hook catches and what it knowingly still lets through.
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

# Rule 5/6 — matched anywhere in the command (not anchored to start/operator) so
# `eval "git commit -m x"`, `sh -c 'git push'`, `xargs git add`, and newline-joined
# commands are all caught, not just `git ...` as the literal first token.
if echo "$cmd" | grep -qE '\bgit\s+(commit|push|add)\b' && [ "$agent" != "deploy-manager" ]; then
  deny "CLAUDE.md rule 5/6: git commit/add/push is deploy-manager-only (caller: $agent)."
fi

# Rule 6 (Railway control)
if echo "$cmd" | grep -qE '\brailway\b'; then
  if [ "$agent" != "deploy-manager" ]; then
    deny "CLAUDE.md rule 6: Railway control (status/logs/redeploy/restart) is deploy-manager-only (caller: $agent)."
  fi
  # 3b) Even for deploy-manager: read-only verbs auto-allow, everything else (redeploy/
  # restart/up/down/variables/service/link/run/...) forces a live confirmation prompt.
  # This makes CLAUDE.md rule 6's "redeploy/restart needs explicit user confirmation
  # first" technically enforced instead of resting purely on deploy-manager.md convention
  # — the hook cannot see conversation state to check whether confirmation already
  # happened, so it asks every time a non-read-only verb is invoked, by design.
  if ! echo "$cmd" | grep -qE '\brailway\s+(status|logs|whoami|list|help|--help|-h)\b'; then
    ask "CLAUDE.md rule 6: this Railway command is not on the read-only allowlist (status/logs/whoami/list/help) — confirm before deploy-manager runs it, since it may affect live traffic."
  fi
fi

# Review/detect-only agents: Bash is for read-only inspection, never for writing files.
# This is a text-pattern heuristic, not a shell-aware parser (documented in
# docs/architecture/harness.md) — it covers the obvious write vectors: direct
# redirects/file-editing commands, general-purpose script interpreters (none of
# these agents' documented tasks need one — grep/read/tsc/npm test cover it all),
# and network-download-to-file. Matched anywhere in the command for the same reason
# as the git/railway checks above (wrapper-command bypass resistance).
case "$agent" in
  wallet-security-expert|code-compliance-checker|routine-tasks|deploy-manager)
    write_pattern='\b(sed\s+-i|mv|cp|rm|mkdir|touch|tee|dd|install|truncate|xargs)\b'
    write_pattern+='|(^|[^0-9])>{1,2}\|?(\s|$)'
    write_pattern+='|\b(python3?|node|ruby|perl|osascript|php)\b'
    write_pattern+='|\b(curl|wget)\b[^;&|]*(-o\b|--output\b|-O\b)'
    if echo "$cmd" | grep -qE "$write_pattern"; then
      deny "$agent is review/detect-only — Bash may not write, move, or delete files, run a general-purpose script interpreter, or download to a file (CLAUDE.md § Forbidden)."
    fi
    ;;
esac

exit 0
