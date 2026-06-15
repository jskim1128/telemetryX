#!/bin/sh
set -e

# Production runs against PostgreSQL — apply the Postgres migration history
# from prisma/migrations-postgres/ using prisma/schema.postgres.prisma.
# Local development (npm run dev) uses SQLite via the default schema and
# never executes this entrypoint.
echo "[entrypoint] Applying Prisma migrations (postgres)…"
node ./node_modules/prisma/build/index.js migrate deploy \
    --schema=prisma/schema.postgres.prisma

echo "[entrypoint] Starting Next.js server on :${PORT:-3000}…"
exec node server.js
