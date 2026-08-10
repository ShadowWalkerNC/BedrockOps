#!/usr/bin/env bash
# Ensure the optional raknet-native addon is built.
# bedrock-protocol's createClient currently requires it at import time for ping.
#
# Usage: ./scripts/bds/ensure-raknet-native.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

resolve_pkg() {
  node -e "console.log(require('path').dirname(require.resolve('raknet-native/package.json')))" 2>/dev/null \
    || node -e "console.log(require('path').dirname(require.resolve('raknet-native/package.json',{paths:['$ROOT/packages/bds-bots']})))" 2>/dev/null \
    || find "$ROOT/node_modules/.pnpm" -path '*/raknet-native@*/node_modules/raknet-native/package.json' 2>/dev/null | head -1 | xargs -r dirname
}

if node -e "require('raknet-native')" 2>/dev/null \
  || node -e "require('raknet-native')" 2>/dev/null --input-type=commonjs 2>/dev/null; then
  # Try from package context
  if (cd "$ROOT/packages/bds-bots" && node -e "require('raknet-native')"); then
    echo "[bds] raknet-native already loadable"
    exit 0
  fi
fi

if (cd "$ROOT/packages/bds-bots" && node -e "require('raknet-native')" 2>/dev/null); then
  echo "[bds] raknet-native already loadable"
  exit 0
fi

PKG_DIR="$(resolve_pkg)"
if [[ -z "${PKG_DIR:-}" || ! -d "$PKG_DIR" ]]; then
  echo "[bds] raknet-native package not found — run: pnpm --filter @mc-admin/bds-bots... install" >&2
  exit 1
fi

echo "[bds] building raknet-native in $PKG_DIR…"
export CC="${CC:-gcc}"
export CXX="${CXX:-g++}"
export FORCE_BUILD=1
(cd "$PKG_DIR" && npm run install)
(cd "$ROOT/packages/bds-bots" && node -e "require('raknet-native'); console.log('[bds] raknet-native OK')")
