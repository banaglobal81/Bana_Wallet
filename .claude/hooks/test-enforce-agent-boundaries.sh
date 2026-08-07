#!/usr/bin/env bash
# Regression + bypass-attempt suite for enforce-agent-boundaries.sh.
# Run: bash .claude/hooks/test-enforce-agent-boundaries.sh
#
# Each case feeds a synthetic PreToolUse payload to the hook and asserts the
# resulting permissionDecision. "known-gap" cases are NOT bugs to fix — they
# document bypass techniques the hook's regex approach cannot catch (see the
# "Known limitation" comment at the top of enforce-agent-boundaries.sh) so a
# future reader doesn't mistake a silent bypass for an accident.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
HOOK="$ROOT/.claude/hooks/enforce-agent-boundaries.sh"

PASS=0
FAIL=0

# args: name, agent, command, expected("allow"|"deny"|"ask")
case_() {
  local name="$1" agent="$2" cmd="$3" expected="$4"
  local payload decision
  payload=$(jq -n --arg c "$cmd" --arg a "$agent" '{tool_input:{command:$c},agent_type:$a}')
  local out
  out=$(printf '%s' "$payload" | bash "$HOOK")
  if [ -z "$out" ]; then
    decision="allow"
  else
    decision=$(printf '%s' "$out" | jq -r '.hookSpecificOutput.permissionDecision // "allow"')
  fi
  if [ "$decision" = "$expected" ]; then
    PASS=$((PASS+1))
    printf 'ok   %-58s [%s]\n' "$name" "$decision"
  else
    FAIL=$((FAIL+1))
    printf 'FAIL %-58s expected=%s got=%s\n' "$name" "$expected" "$decision"
  fi
}

echo "== enforce-agent-boundaries.sh regression suite =="
echo "-- baseline: legitimate calls stay allowed --"
case_ "deploy-manager: git commit"                 deploy-manager 'git commit -m "x"'              allow
case_ "deploy-manager: git push"                   deploy-manager 'git push origin main'            allow
case_ "deploy-manager: git add"                     deploy-manager 'git add web/src/foo.ts'          allow
case_ "deploy-manager: railway status (read-only)"  deploy-manager 'railway status'                  allow
case_ "deploy-manager: railway logs (read-only)"    deploy-manager 'railway logs'                    allow
case_ "deploy-manager: railway whoami (read-only)"  deploy-manager 'railway whoami'                  allow
case_ "routine-tasks: grep is fine"                 routine-tasks  'grep -r foo web/src'              allow
case_ "code-compliance-checker: curl no -o is fine" code-compliance-checker 'curl https://x.com'      allow
case_ "any agent: git status is fine (not commit/push/add)" web-wallet-expert 'git status'            allow

echo "-- rule 5/6: git commit/add/push blocked for non-deploy-manager --"
case_ "main: git commit blocked"                    main           'git commit -m "x"'               deny
case_ "main: git push blocked"                      main           'git push origin main'            deny
case_ "main: git add blocked"                       main           'git add file.ts'                 deny
case_ "web-wallet-expert: git commit blocked"       web-wallet-expert 'git commit -m "x"'             deny

echo "-- rule 6: railway blocked for non-deploy-manager --"
case_ "main: railway status blocked (wrong caller)" main           'railway status'                  deny
case_ "qa-lead: railway logs blocked"                qa-lead        'railway logs'                    deny

echo "-- rule 6b: railway state-changing verbs force 'ask' even for deploy-manager --"
case_ "deploy-manager: railway redeploy asks"        deploy-manager 'railway redeploy'                 ask
case_ "deploy-manager: railway restart asks"         deploy-manager 'railway restart'                  ask
case_ "deploy-manager: railway up asks"              deploy-manager 'railway up'                       ask
case_ "deploy-manager: railway variables set asks"   deploy-manager 'railway variables set FOO=bar'    ask
case_ "deploy-manager: railway service delete asks"  deploy-manager 'railway service delete'           ask

echo "-- review-only agents: Bash write-vector boundary --"
case_ "routine-tasks: sed -i blocked"                routine-tasks  'sed -i "" "s/a/b/" file.ts'       deny
case_ "wallet-security-expert: rm blocked"           wallet-security-expert 'rm file.ts'               deny
case_ "code-compliance-checker: curl -o blocked"     code-compliance-checker 'curl -o out.txt https://x.com' deny
case_ "deploy-manager: mv blocked (git/railway only)" deploy-manager 'mv a.ts b.ts'                    deny
case_ "routine-tasks: node script blocked"           routine-tasks  'node script.js'                   deny

echo "-- hardening: wrapper-command bypass attempts now caught --"
case_ "eval wrapper no longer bypasses git block"    web-wallet-expert 'eval "git commit -m x"'        deny
case_ "sh -c wrapper no longer bypasses git block"   web-wallet-expert 'sh -c "git push"'               deny
case_ "xargs wrapper no longer bypasses git block"   web-wallet-expert 'echo x | xargs git commit -m'   deny
case_ "newline-joined command no longer bypasses"    web-wallet-expert "$(printf 'echo hi\ngit commit -m x')" deny
case_ "railway via eval no longer bypasses"          web-wallet-expert 'eval "railway redeploy"'        deny
case_ "sed -i via bash -c no longer bypasses"        routine-tasks  'bash -c "sed -i \"\" s/a/b/ f"'    deny

echo "-- known gaps: literal-token obfuscation still bypasses (regex, not a parser) --"
case_ "backslash-escaped git is still caught (no-op to shell, substring intact)" web-wallet-expert '\git commit -m x' deny
case_ "KNOWN GAP: quoted git bypasses (quote breaks \\s+ adjacency)" web-wallet-expert '"git" commit -m x' allow

echo "== $PASS passed, $FAIL failed =="
[ "$FAIL" -eq 0 ]
