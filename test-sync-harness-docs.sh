#!/usr/bin/env bash
# Self-test for sync-harness-docs.sh: proves the drift checker actually fires on
# known-bad states, not just that it stays quiet on the real (already-healthy) repo.
# Builds a synthetic minimal-but-healthy fixture tree in a scratch temp dir, runs
# sync-harness-docs.sh against it (0 drift expected), then applies one mutation at a
# time and asserts the specific WARN line appears. Rebuilds the fixture from scratch
# for every case so mutations never leak between tests.
#
# Run: bash test-sync-harness-docs.sh
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$ROOT/sync-harness-docs.sh"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

PASS=0
FAIL=0

# Builds a complete, healthy fixture under $1 satisfying every check in
# sync-harness-docs.sh with two fake agents (agent-alpha/sonnet, agent-beta/haiku).
build_healthy() {
  local d="$1" r doc
  rm -rf "$d"
  mkdir -p "$d"/.claude/agents "$d"/.claude/hooks "$d"/docs/architecture "$d"/docs/patterns
  mkdir -p "$d"/web/src/lib/nia "$d"/web/src/app/api "$d"/web/src/utils "$d"/web/tests/harness "$d"/web/server/core
  mkdir -p "$d"/web/src/app/'[locale]' "$d"/web/src/i18n "$d"/web/messages
  mkdir -p "$d"/web/src/app/api/admin/settlement "$d"/web/src/components
  mkdir -p "$d"/worker

  cat > "$d/CLAUDE.md" <<'EOF'
# CLAUDE.md fixture

worker/ is documented here.

| # | Agent | model | Scope | Status |
|---|-------|-------|-------|--------|
| 1 | agent-alpha | sonnet | fixture scope | active |
| 2 | agent-beta | haiku | fixture scope | active |
EOF

  local pair agent_name agent_model
  for pair in "agent-alpha:sonnet" "agent-beta:haiku"; do
    agent_name="${pair%%:*}"; agent_model="${pair##*:}"
    cat > "$d/.claude/agents/$agent_name.md" <<EOF
---
name: $agent_name
model: $agent_model
---
Fixture agent. See docs/patterns/$agent_name.md.

### Self-Update Protocol
See CLAUDE.md.
EOF
    : > "$d/docs/patterns/$agent_name.md"
  done

  echo '{"scripts":{"dev":"next dev"}}' > "$d/web/package.json"
  : > "$d/web/src/utils/niaApi.ts"
  : > "$d/web/server/core/nia-signing.js"
  : > "$d/worker/trigger.mjs"

  for r in address balance deposits withdrawals transfer orders trades markets klines wallet-history notifications status webhook; do
    mkdir -p "$d/web/src/app/api/nia/$r"
    : > "$d/web/src/app/api/nia/$r/route.ts"
  done

  cat > "$d/web/vitest.config.ts" <<'EOF'
export default { test: { include: ["src/**/*.test.ts", "tests/harness/**/*.test.js"] } }
EOF

  for doc in code-tree.md nia-integration.md harness.md worker.md deploy.md; do
    : > "$d/docs/architecture/$doc"
  done

  : > "$d/web/messages/en.json"
  : > "$d/web/src/components/Settings.tsx"

  cp "$ROOT/.claude/hooks/enforce-agent-boundaries.sh" "$d/.claude/hooks/enforce-agent-boundaries.sh"
  cp "$ROOT/.claude/hooks/test-enforce-agent-boundaries.sh" "$d/.claude/hooks/test-enforce-agent-boundaries.sh"
  chmod +x "$d/.claude/hooks/enforce-agent-boundaries.sh" "$d/.claude/hooks/test-enforce-agent-boundaries.sh"
  echo '{"hooks":{"PreToolUse":[{"matcher":"Bash","hooks":[{"type":"command","command":"bash .claude/hooks/enforce-agent-boundaries.sh"}]}]}}' > "$d/.claude/settings.json"

  cp "$SCRIPT" "$d/sync-harness-docs.sh"
  chmod +x "$d/sync-harness-docs.sh"
}

# args: name, mutator-fn, expected-substring-in-output ("" means expect 0 drift)
case_() {
  local name="$1" mutator="$2" expect="$3"
  local d="$WORK/case"
  build_healthy "$d"
  "$mutator" "$d"
  local out drift
  out=$(cd "$d" && bash ./sync-harness-docs.sh 2>&1)
  drift=$(echo "$out" | grep -c '^WARN drift:')
  if [ -z "$expect" ]; then
    if [ "$drift" -eq 0 ]; then PASS=$((PASS+1)); printf 'ok   %s\n' "$name"
    else FAIL=$((FAIL+1)); printf 'FAIL %-55s expected 0 drift, got %s\n%s\n' "$name" "$drift" "$out"; fi
  else
    if echo "$out" | grep -qF "$expect"; then PASS=$((PASS+1)); printf 'ok   %s\n' "$name"
    else FAIL=$((FAIL+1)); printf 'FAIL %-55s expected substring not found: %s\n' "$name" "$expect"; fi
  fi
}

noop() { :; }
mut_agent_count()        { : > "$1/.claude/agents/agent-gamma.md"; }
mut_missing_path()       { rm -rf "$1/web/src/lib/nia"; }
mut_obsolete_file()      { : > "$1/web/server.js"; }
mut_missing_protocol()   { printf -- '---\nname: agent-alpha\nmodel: sonnet\n---\nno protocol section\n' > "$1/.claude/agents/agent-alpha.md"; }
mut_dangling_pattern()   { rm -f "$1/docs/patterns/agent-alpha.md"; }
mut_route_count()        { rm -rf "$1/web/src/app/api/nia/webhook"; }
mut_missing_arch_doc()   { rm -f "$1/docs/architecture/worker.md"; }
mut_model_mismatch()     { sed -i.bak 's/model: sonnet/model: haiku/' "$1/.claude/agents/agent-alpha.md"; }
mut_opus_misuse()        {
  sed -i.bak 's/| agent-beta | haiku |/| agent-beta | opus |/' "$1/CLAUDE.md"
  sed -i.bak 's/model: haiku/model: opus/' "$1/.claude/agents/agent-beta.md"
}
mut_settlement_under_nia() { mkdir -p "$1/web/src/app/api/nia/settlement"; }
mut_missing_settings_tsx() { rm -f "$1/web/src/components/Settings.tsx"; }
mut_hook_missing()         { rm -f "$1/.claude/hooks/enforce-agent-boundaries.sh"; }
mut_hook_not_wired()       { echo '{}' > "$1/.claude/settings.json"; }
mut_hook_tests_missing()   { rm -f "$1/.claude/hooks/test-enforce-agent-boundaries.sh"; }

echo "== sync-harness-docs.sh self-test =="
case_ "healthy fixture: 0 drift"                 noop                       ""
case_ "agent count mismatch flagged"             mut_agent_count            "CLAUDE.md team table rows"
case_ "missing key path flagged"                 mut_missing_path           "path missing: web/src/lib/nia"
case_ "obsolete file flagged"                    mut_obsolete_file          "obsolete file still present"
case_ "missing Self-Update Protocol flagged"     mut_missing_protocol       "missing Self-Update Protocol"
case_ "dangling docs/patterns reference flagged" mut_dangling_pattern       "does not exist"
case_ "route handler count mismatch flagged"     mut_route_count            "Nia-Hub route handlers: found 12, expected 13"
case_ "missing architecture doc flagged"         mut_missing_arch_doc       "docs/architecture/worker.md missing"
case_ "model tier mismatch flagged"              mut_model_mismatch         "model tier mismatch: agent-alpha"
case_ "opus misuse flagged (rule 9)"             mut_opus_misuse            "rule 9 reserves opus"
case_ "settlement-under-nia guard flagged"       mut_settlement_under_nia   "settlement routes should live under api/admin/"
case_ "missing Settings.tsx flagged"             mut_missing_settings_tsx   "web/src/components/Settings.tsx missing"
case_ "hook missing flagged"                     mut_hook_missing           "no technical enforcement"
case_ "hook not wired into settings.json flagged" mut_hook_not_wired        "hook is not wired up"
case_ "hook regression suite missing flagged"    mut_hook_tests_missing     "no regression coverage"

echo "== $PASS passed, $FAIL failed =="
[ "$FAIL" -eq 0 ]
