#!/usr/bin/env bash
# Production-shaped process start (after secrets + Postgres are ready).
# Prefer this over `pnpm dev` on a VPS / staging host.
#
# Usage (from repo root):
#   cp .env.example .env   # then edit secrets
#   ./scripts/start-prod.sh
#
# Requires: Node 18+, pnpm, Go 1.22+ (agent), Docker Postgres (or external DATABASE_URL).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

LOG_DIR="${BEDROCKOPS_LOG_DIR:-/tmp/bedrockops-logs}"
mkdir -p "$LOG_DIR"

if [[ -d "$LOG_DIR" ]] && compgen -G "$LOG_DIR/*.pid" >/dev/null 2>&1; then
  echo "[start-prod] existing PIDs found — running stop-local first"
  "$ROOT/scripts/stop-local.sh" || true
  sleep 0.5
fi

if [[ ! -f .env ]]; then
  echo "[start-prod] missing .env — copy .env.example and set production secrets"
  exit 1
fi

set -a
# shellcheck disable=SC1091
source <(grep -E '^[A-Z0-9_]+=' .env | sed 's/\r$//')
set +a

if [[ "${NODE_ENV:-}" != "production" ]]; then
  echo "[start-prod] warning: NODE_ENV is '${NODE_ENV:-unset}' (recommend production)"
fi

if [[ -z "${JWT_SECRET:-}" || "${#JWT_SECRET}" -lt 32 ]]; then
  echo "[start-prod] JWT_SECRET must be set (min 32 chars)"
  exit 1
fi
if [[ -z "${NODE_PAIRING_SECRET:-}" || "${#NODE_PAIRING_SECRET}" -lt 32 ]]; then
  echo "[start-prod] NODE_PAIRING_SECRET must be set (min 32 chars)"
  exit 1
fi
if [[ "${CORS_ORIGIN:-}" == "*" ]]; then
  echo "[start-prod] CORS_ORIGIN=* is refused for production-shaped deploys"
  exit 1
fi
if [[ "${DB_ADAPTER:-}" != "prisma" ]]; then
  echo "[start-prod] DB_ADAPTER must be prisma for deployable runs"
  exit 1
fi
if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "[start-prod] DATABASE_URL is required"
  exit 1
fi

echo "[start-prod] prisma generate + migrate…"
pnpm --filter @mc-admin/db db:generate
pnpm --filter @mc-admin/db db:migrate

echo "[start-prod] build (packages + web + agent)…"
pnpm build
pnpm --filter @mc-admin/agent agent:build

echo "[start-prod] starting API (4000), web (3000), worker…"
PORT=4000 DB_ADAPTER=prisma NODE_ENV="${NODE_ENV:-production}" \
  pnpm --filter @mc-admin/api start > "$LOG_DIR/api.log" 2>&1 &
echo $! > "$LOG_DIR/api.pid"

NEXT_PUBLIC_DEV_AUTO_LOGIN=false \
NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL:-http://localhost:4000}" \
API_URL="${API_URL:-http://localhost:4000}" \
  pnpm --filter @mc-admin/web start > "$LOG_DIR/web.log" 2>&1 &
echo $! > "$LOG_DIR/web.pid"

PORT=4000 DB_ADAPTER=prisma NODE_ENV="${NODE_ENV:-production}" \
  pnpm --filter @mc-admin/worker start > "$LOG_DIR/worker.log" 2>&1 &
echo $! > "$LOG_DIR/worker.pid"

echo "[start-prod] PIDs in $LOG_DIR — stop with ./scripts/stop-local.sh"
echo "  Dashboard: ${CORS_ORIGIN:-http://localhost:3000}/login"
echo "  API:       http://127.0.0.1:4000/health"
echo "  Rotate seed admin password after first login."
echo "  Pair the Go agent on the game host — see DEPLOY.md"

for i in $(seq 1 90); do
  if curl -sf http://127.0.0.1:4000/health >/dev/null; then
    echo "[start-prod] API healthy."
    exit 0
  fi
  sleep 0.5
done

echo "[start-prod] timed out waiting for API health — see $LOG_DIR/api.log"
exit 1
