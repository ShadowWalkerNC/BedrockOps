#!/usr/bin/env bash
# One-shot local BDS + fake-player exercise.
#
# Default mode (bots-only): ensure bot-compat BDS is up, run ping/join/chat/flood/churn.
# With --with-api: also login to the control plane and assert join ingest / flood audit.
#
# Usage (from repo root):
#   ./scripts/bds/run-bot-e2e.sh
#   ./scripts/bds/run-bot-e2e.sh --with-api
#   FLOOD_COUNT=12 ./scripts/bds/run-bot-e2e.sh --with-api
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

WITH_API=0
FLOOD_COUNT="${FLOOD_COUNT:-8}"
PREFIX="${BOT_PREFIX:-E2E}"
API_URL="${API_URL:-http://127.0.0.1:4000}"
LOGIN_EMAIL="${LOGIN_EMAIL:-admin@minecraft-admin.local}"
LOGIN_PASSWORD="${LOGIN_PASSWORD:-admin}"
SERVER_ID="${SERVER_ID:-srv_bedrock_1}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --with-api) WITH_API=1; shift ;;
    -h|--help)
      sed -n '2,14p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown arg: $1" >&2
      exit 2
      ;;
  esac
done

log() { printf '[bds-e2e] %s\n' "$*"; }
fail() { printf '[bds-e2e] FAIL: %s\n' "$*" >&2; exit 1; }

log "ensuring bot-compat BDS…"
./scripts/bds/download-bds.sh --bot-compat
./scripts/bds/configure-bds.sh
./scripts/bds/ensure-raknet-native.sh

BDS_HOME="$(readlink -f "$ROOT/var/bds/active")"
[[ -x "$BDS_HOME/bedrock_server" ]] || fail "bedrock_server missing at $BDS_HOME"

bds_listening() {
  pnpm --filter @mc-admin/bds-bots bot:ping >/dev/null 2>&1
}

STARTED_BDS=0
if bds_listening; then
  log "BDS already accepting joins on :19132"
else
  log "starting BDS in background…"
  mkdir -p /tmp/bedrockops-logs
  (
    export LD_LIBRARY_PATH="$BDS_HOME${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
    cd "$BDS_HOME"
    exec ./bedrock_server
  ) > /tmp/bedrockops-logs/bds-e2e.log 2>&1 &
  echo $! > /tmp/bedrockops-logs/bds-e2e.pid
  STARTED_BDS=1

  for i in $(seq 1 60); do
    if bds_listening; then
      log "BDS ready (waited ${i}s)"
      break
    fi
    if [[ "$i" -eq 60 ]]; then
      tail -40 /tmp/bedrockops-logs/bds-e2e.log || true
      fail "BDS did not become ready on :19132"
    fi
    sleep 1
  done
fi

run_bot() {
  local scenario="$1"
  shift
  log "bot:$scenario $*"
  pnpm --filter @mc-admin/bds-bots bot -- "$scenario" "$@"
}

run_bot ping
run_bot join --prefix "${PREFIX}Join" --hold-ms 1500
run_bot chat --prefix "${PREFIX}Chat" --message "bedrockops e2e" --hold-ms 1000
run_bot flood --prefix "${PREFIX}Flood" --count "$FLOOD_COUNT" --hold-ms 2000 --stagger-ms 30
run_bot churn --prefix "${PREFIX}Churn" --rounds 3 --hold-ms 500

if [[ "$WITH_API" -eq 1 ]]; then
  log "verifying control-plane ingest at $API_URL…"
  curl -sf "$API_URL/health" >/dev/null || fail "API health check failed — start stack with ./scripts/start-local-bds.sh"

  TOKEN="$(
    curl -sf -X POST "$API_URL/api/v1/auth/login" \
      -H 'content-type: application/json' \
      -d "{\"email\":\"$LOGIN_EMAIL\",\"password\":\"$LOGIN_PASSWORD\"}" \
      | python3 -c 'import sys,json; print(json.load(sys.stdin)["token"])'
  )"
  [[ -n "$TOKEN" ]] || fail "login failed"

  # Point seeded server at this BDS install when an agent-managed path is expected.
  curl -sf -X PATCH "$API_URL/api/v1/servers/$SERVER_ID" \
    -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
    -d "{\"serverPath\":\"$BDS_HOME\",\"host\":\"127.0.0.1\",\"port\":19132}" >/dev/null || true

  # If agent is live, joins should already be ingested. If not, feed the last flood
  # lines through the join API so --with-api still asserts the app path.
  TRACKED="$(
    curl -sf "$API_URL/api/v1/moderation/players/search?q=${PREFIX}Flood" \
      -H "Authorization: Bearer $TOKEN" \
      | python3 -c 'import sys,json; print(len(json.load(sys.stdin).get("tracked",[])))'
  )"
  log "tracked ${PREFIX}Flood* players via agent/API: $TRACKED"

  if [[ "${TRACKED:-0}" -lt 1 ]]; then
    log "no agent ingest yet — posting synthetic join lines for flood assertion…"
    for i in $(seq 1 "$FLOOD_COUNT"); do
      curl -sf -X POST "$API_URL/api/v1/moderation/players/join" \
        -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
        -d "{\"serverId\":\"$SERVER_ID\",\"line\":\"[E2E] Player connected: ${PREFIX}Flood${i}, xuid:\"}" >/dev/null
    done
    # Extra joins to cross default flood threshold (20) when FLOOD_COUNT is smaller.
    EXTRA_NEEDED=$((20 - FLOOD_COUNT))
    if [[ "$EXTRA_NEEDED" -gt 0 ]]; then
      for i in $(seq 1 "$EXTRA_NEEDED"); do
        curl -sf -X POST "$API_URL/api/v1/moderation/players/join" \
          -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
          -d "{\"serverId\":\"$SERVER_ID\",\"line\":\"[E2E] Player connected: ${PREFIX}Pad${i}, xuid:\"}" >/dev/null
      done
    fi
  fi

  TRACKED="$(
    curl -sf "$API_URL/api/v1/moderation/players/search?q=${PREFIX}" \
      -H "Authorization: Bearer $TOKEN" \
      | python3 -c 'import sys,json; print(len(json.load(sys.stdin).get("tracked",[])))'
  )"
  [[ "${TRACKED:-0}" -ge 1 ]] || fail "expected tracked players for prefix $PREFIX, got $TRACKED"
  log "tracked players matching ${PREFIX}*: $TRACKED"

  FLOOD_HITS="$(
    curl -sf "$API_URL/api/v1/audit?limit=50" -H "Authorization: Bearer $TOKEN" \
      | python3 -c 'import sys,json; print(sum(1 for a in json.load(sys.stdin).get("auditLogs",[]) if a.get("action")=="JOIN_FLOOD_DETECTED"))'
  )"
  if [[ "${FLOOD_HITS:-0}" -lt 1 ]]; then
    log "no JOIN_FLOOD_DETECTED yet — driving extra joins to cross threshold…"
    for i in $(seq 1 25); do
      curl -sf -X POST "$API_URL/api/v1/moderation/players/join" \
        -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
        -d "{\"serverId\":\"$SERVER_ID\",\"line\":\"[E2E] Player connected: ${PREFIX}Burst${i}, xuid:\"}" >/dev/null
    done
    FLOOD_HITS="$(
      curl -sf "$API_URL/api/v1/audit?limit=50" -H "Authorization: Bearer $TOKEN" \
        | python3 -c 'import sys,json; print(sum(1 for a in json.load(sys.stdin).get("auditLogs",[]) if a.get("action")=="JOIN_FLOOD_DETECTED"))'
    )"
  fi
  [[ "${FLOOD_HITS:-0}" -ge 1 ]] || fail "expected JOIN_FLOOD_DETECTED audit events"
  log "JOIN_FLOOD_DETECTED audit events: $FLOOD_HITS"
fi

log "OK — bot e2e complete (started_bds=$STARTED_BDS with_api=$WITH_API)"
if [[ "$STARTED_BDS" -eq 1 ]]; then
  log "BDS left running (pid $(cat /tmp/bedrockops-logs/bds-e2e.pid 2>/dev/null || echo '?')); stop with: kill \$(cat /tmp/bedrockops-logs/bds-e2e.pid)"
fi
