#!/usr/bin/env bash
# Ensure the optional raknet-native addon is built.
# bedrock-protocol's createClient currently requires it at import time for ping.
#
# Usage: ./scripts/bds/ensure-raknet-native.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

NODE="$(node -p 'process.versions.modules')"
PLATFORM="$(node -p 'process.platform')"
ARCH="$(node -p 'process.arch')"

if node -e "require('raknet-native')" 2>/dev/null; then
  echo "[bds] raknet-native already loadable"
  exit 0
fi

echo "[bds] building raknet-native (node ABI $NODE, $PLATFORM-$ARCH)…"
# Prefer g++ — some environments ship a clang++ that cannot find libstdc++ headers.
export CC="${CC:-gcc}"
export CXX="${CXX:-g++}"
export FORCE_BUILD=1

PKG_DIR="$(node -p "require('path').dirname(require.resolve('raknet-native/package.json'))")"
(cd "$PKG_DIR" && npm run install)

node -e "require('raknet-native'); console.log('[bds] raknet-native OK')"
