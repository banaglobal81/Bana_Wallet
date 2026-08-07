#!/usr/bin/env bash
# PreToolUse hook (matcher: Bash). Enforces two CLAUDE.md boundaries that
# .claude/settings.json permission rules cannot express, because allow/deny there
# is keyed by command pattern only — not by which agent is calling. Subagent Bash
# calls carry an `agent_type` field in the hook stdin payload (main-thread calls
# do not); that's the only place caller identity is available, so this hook is the
# only real enforcement point.
#
# 1) CLAUDE.md rules 5/6: git commit/add/push is deploy-manager-only.
# 2) Review/detect-only agents (no Edit/Write in their tools:) must not use Bash to
#    route around that — wallet-security-expert, code-compliance-checker, routine-tasks.
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

# Review/detect-only agents: Bash is for read-only inspection, never for writing files
case "$agent" in
  wallet-security-expert|code-compliance-checker|routine-tasks)
    if echo "$cmd" | grep -qE '(^|[;&|]\s*)(sed\s+-i|mv|cp|rm|mkdir|touch|tee)\b|(^|[^0-9])>{1,2}(\s|$)'; then
      deny "$agent is review/detect-only — Bash may not write, move, or delete files (CLAUDE.md § Forbidden)."
    fi
    ;;
esac

exit 0
