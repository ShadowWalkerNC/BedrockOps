#!/usr/bin/env bash
# Start a production-shaped local BedrockOps stack:
#   Postgres (compose) + Prisma API + web dashboard + Go agent (simulated BDS).
# Usage: from repo root → ./scripts/start-local.sh
# Stop with: ./scripts/stop-local.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

LOG_DIR="${BEDROCKOPS_LOG_DIR:-/tmp/bedrockops-logs}"

# Idempotent: stop any previous start-local stack before launching again.
if [[ -d "$LOG_DIR" ]] && compgen -G "$LOG_DIR/*.pid" >/dev/null 2>&1; then
  echo "[start-local] existing PIDs found — running stop-local first"
  "$ROOT/scripts/stop-local.sh" || true
  sleep 0.5
fi

if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "[start-local] created .env from .env.example"
fi

# Ensure strong local secrets exist (idempotent — only fill empties/weak defaults).
python3 - <<'PY'
from pathlib import Path
import secrets, re
path = Path(".env")
text = path.read_text()
weak = {
    "JWT_SECRET": "dev_jwt_secret_change_in_production",
    "NODE_PAIRING_SECRET": "dev_node_pairing_secret_change_in_production",
}
for key, weak_val in weak.items():
    m = re.search(rf"^{key}=(.*)$", text, flags=re.M)
    current = m.group(1).strip() if m else ""
    if (not current) or current == weak_val or len(current) < 32:
        value = secrets.token_urlsafe(48)
        if m:
            text = re.sub(rf"^{key}=.*$", f"{key}={value}", text, flags=re.M)
        else:
            text += f"\n{key}={value}\n"
# Prefer prisma + no silent auto-login for a prod-shaped local play session.
def set_kv(src: str, key: str, value: str) -> str:
    if re.search(rf"^{key}=", src, flags=re.M):
        return re.sub(rf"^{key}=.*$", f"{key}={value}", src, flags=re.M)
    return src + f"\n{key}={value}\n"
text = set_kv(text, "DB_ADAPTER", "prisma")
text = set_kv(text, "NEXT_PUBLIC_DEV_AUTO_LOGIN", "false")
text = set_kv(text, "CORS_ORIGIN", "http://localhost:3000")
text = set_kv(text, "API_URL", "http://localhost:4000")
text = set_kv(text, "NEXT_PUBLIC_API_URL", "http://localhost:4000")
path.write_text(text)
print("[start-local] .env hardened for local prisma play")
PY

echo "[start-local] starting Postgres…"
docker compose up -d postgres

echo "[start-local] waiting for Postgres…"
for i in $(seq 1 40); do
  if docker compose exec -T postgres pg_isready -U mcadmin -d minecraft_admin >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
done

echo "[start-local] prisma generate + migrate…"
pnpm --filter @mc-admin/db db:generate
pnpm --filter @mc-admin/db db:migrate

echo "[start-local] building Go agent…"
pnpm --filter @mc-admin/agent agent:build

mkdir -p "$LOG_DIR"

echo "[start-local] launching API (4000), web (3000), agent…"
echo "  Dashboard: http://localhost:3000/login"
echo "  Login:     admin@minecraft-admin.local / admin"
echo "  API:       http://localhost:4000/health"
echo "  Stop with: ./scripts/stop-local.sh"

# Export env for child processes (dotenv not loaded by ts-node by default).
set -a
# shellcheck disable=SC1091
source <(grep -E '^[A-Z0-9_]+=' .env | sed 's/\r$//')
set +a

PORT=4000 DB_ADAPTER=prisma NODE_ENV="${NODE_ENV:-development}" \
  pnpm --filter @mc-admin/api dev > "$LOG_DIR/api.log" 2>&1 &
echo $! > "$LOG_DIR/api.pid"

# Wipe stale Next cache (corrupt vendor-chunks are common after branch switches / OneDrive sync).
pnpm --filter @mc-admin/web clean >/dev/null 2>&1 || rm -rf apps/web/.next

NEXT_PUBLIC_DEV_AUTO_LOGIN=false API_URL=http://localhost:4000 NEXT_PUBLIC_API_URL=http://localhost:4000 \
  pnpm --filter @mc-admin/web dev > "$LOG_DIR/web.log" 2>&1 &
echo $! > "$LOG_DIR/web.pid"

AGENT_SERVER_PATH="${BDS_HOME:-/tmp/bedrockops-world}"
AGENT_ARGS=(
  -control-plane http://127.0.0.1:4000
  -node-id node_docker_agent_1
  -token "${BEDROCK_AGENT_TOKEN:-dev_agent_token_change_me}"
  -server-path "$AGENT_SERVER_PATH"
)
if [[ -n "${BDS_BIN:-}" && -x "${BDS_BIN}" ]]; then
  AGENT_ARGS+=(-bds-bin "$BDS_BIN")
  echo "[start-local] agent mode: live BDS ($BDS_BIN)"
else
  echo "[start-local] agent mode: simulated (set BDS_BIN for real BDS)"
  mkdir -p /tmp/bedrockops-world/worlds
fi

./apps/agent/bin/bedrock-agent "${AGENT_ARGS[@]}" \
  > "$LOG_DIR/agent.log" 2>&1 &
echo $! > "$LOG_DIR/agent.pid"

# Optional worker (honest stubs without R2)
pnpm --filter @mc-admin/worker dev > "$LOG_DIR/worker.log" 2>&1 &
echo $! > "$LOG_DIR/worker.pid"

for i in $(seq 1 60); do
  if curl -sf http://127.0.0.1:4000/health >/dev/null && curl -sf http://127.0.0.1:3000/login >/dev/null; then
    echo "[start-local] ready."
    exit 0
  fi
  sleep 0.5
done

echo "[start-local] timed out waiting for health — see $LOG_DIR/"
exit 1
