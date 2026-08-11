#!/bin/sh
set -eu
cd /app
echo "[entrypoint-api] prisma migrate…"
pnpm --filter @mc-admin/db db:migrate
echo "[entrypoint-api] starting API on :${PORT:-4000}"
exec pnpm --filter @mc-admin/api start
