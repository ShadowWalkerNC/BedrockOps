#!/bin/sh
set -eu
cd /app
echo "[entrypoint-worker] starting worker…"
exec pnpm --filter @mc-admin/worker start
