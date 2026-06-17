#!/usr/bin/env bash
# BANA local up — Vite dev (:3000) + Express backend (:8787)
# PIDs stored in .pids/, logs split into .pids/*.log.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

PID_DIR="$ROOT/.pids"
mkdir -p "$PID_DIR"

VITE_PORT=3000
SERVER_PORT=8787

is_running() { # $1 = pidfile
  [ -f "$1" ] && kill -0 "$(cat "$1")" 2>/dev/null
}

start_proc() { # $1 = name, $2 = npm script, $3 = pidfile, $4 = logfile
  if is_running "$3"; then
    echo "skip  $1 already running (pid $(cat "$3"))"
    return
  fi
  echo "start $1: npm run $2"
  nohup npm run "$2" > "$4" 2>&1 &
  echo $! > "$3"
  echo "      pid $(cat "$3"), log $4"
}

# Warn if dependencies are missing
if [ ! -d node_modules ]; then
  echo "warn  node_modules missing — run 'npm install' first." >&2
fi

start_proc "Express(:$SERVER_PORT)" server "$PID_DIR/server.pid" "$PID_DIR/server.log"
start_proc "Vite(:$VITE_PORT)"      dev    "$PID_DIR/vite.pid"   "$PID_DIR/vite.log"

echo
echo "OK  up — frontend http://localhost:$VITE_PORT , backend http://localhost:$SERVER_PORT"
echo "    status check: curl -s http://localhost:$SERVER_PORT/api/nia/status"
echo "    stop: bash stop.sh"
