#!/usr/bin/env bash
# PreToolUse hook (matcher: Bash). Enforces two CLAUDE.md boundaries that
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
#    Redeploy/restart also needs a live user confirmation within deploy-manager's own
#    turn — this hook can't see conversation state, so it only enforces the caller-identity
#    half; the confirmation half is convention enforced by deploy-manager.md itself.
set -uo pipefail

input="$(cat)"
cmd="$(echo "$input" | jq -r '.tool_input.command // ""')"
agent="$(echo "$input" | jq -r '.agent_type // "main"')"

deny() {
  jq -n --arg reason "$1" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$reason}}'
  exit 0
}

# Rule 5/6
if echo "$cmd" | grep -qE '(^|[;&|]\s*)git\s+(commit|push|add)\b' && [ "$agent" != "deploy-manager" ]; then
  deny "CLAUDE.md rule 5/6: git commit/add/push is deploy-manager-only (caller: $agent)."
fi

# Rule 6 (Railway control)
if echo "$cmd" | grep -qE '(^|[;&|]\s*)railway\b' && [ "$agent" != "deploy-manager" ]; then
  deny "CLAUDE.md rule 6: Railway control (status/logs/redeploy/restart) is deploy-manager-only (caller: $agent)."
fi

# Review/detect-only agents: Bash is for read-only inspection, never for writing files.
# This is a text-pattern heuristic, not a shell-aware parser (documented in
# docs/architecture/harness.md) — it covers the obvious write vectors: direct
# redirects/file-editing commands, general-purpose script interpreters (none of
# these agents' documented tasks need one — grep/read/tsc/npm test cover it all),
# and network-download-to-file.
case "$agent" in
  wallet-security-expert|code-compliance-checker|routine-tasks|deploy-manager)
    write_pattern='(^|[;&|]\s*)(sed\s+-i|mv|cp|rm|mkdir|touch|tee|dd|install|truncate|xargs)\b'
    write_pattern+='|(^|[^0-9])>{1,2}\|?(\s|$)'
    write_pattern+='|(^|[;&|]\s*)(python3?|node|ruby|perl|osascript|php)\b'
    write_pattern+='|(^|[;&|]\s*)(curl|wget)\b[^;&|]*(-o\b|--output\b|-O\b)'
    if echo "$cmd" | grep -qE "$write_pattern"; then
      deny "$agent is review/detect-only — Bash may not write, move, or delete files, run a general-purpose script interpreter, or download to a file (CLAUDE.md § Forbidden)."
    fi
    ;;
esac

exit 0
