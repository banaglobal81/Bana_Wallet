#!/usr/bin/env bash
# sync-harness-docs.sh — detect factual drift in agent .md / CLAUDE.md.
# Conservative: reports mismatches instead of auto-fixing (doc-keeper decides fixes).
# Lives at the repo root (sibling to CLAUDE.md and .claude/); the Next.js app
# itself lives under web/, so app-specific checks are prefixed accordingly.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"
WEB="$ROOT/web"

DRIFT=0
note() { echo "WARN drift: $1"; DRIFT=$((DRIFT+1)); }
ok()   { echo "ok   $1"; }

echo "== BANA harness doc drift check =="

# 1) Agent file count (no hardcoded expectation — check 2 below cross-checks
#    this against CLAUDE.md's own team table, so it stays correct as the roster grows)
AGENT_COUNT=$(find .claude/agents -maxdepth 1 -name '*.md' 2>/dev/null | wc -l | tr -d ' ')
ok "$AGENT_COUNT agent files found"

# 2) Team rows declared in CLAUDE.md vs actual file count
if [ -f CLAUDE.md ]; then
  # Count only numbered team rows (| 1 | ... | 15 |) to avoid colliding with the tier table
  TABLE_ROWS=$(grep -cE '^\| [0-9]+ \|' CLAUDE.md | tr -d ' ')
  if [ "$TABLE_ROWS" = "$AGENT_COUNT" ]; then
    ok "CLAUDE.md team table rows ($TABLE_ROWS) = agent file count"
  else
    note "CLAUDE.md team table rows $TABLE_ROWS != agent files $AGENT_COUNT"
  fi
else
  note "CLAUDE.md missing"
fi

# 3) Port consistency (web/package.json dev defaults to 3000, Next.js standard)
if [ -f "$WEB/package.json" ]; then
  grep -q 'next dev' "$WEB/package.json" && ok "Next.js dev configured" || note "web/package.json missing next dev"
else
  note "web/package.json missing"
fi

# 4) Key paths exist (Next.js app lives under web/)
for p in src/lib/nia src/app/api src/utils/niaApi.ts tests/harness server/core/nia-signing.js; do
  [ -e "$WEB/$p" ] && ok "path exists: web/$p" || note "path missing: web/$p"
done

# 5) worker/ cron service exists and is documented
[ -f "$ROOT/worker/trigger.mjs" ] && ok "worker/trigger.mjs present" || note "worker/trigger.mjs missing"
grep -q 'worker/' CLAUDE.md 2>/dev/null && ok "CLAUDE.md documents worker/" || note "CLAUDE.md does not mention worker/"

# 6) No obsolete Express/Vite/pre-rebrand files
for obsolete in "$WEB/server.js" "$WEB/vite.config.ts" "$ROOT/start.sh" "$ROOT/stop.sh" "$WEB/src/index.css"; do
  [ ! -e "$obsolete" ] && ok "obsolete ${obsolete#"$ROOT/"} not found" || note "obsolete file still present: ${obsolete#"$ROOT/"}"
done

# 7) Each agent file has a Self-Update Protocol section
for f in .claude/agents/*.md; do
  [ -e "$f" ] || continue
  grep -q 'Self-Update Protocol' "$f" || note "$f missing Self-Update Protocol"
done

# 7b) Each agent file's docs/patterns/<name>.md reference actually exists
#     (a dangling reference here means the Pattern Library section points nowhere)
for f in .claude/agents/*.md; do
  [ -e "$f" ] || continue
  ref=$(grep -o 'docs/patterns/[a-zA-Z0-9_-]*\.md' "$f" | head -1)
  if [ -n "$ref" ] && [ ! -f "$ROOT/$ref" ]; then
    note "$f references $ref but it does not exist"
  fi
done

# 8) Route handler count (13 expected: address, balance, deposits, withdrawals,
#    transfer, orders, trades, markets, klines, wallet-history, notifications,
#    status, webhook)
ROUTE_COUNT=$(find "$WEB/src/app/api/nia" -name 'route.ts' -type f 2>/dev/null | wc -l | tr -d ' ')
if [ "$ROUTE_COUNT" = "13" ]; then
  ok "13 Nia-Hub route handlers found"
else
  note "Nia-Hub route handlers: found $ROUTE_COUNT, expected 13"
fi

# 9) vitest include pattern covers both co-located unit tests and the harness suite
if [ -f "$WEB/vitest.config.ts" ]; then
  if grep -q "tests/harness" "$WEB/vitest.config.ts"; then
    ok "web/vitest.config.ts include covers tests/harness"
  else
    note "web/vitest.config.ts include does not mention tests/harness — harness suite may be silently skipped by npm test"
  fi
else
  note "web/vitest.config.ts missing"
fi

# 10) Atomized architecture docs exist (CLAUDE.md rule 10 — detail lives here, not inline)
for d in code-tree.md nia-integration.md harness.md worker.md; do
  [ -f "$ROOT/docs/architecture/$d" ] && ok "docs/architecture/$d present" || note "docs/architecture/$d missing"
done

# 11) CLAUDE.md stays lean (rule 10) — warn, don't fail, past ~90 lines
if [ -f CLAUDE.md ]; then
  CLAUDE_LINES=$(wc -l < CLAUDE.md | tr -d ' ')
  if [ "$CLAUDE_LINES" -le 90 ]; then
    ok "CLAUDE.md line count ($CLAUDE_LINES) within budget"
  else
    note "CLAUDE.md is $CLAUDE_LINES lines (budget ~90) — move newly added detail into docs/architecture/*.md"
  fi
fi

# 12) Model tiers: CLAUDE.md Agent Team table vs each agent file's frontmatter,
#     and opus reserved for pm/product-planner only (CLAUDE.md rule 9)
if [ -f CLAUDE.md ]; then
  while IFS='|' read -r _ _num name model _rest; do
    name=$(echo "$name" | tr -d ' ')
    model=$(echo "$model" | tr -d ' ')
    [ -z "$name" ] && continue
    f=".claude/agents/$name.md"
    if [ ! -f "$f" ]; then
      note "CLAUDE.md team table references $name but $f is missing"
      continue
    fi
    FILE_MODEL=$(grep -m1 '^model:' "$f" | sed 's/^model: *//' | tr -d ' \r')
    if [ "$FILE_MODEL" = "$model" ]; then
      ok "model tier match: $name ($model)"
    else
      note "model tier mismatch: $name — CLAUDE.md says $model, $f says $FILE_MODEL"
    fi
    if [ "$FILE_MODEL" = "opus" ] && [ "$name" != "pm" ] && [ "$name" != "product-planner" ]; then
      note "$name is set to opus but rule 9 reserves opus for pm/product-planner only"
    fi
  done < <(grep -E '^\| [0-9]+ \|' CLAUDE.md)
fi

# 13) i18n structure present (next-intl [locale] segment + message files)
[ -d "$WEB/src/app/[locale]" ] && ok "[locale] route segment present" || note "web/src/app/[locale] missing — i18n routing structure changed?"
[ -d "$WEB/src/i18n" ] && ok "web/src/i18n present" || note "web/src/i18n missing"
MSG_COUNT=$(find "$WEB/messages" -name '*.json' -type f 2>/dev/null | wc -l | tr -d ' ')
[ "$MSG_COUNT" -ge 1 ] && ok "web/messages has $MSG_COUNT locale file(s)" || note "web/messages has no locale JSON files"

# 14) Settlement routes live under api/admin/, NOT api/nia/ — a prior doc drift
#     (web-admin-expert.md) pointed at the wrong one; guard against it recurring.
[ -d "$WEB/src/app/api/admin/settlement" ] && ok "settlement routes under api/admin/ (correct)" || note "web/src/app/api/admin/settlement missing"
[ ! -e "$WEB/src/app/api/nia/settlement" ] || note "web/src/app/api/nia/settlement exists — settlement routes should live under api/admin/, update docs if this moved intentionally"

# 15) Settings.tsx is user-facing (owned by web-wallet-expert), not admin-owned —
#     guard against the ownership mix-up found in an earlier audit.
[ -f "$WEB/src/components/Settings.tsx" ] && ok "web/src/components/Settings.tsx present" || note "web/src/components/Settings.tsx missing"

# 16) Per-agent enforcement hook (rule 5/6 + review-only Bash boundary) is present,
#     executable, and still wired into settings.json — see docs/architecture/harness.md
if [ -f "$ROOT/.claude/hooks/enforce-agent-boundaries.sh" ]; then
  ok "docs/architecture/harness.md hook script present"
  [ -x "$ROOT/.claude/hooks/enforce-agent-boundaries.sh" ] || note ".claude/hooks/enforce-agent-boundaries.sh exists but is not executable"
else
  note ".claude/hooks/enforce-agent-boundaries.sh missing — rule 5/6 and review-only Bash boundary have no technical enforcement"
fi
if grep -q 'enforce-agent-boundaries.sh' "$ROOT/.claude/settings.json" 2>/dev/null; then
  ok "settings.json wires up enforce-agent-boundaries.sh"
else
  note "settings.json does not reference enforce-agent-boundaries.sh — hook is not wired up"
fi

echo "== done: $DRIFT drift item(s) =="
exit 0
