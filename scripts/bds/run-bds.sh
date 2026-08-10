#!/usr/bin/env bash
# Run bedrock_server directly (outside the agent) for bot harness smoke tests.
#
# Usage:
#   ./scripts/bds/run-bds.sh
#   ./scripts/bds/run-bds.sh /path/to/bedrock-server-X.Y.Z
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
if [[ -z "$HOME_DIR" || ! -x "$HOME_DIR/bedrock_server" ]]; then
  echo "[bds] install missing — run ./scripts/bds/download-bds.sh && ./scripts/bds/configure-bds.sh" >&2
  exit 1
fi

if [[ ! -f "$HOME_DIR/.bedrockops-test.env" ]]; then
  "$ROOT/scripts/bds/configure-bds.sh" "$HOME_DIR"
fi

export LD_LIBRARY_PATH="$HOME_DIR${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
cd "$HOME_DIR"
echo "[bds] starting bedrock_server in $HOME_DIR (UDP 19132)"
echo "[bds] Ctrl+C to stop"
exec ./bedrock_server
