#!/usr/bin/env bash
# Ensure the optional raknet-native addon is built.
# bedrock-protocol's createClient currently requires it at import time for ping.
#
# Usage: ./scripts/bds/ensure-raknet-native.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

resolve_pkg() {
  # Prefer the pnpm store copy that bedrock-protocol links to.
  local found
  found="$(find "$ROOT/node_modules/.pnpm" -path '*/raknet-native@*/node_modules/raknet-native/package.json' 2>/dev/null | head -1 | xargs -r dirname || true)"
  if [[ -n "$found" ]]; then
    echo "$found"
    return 0
  fi
  node -e "console.log(require('path').dirname(require.resolve('raknet-native/package.json',{paths:['$ROOT/packages/bds-bots','$ROOT']})))" 2>/dev/null || true
}

can_load() {
  local pkg="$1"
  node -e "require(process.argv[1]);" "$pkg" >/dev/null 2>&1
}

PKG_DIR="$(resolve_pkg)"
if [[ -z "${PKG_DIR:-}" || ! -d "$PKG_DIR" ]]; then
  echo "[bds] raknet-native package not found — run: pnpm --filter @mc-admin/bds-bots... install" >&2
  exit 1
fi

if can_load "$PKG_DIR"; then
  echo "[bds] raknet-native already loadable ($PKG_DIR)"
  exit 0
fi

echo "[bds] building raknet-native in $PKG_DIR…"
export CC="${CC:-gcc}"
export CXX="${CXX:-g++}"
export FORCE_BUILD=1
(cd "$PKG_DIR" && npm run install)

can_load "$PKG_DIR" || {
  echo "[bds] raknet-native still not loadable after build" >&2
  exit 1
}
echo "[bds] raknet-native OK"
