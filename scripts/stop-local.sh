#!/usr/bin/env bash
# Stop processes started by scripts/start-local.sh (PIDs under /tmp/bedrockops-logs/).
set -euo pipefail

LOG_DIR="${BEDROCKOPS_LOG_DIR:-/tmp/bedrockops-logs}"

if [[ ! -d "$LOG_DIR" ]]; then
  echo "[stop-local] no log dir at $LOG_DIR — nothing to stop"
  exit 0
fi

stopped=0
for name in api web agent worker; do
  pid_file="$LOG_DIR/${name}.pid"
  if [[ -f "$pid_file" ]]; then
    pid="$(tr -d '[:space:]' < "$pid_file" || true)"
    if [[ -n "${pid:-}" ]] && kill -0 "$pid" 2>/dev/null; then
      echo "[stop-local] stopping $name (pid $pid)"
      kill "$pid" 2>/dev/null || true
      # Give graceful shutdown a moment, then force if needed.
      for _ in $(seq 1 20); do
        if ! kill -0 "$pid" 2>/dev/null; then
          break
        fi
        sleep 0.1
      done
      if kill -0 "$pid" 2>/dev/null; then
        kill -9 "$pid" 2>/dev/null || true
      fi
      stopped=$((stopped + 1))
    else
      echo "[stop-local] $name pid file stale ($pid_file)"
    fi
    rm -f "$pid_file"
  fi
done

# Also clear orphaned bedrock-agent children that may have been re-parented.
if pgrep -f 'apps/agent/bin/bedrock-agent' >/dev/null 2>&1; then
  echo "[stop-local] killing leftover bedrock-agent processes"
  pkill -f 'apps/agent/bin/bedrock-agent' 2>/dev/null || true
fi

echo "[stop-local] done (stopped $stopped tracked process(es))"
