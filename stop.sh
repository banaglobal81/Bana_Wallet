#!/usr/bin/env bash
# BANA local down — stop the processes started by start.sh, by PID file.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_DIR="$ROOT/.pids"

stop_proc() { # $1 = name, $2 = pidfile
  if [ -f "$2" ]; then
    local pid; pid="$(cat "$2")"
    if kill -0 "$pid" 2>/dev/null; then
      echo "stop  $1 (pid $pid)"
      kill "$pid" 2>/dev/null || true
      # clean up child processes (vite/node) too
      pkill -P "$pid" 2>/dev/null || true
    else
      echo "skip  $1 already stopped"
    fi
    rm -f "$2"
  else
    echo "skip  $1 no PID file"
  fi
}

stop_proc "Vite"    "$PID_DIR/vite.pid"
stop_proc "Express" "$PID_DIR/server.pid"

echo "OK  stopped"
