#!/bin/sh
set -e

echo "[entrypoint] Applying Prisma migrations…"
node ./node_modules/prisma/build/index.js migrate deploy

echo "[entrypoint] Starting Next.js server on :${PORT:-3000}…"
exec node server.js
