#!/usr/bin/env bash
# Start a production-shaped local BedrockOps stack:
#   Postgres (compose) + Prisma API + web dashboard + Go agent (simulated BDS).
# Usage: from repo root → ./scripts/start-local.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

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

mkdir -p /tmp/bedrockops-world/worlds
mkdir -p /tmp/bedrockops-logs

echo "[start-local] launching API (4000), web (3000), agent…"
echo "  Dashboard: http://localhost:3000/login"
echo "  Login:     admin@minecraft-admin.local / admin"
echo "  API:       http://localhost:4000/health"

# Export env for child processes (dotenv not loaded by ts-node by default).
set -a
# shellcheck disable=SC1091
source <(grep -E '^[A-Z0-9_]+=' .env | sed 's/\r$//')
set +a

PORT=4000 DB_ADAPTER=prisma NODE_ENV="${NODE_ENV:-development}" \
  pnpm --filter @mc-admin/api dev > /tmp/bedrockops-logs/api.log 2>&1 &
echo $! > /tmp/bedrockops-logs/api.pid

NEXT_PUBLIC_DEV_AUTO_LOGIN=false API_URL=http://localhost:4000 \
  pnpm --filter @mc-admin/web dev > /tmp/bedrockops-logs/web.log 2>&1 &
echo $! > /tmp/bedrockops-logs/web.pid

./apps/agent/bin/bedrock-agent \
  -control-plane http://127.0.0.1:4000 \
  -node-id node_docker_agent_1 \
  -token "${BEDROCK_AGENT_TOKEN:-dev_agent_token_change_me}" \
  -server-path /tmp/bedrockops-world \
  > /tmp/bedrockops-logs/agent.log 2>&1 &
echo $! > /tmp/bedrockops-logs/agent.pid

# Optional worker (honest stubs without R2)
pnpm --filter @mc-admin/worker dev > /tmp/bedrockops-logs/worker.log 2>&1 &
echo $! > /tmp/bedrockops-logs/worker.pid

for i in $(seq 1 60); do
  if curl -sf http://127.0.0.1:4000/health >/dev/null && curl -sf http://127.0.0.1:3000/login >/dev/null; then
    echo "[start-local] ready."
    exit 0
  fi
  sleep 0.5
done

echo "[start-local] timed out waiting for health — see /tmp/bedrockops-logs/"
exit 1
