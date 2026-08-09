#!/usr/bin/env bash
# Start the local BedrockOps stack with a REAL Bedrock Dedicated Server.
#
# Prerequisites:
#   ./scripts/bds/download-bds.sh
#   ./scripts/bds/configure-bds.sh
#
# Usage (from repo root):
#   ./scripts/start-local-bds.sh
#   BDS_HOME=/path/to/install ./scripts/start-local-bds.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ -z "${BDS_HOME:-}" ]]; then
  if [[ -d "$ROOT/var/bds/active" || -L "$ROOT/var/bds/active" ]]; then
    BDS_HOME="$(readlink -f "$ROOT/var/bds/active")"
  else
    BDS_HOME="$(ls -1d "$ROOT"/var/bds/bedrock-server-* 2>/dev/null | sort -V | tail -1 || true)"
  fi
fi
if [[ -z "${BDS_HOME:-}" || ! -x "${BDS_HOME}/bedrock_server" ]]; then
  echo "[start-local-bds] BDS not found. Run:" >&2
  echo "  ./scripts/bds/download-bds.sh && ./scripts/bds/configure-bds.sh" >&2
  exit 1
fi

export BDS_HOME
export BDS_BIN="${BDS_BIN:-$BDS_HOME/bedrock_server}"

if [[ ! -f "$BDS_HOME/.bedrockops-test.env" ]]; then
  "$ROOT/scripts/bds/configure-bds.sh" "$BDS_HOME"
fi

echo "[start-local-bds] using live BDS at $BDS_HOME"
"$ROOT/scripts/start-local.sh"

echo ""
echo "[start-local-bds] next steps:"
echo "  1. Start the server from the dashboard (Power → Start) so the agent launches BDS"
echo "  2. Run offline bots:"
echo "       pnpm --filter @mc-admin/bds-bots bot:join"
echo "       pnpm --filter @mc-admin/bds-bots bot:chat"
echo "       pnpm --filter @mc-admin/bds-bots bot:flood -- --count 8"
echo "  3. Watch join lines in /tmp/bedrockops-logs/agent.log and the live console UI"
echo "See docs/local-bds-testing.md"
