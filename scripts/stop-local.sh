#!/usr/bin/env bash
# Stop processes started by scripts/start-local.sh (PIDs under /tmp/bedrockops-logs/).
set -euo pipefail

LOG_DIR="${BEDROCKOPS_LOG_DIR:-/tmp/bedrockops-logs}"

kill_tree() {
  local pid="$1"
  local name="$2"
  if [[ -z "$pid" ]] || ! kill -0 "$pid" 2>/dev/null; then
    return 1
  fi
  echo "[stop-local] stopping $name (pid $pid)"
  local kids
  kids="$(pgrep -P "$pid" 2>/dev/null || true)"
  for child in $kids; do
    kill_tree "$child" "${name}-child" || true
  done
  kill "$pid" 2>/dev/null || true
  for _ in $(seq 1 20); do
    if ! kill -0 "$pid" 2>/dev/null; then
      return 0
    fi
    sleep 0.1
  done
  kill -9 "$pid" 2>/dev/null || true
  return 0
}

if [[ ! -d "$LOG_DIR" ]]; then
  echo "[stop-local] no log dir at $LOG_DIR - nothing to stop"
  exit 0
fi

stopped=0
for name in api web agent worker; do
  pid_file="$LOG_DIR/${name}.pid"
  if [[ -f "$pid_file" ]]; then
    pid="$(tr -d '[:space:]' < "$pid_file" || true)"
    if kill_tree "${pid:-}" "$name"; then
      stopped=$((stopped + 1))
    else
      echo "[stop-local] $name pid file stale ($pid_file)"
    fi
    rm -f "$pid_file"
  fi
done

# Sweep leftovers from previous runs / re-parented children.
# Match the real binaries (avoid matching this script's own argv).
while read -r pid; do
  [[ -n "$pid" ]] || continue
  echo "[stop-local] killing leftover api ts-node pid $pid"
  kill "$pid" 2>/dev/null || true
  kill -9 "$pid" 2>/dev/null || true
done < <(pgrep -f 'ts-node/dist/bin.js src/index.ts' || true)

while read -r pid; do
  [[ -n "$pid" ]] || continue
  echo "[stop-local] killing leftover bedrock-agent pid $pid"
  kill "$pid" 2>/dev/null || true
  kill -9 "$pid" 2>/dev/null || true
done < <(pgrep -f '/apps/agent/bin/bedrock-agent' || true)

while read -r pid; do
  [[ -n "$pid" ]] || continue
  echo "[stop-local] killing leftover next pid $pid"
  kill "$pid" 2>/dev/null || true
  kill -9 "$pid" 2>/dev/null || true
done < <(pgrep -f 'node_modules/next/dist/bin/next' || true)

echo "[stop-local] done (stopped $stopped tracked process(es))"
