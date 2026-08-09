#!/usr/bin/env bash
# Download the official Minecraft Bedrock Dedicated Server (Linux) into var/bds/.
# Fetches from Mojang's published links API (same source as minecraft.net).
#
# Usage (from repo root):
#   ./scripts/bds/download-bds.sh                 # latest stable
#   ./scripts/bds/download-bds.sh --bot-compat    # pin known-good for offline bots
#   ./scripts/bds/download-bds.sh --version 1.26.36.1
#   ./scripts/bds/download-bds.sh --preview
#   ./scripts/bds/download-bds.sh --force
#   BDS_DIR=/custom/path ./scripts/bds/download-bds.sh
#
# Prints BDS_HOME=… and BDS_BIN=… on success.
# Also updates var/bds/active → the installed directory.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PREVIEW=0
FORCE=0
# Known-good pin for @mc-admin/bds-bots + bedrock-protocol@3.58 (client protocol 1.26.30).
BOT_COMPAT_VERSION="1.26.36.1"
PIN_VERSION=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --preview) PREVIEW=1; shift ;;
    --force) FORCE=1; shift ;;
    --bot-compat) PIN_VERSION="$BOT_COMPAT_VERSION"; shift ;;
    --version)
      PIN_VERSION="${2:-}"; shift 2
      if [[ -z "$PIN_VERSION" ]]; then
        echo "[bds] --version requires a value like 1.26.36.1" >&2
        exit 2
      fi
      ;;
    -h|--help)
      sed -n '2,16p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown arg: $1" >&2
      exit 2
      ;;
  esac
done

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "[bds] This script downloads the Linux BDS binary. On macOS/Windows, run it in Linux/WSL/Docker." >&2
  exit 1
fi

ARCH="$(uname -m)"
if [[ "$ARCH" != "x86_64" && "$ARCH" != "amd64" ]]; then
  echo "[bds] Official Linux BDS is x86_64 only (this host is $ARCH)." >&2
  exit 1
fi

DEST_ROOT="${BDS_DIR:-$ROOT/var/bds}"
DOWNLOAD_TYPE="serverBedrockLinux"
CHANNEL_PATH="bin-linux"
if [[ "$PREVIEW" -eq 1 ]]; then
  DOWNLOAD_TYPE="serverBedrockPreviewLinux"
  CHANNEL_PATH="bin-linux-preview"
fi

if [[ -n "$PIN_VERSION" ]]; then
  VERSION="$PIN_VERSION"
  DOWNLOAD_URL="https://www.minecraft.net/bedrockdedicatedserver/${CHANNEL_PATH}/bedrock-server-${VERSION}.zip"
  echo "[bds] using pinned version $VERSION"
else
  LINKS_URL="https://net-secondary.web.minecraft-services.net/api/v1.0/download/links"
  echo "[bds] fetching download links…"
  META_JSON="$(curl -fsSL "$LINKS_URL")"
  DOWNLOAD_URL="$(
    DOWNLOAD_TYPE="$DOWNLOAD_TYPE" python3 -c '
import json, os, sys
want = os.environ["DOWNLOAD_TYPE"]
data = json.load(sys.stdin)
for link in data.get("result", {}).get("links", []):
    if link.get("downloadType") == want:
        print(link["downloadUrl"])
        sys.exit(0)
sys.stderr.write(f"downloadType {want} not found\n")
sys.exit(1)
' <<<"$META_JSON"
  )"
  VERSION="$(basename "$DOWNLOAD_URL" | sed -E 's/^bedrock-server-//; s/\.zip$//')"
fi

ZIP_NAME="bedrock-server-${VERSION}.zip"
INSTALL_DIR="$DEST_ROOT/bedrock-server-$VERSION"
ZIP_PATH="$DEST_ROOT/cache/$ZIP_NAME"

if [[ -x "$INSTALL_DIR/bedrock_server" && "$FORCE" -eq 0 ]]; then
  echo "[bds] already installed: $INSTALL_DIR"
  ln -sfn "$INSTALL_DIR" "$DEST_ROOT/active"
  echo "BDS_HOME=$INSTALL_DIR"
  echo "BDS_BIN=$INSTALL_DIR/bedrock_server"
  exit 0
fi

mkdir -p "$DEST_ROOT/cache"

if [[ ! -f "$ZIP_PATH" || "$FORCE" -eq 1 ]]; then
  echo "[bds] downloading $DOWNLOAD_URL"
  # Mojang's CDN rejects default curl UA / HTTP/2 in some environments.
  curl --http1.1 -fL --retry 5 --retry-delay 2 --retry-all-errors \
    -A 'Mozilla/5.0 (compatible; BedrockOps/1.0; +https://github.com/ShadowWalkerNC/BedrockOps)' \
    -o "$ZIP_PATH.partial" "$DOWNLOAD_URL"
  mv "$ZIP_PATH.partial" "$ZIP_PATH"
fi

echo "[bds] extracting → $INSTALL_DIR"
rm -rf "$INSTALL_DIR"
mkdir -p "$INSTALL_DIR"
unzip -q -o "$ZIP_PATH" -d "$INSTALL_DIR"
chmod +x "$INSTALL_DIR/bedrock_server"

cat > "$INSTALL_DIR/.bedrockops-bds.json" <<EOF
{
  "version": "$VERSION",
  "downloadType": "$DOWNLOAD_TYPE",
  "downloadUrl": "$DOWNLOAD_URL",
  "installedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

ln -sfn "$INSTALL_DIR" "$DEST_ROOT/active"

echo "[bds] installed $VERSION"
echo "BDS_HOME=$INSTALL_DIR"
echo "BDS_BIN=$INSTALL_DIR/bedrock_server"
