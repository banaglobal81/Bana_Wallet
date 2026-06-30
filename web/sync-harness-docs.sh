#!/usr/bin/env bash
# sync-harness-docs.sh — detect factual drift in agent .md / CLAUDE.md.
# Conservative: reports mismatches instead of auto-fixing (doc-keeper decides fixes).
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

DRIFT=0
note() { echo "WARN drift: $1"; DRIFT=$((DRIFT+1)); }
ok()   { echo "ok   $1"; }

echo "== BANA harness doc drift check =="

# 1) Agent file count (expect 15)
AGENT_COUNT=$(find .claude/agents -maxdepth 1 -name '*.md' 2>/dev/null | wc -l | tr -d ' ')
if [ "$AGENT_COUNT" = "15" ]; then
  ok "15 agent files"
else
  note ".claude/agents/ file count = $AGENT_COUNT (expected 15)"
fi

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

# 3) Port consistency (package.json dev defaults to 3000, Next.js standard)
grep -q 'next dev' package.json && ok "Next.js dev configured" || note "package.json missing next dev"

# 4) Key paths exist (Next.js structure)
for p in src/lib/nia src/app/api src/utils/niaApi.ts tests/harness server/core/nia-signing.js; do
  [ -e "$p" ] && ok "path exists: $p" || note "path missing: $p"
done

# 5) No obsolete Express/Vite files
for obsolete in server.js vite.config.ts start.sh stop.sh; do
  [ ! -e "$obsolete" ] && ok "obsolete $obsolete not found" || note "obsolete file still present: $obsolete"
done

# 6) Each agent file has a Self-Update Protocol section
for f in .claude/agents/*.md; do
  [ -e "$f" ] || continue
  grep -q 'Self-Update Protocol' "$f" || note "$f missing Self-Update Protocol"
done

# 7) Route handler count (14 expected in Next.js structure)
ROUTE_COUNT=$(find src/app/api/nia -name 'route.ts' -type f 2>/dev/null | wc -l | tr -d ' ')
if [ "$ROUTE_COUNT" = "14" ]; then
  ok "14 Nia-Hub route handlers found"
else
  note "Nia-Hub route handlers: found $ROUTE_COUNT, expected 14"
fi

echo "== done: $DRIFT drift item(s) =="
exit 0
