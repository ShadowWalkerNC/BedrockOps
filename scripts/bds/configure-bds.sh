#!/usr/bin/env bash
# Configure a BDS install for local offline bot testing.
#
# Usage:
#   ./scripts/bds/configure-bds.sh /path/to/bedrock-server-X.Y.Z
#   ./scripts/bds/configure-bds.sh   # uses newest var/bds/bedrock-server-*
#
# Sets online-mode=false so Prismarine offline bots can join without Xbox auth.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
HOME_DIR="${1:-}"

if [[ -z "$HOME_DIR" ]]; then
  if [[ -d "$ROOT/var/bds/active" || -L "$ROOT/var/bds/active" ]]; then
    HOME_DIR="$(readlink -f "$ROOT/var/bds/active")"
  else
    HOME_DIR="$(ls -1d "$ROOT"/var/bds/bedrock-server-* 2>/dev/null | sort -V | tail -1 || true)"
  fi
fi

if [[ -z "$HOME_DIR" || ! -d "$HOME_DIR" ]]; then
  echo "[bds] install dir not found — run ./scripts/bds/download-bds.sh first" >&2
  exit 1
fi

PROPS="$HOME_DIR/server.properties"
if [[ ! -f "$PROPS" ]]; then
  echo "[bds] missing server.properties in $HOME_DIR" >&2
  exit 1
fi

python3 - "$PROPS" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
text = path.read_text(encoding="utf-8", errors="replace")
lines = text.splitlines()
wanted = {
    "server-name": "BedrockOps Local Test",
    "gamemode": "creative",
    "difficulty": "peaceful",
    "allow-cheats": "true",
    "max-players": "20",
    "online-mode": "false",
    "allow-list": "false",
    "white-list": "false",
    "server-port": "19132",
    "server-portv6": "19133",
    "view-distance": "8",
    "tick-distance": "4",
    "player-idle-timeout": "0",
    "max-threads": "2",
    "level-name": "BedrockOpsWorld",
    "default-player-permission-level": "member",
    "content-log-file-enabled": "true",
}
seen = set()
out = []
for line in lines:
    raw = line.strip()
    if not raw or raw.startswith("#") or "=" not in line:
        out.append(line)
        continue
    key, _, _ = line.partition("=")
    key = key.strip()
    if key in wanted:
        out.append(f"{key}={wanted[key]}")
        seen.add(key)
    else:
        out.append(line)
for key, value in wanted.items():
    if key not in seen:
        out.append(f"{key}={value}")
path.write_text("\n".join(out) + "\n", encoding="utf-8")
print(f"[bds] wrote offline/LAN test properties → {path}")
PY

# permissions.json / allowlist empty for open local joins
if [[ ! -f "$HOME_DIR/allowlist.json" ]]; then
  echo '[]' > "$HOME_DIR/allowlist.json"
fi
if [[ ! -f "$HOME_DIR/permissions.json" ]]; then
  echo '[]' > "$HOME_DIR/permissions.json"
fi

mkdir -p "$HOME_DIR/worlds"

cat > "$HOME_DIR/.bedrockops-test.env" <<EOF
BDS_HOME=$HOME_DIR
BDS_BIN=$HOME_DIR/bedrock_server
BDS_HOST=127.0.0.1
BDS_PORT=19132
BDS_VERSION=$(basename "$HOME_DIR" | sed 's/^bedrock-server-//')
EOF

echo "[bds] configured for offline bot testing"
echo "BDS_HOME=$HOME_DIR"
echo "BDS_BIN=$HOME_DIR/bedrock_server"
echo "TIP: source $HOME_DIR/.bedrockops-test.env"
