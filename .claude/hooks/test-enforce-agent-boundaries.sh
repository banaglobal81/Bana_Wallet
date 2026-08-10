#!/usr/bin/env bash
# Regression + bypass-attempt suite for enforce-agent-boundaries.sh.
# Run: bash .claude/hooks/test-enforce-agent-boundaries.sh
#
# Each case feeds a synthetic PreToolUse payload to the hook and asserts the
# resulting permissionDecision. "known-gap" cases are NOT bugs to fix — they
# document bypass techniques the hook's regex approach cannot catch (see the
# header comment in enforce-agent-boundaries.sh) so a future reader doesn't
# mistake a silent bypass for an accident. IMPORTANT for anyone editing this
# file: pass the git/railway/write tokens through jq -n --arg (as case_
# already does), never inline them literally into a Bash tool command run by
# whatever is driving these tests — the hook applies to that outer command too.
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
QA_MARKER="$ROOT/.claude/.qa-passed"
rm -f "$QA_MARKER"

echo "-- baseline: legitimate calls stay allowed --"
touch "$QA_MARKER"
case_ "deploy-manager: git commit (with QA marker present)" deploy-manager 'git commit -m "x"'     allow
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

echo "-- rule 5 QA gate: deploy-manager git commit needs a fresh qa-lead sign-off marker --"
rm -f "$QA_MARKER"
case_ "deploy-manager: commit with no QA marker asks" deploy-manager 'git commit -m "x"'              ask
touch "$QA_MARKER"
case_ "deploy-manager: commit with QA marker present is allowed" deploy-manager 'git commit -m "x"'   allow
case_ "deploy-manager: QA marker is single-use — next commit asks again" deploy-manager 'git commit -m "x"' ask
rm -f "$QA_MARKER"

echo "-- rule 6: railway blocked for non-deploy-manager --"
case_ "main: railway status blocked (wrong caller)" main           'railway status'                  deny
case_ "qa-lead: railway logs blocked"                qa-lead        'railway logs'                    deny

echo "-- rule 6b: railway redeploy/restart/up force 'ask' even for deploy-manager --"
case_ "deploy-manager: railway redeploy asks"        deploy-manager 'railway redeploy'                 ask
case_ "deploy-manager: railway restart asks"         deploy-manager 'railway restart'                  ask
case_ "deploy-manager: railway up asks"              deploy-manager 'railway up'                       ask

echo "-- rule 6a: env-var/secret changes and service create/delete are human-only — deny even for deploy-manager --"
case_ "deploy-manager: railway variables set denied"  deploy-manager 'railway variables set FOO=bar'    deny
case_ "deploy-manager: railway variables delete denied" deploy-manager 'railway variables delete FOO'   deny
case_ "deploy-manager: railway service delete denied" deploy-manager 'railway service delete'           deny
case_ "deploy-manager: railway service create denied" deploy-manager 'railway service create'           deny
case_ "deploy-manager: railway variables get (read) still asks, not denied" deploy-manager 'railway variables get FOO' ask

echo "-- review-only agents: Bash write-vector boundary --"
case_ "routine-tasks: sed -i blocked"                routine-tasks  'sed -i "" "s/a/b/" file.ts'       deny
case_ "wallet-security-expert: rm blocked"           wallet-security-expert 'rm file.ts'               deny
case_ "code-compliance-checker: curl -o blocked"     code-compliance-checker 'curl -o out.txt https://x.com' deny
case_ "deploy-manager: mv blocked (git/railway only)" deploy-manager 'mv a.ts b.ts'                    deny
case_ "routine-tasks: node script blocked"           routine-tasks  'node script.js'                   deny

echo "-- hardening: leading-whitespace/subshell bypass attempts caught (regression from prior anchor gap) --"
case_ "leading-space git commit no longer bypasses"  web-wallet-expert ' git commit -m "x"'            deny
case_ "leading-tab git push no longer bypasses"      web-wallet-expert "$(printf '\tgit push origin main')" deny
case_ "leading-space rm no longer bypasses (write-vector)" routine-tasks ' rm file.ts'                 deny
case_ "backtick subshell git commit caught"          web-wallet-expert '`git commit -m x`'              deny
case_ "\$() subshell git commit caught"              web-wallet-expert 'result=$(git commit -m x)'      deny
case_ "then-keyword git commit caught"               web-wallet-expert 'true && then git commit -m x'   deny
case_ "leading-space railway redeploy still routed through gate" deploy-manager ' railway redeploy'     ask

echo "-- new agents (game-planner/game-designer/game-developer): boundaries apply automatically --"
case_ "game-developer: git commit blocked (deploy-manager-only)" game-developer 'git commit -m "x"'    deny
case_ "game-developer: git push blocked"             game-developer 'git push origin main'             deny
case_ "game-developer: railway blocked (wrong caller)" game-developer 'railway status'                 deny
case_ "game-designer: git commit blocked (deploy-manager-only)" game-designer 'git commit -m "x"'      deny
case_ "game-designer: railway blocked (wrong caller)" game-designer 'railway logs'                     deny
case_ "game-developer: normal build command allowed" game-developer 'npm run build'                    allow

echo "-- hardening: wrapper-command bypass attempts caught (wrapper-keyword-gated) --"
case_ "eval wrapper no longer bypasses git block"    web-wallet-expert 'eval "git commit -m x"'        deny
case_ "sh -c wrapper no longer bypasses git block"   web-wallet-expert 'sh -c "git push"'               deny
case_ "xargs wrapper no longer bypasses git block"   web-wallet-expert 'echo x | xargs git commit -m'   deny
case_ "newline-joined command caught (grep ^ is per-line)" web-wallet-expert "$(printf 'echo hi\ngit commit -m x')" deny
case_ "railway via eval no longer bypasses"          web-wallet-expert 'eval "railway redeploy"'        deny
case_ "sed -i via bash -c caught (wrapper-gated write check)" routine-tasks 'bash -c "sed -i \"\" s/a/b/ f"' deny

echo "-- regression: unrelated grep/search text must NOT false-trigger (the bug this design fixes) --"
case_ "doc-keeper: grep for the phrase 'git commit' in docs allowed" \
  doc-keeper 'grep -rn "git commit" docs/' allow
case_ "code-compliance-checker: grep for the word railway allowed" \
  code-compliance-checker 'grep -rn railway docs/architecture/deploy.md' allow
touch "$QA_MARKER"
case_ "deploy-manager: commit msg containing 'install'/'mv' as words allowed" \
  deploy-manager 'git commit -m "chore: install new dependency and mv config file"' allow
touch "$QA_MARKER"
case_ "deploy-manager: commit msg containing 'rm'/'cp' as words allowed" \
  deploy-manager 'git commit -m "fix: rm dead code, cp env example"' allow
case_ "routine-tasks: grep for the word 'install' allowed" \
  routine-tasks 'grep -rn install package.json' allow

echo "-- known gaps: literal-token obfuscation still bypasses git/railway checks (regex, not a parser) --"
case_ "KNOWN GAP: quoted git bypasses (quote breaks \\s+ adjacency)" web-wallet-expert '"git" commit -m x' allow
case_ "KNOWN GAP: backslash-escaped git bypasses (not anchored, no wrapper keyword)" web-wallet-expert '\git commit -m x' allow

rm -f "$QA_MARKER"

echo "== $PASS passed, $FAIL failed =="
[ "$FAIL" -eq 0 ]
