#!/bin/sh
set -e

# The app targets PostgreSQL. Apply the migration history from
# prisma/migrations/ using prisma/schema.prisma. This entrypoint is
# only invoked by the production container; local dev uses `npm run dev`.

# PRISMA="node ./node_modules/prisma/build/index.js"
# SCHEMA="prisma/schema.prisma"
# BASELINE_MIGRATION="0_init"

# # --- 1. Sanity-check DATABASE_URL ---------------------------------------
# if [ -z "$DATABASE_URL" ]; then
#     echo "[entrypoint] ERROR: DATABASE_URL is not set." >&2
#     echo "[entrypoint] Pass it with -e DATABASE_URL=postgres://user:pass@host:5432/db when running docker run," >&2
#     echo "[entrypoint] or use docker-compose which sets it for you." >&2
#     exit 1
# fi

# # --- 2. Wait for the database to be reachable ---------------------------
# # Parse host:port out of the URL (handles both postgres:// and postgresql://).
# # Format: scheme://user:pass@host:port/db?params
# DB_HOSTPORT=$(echo "$DATABASE_URL" | sed -E 's|^[a-z]+://[^@]+@([^/?]+).*$|\1|')
# DB_HOST=$(echo "$DB_HOSTPORT" | cut -d: -f1)
# DB_PORT=$(echo "$DB_HOSTPORT" | cut -d: -f2)
# [ -z "$DB_PORT" ] && DB_PORT=5432

# echo "[entrypoint] Waiting for database at ${DB_HOST}:${DB_PORT}…"
# i=0
# MAX_TRIES=30
# until nc -z "$DB_HOST" "$DB_PORT" 2>/dev/null; do
#     i=$((i + 1))
#     if [ "$i" -ge "$MAX_TRIES" ]; then
#         echo "[entrypoint] ERROR: database ${DB_HOST}:${DB_PORT} unreachable after ${MAX_TRIES}s." >&2
#         echo "[entrypoint] Check that the DB is running and that this container can reach it" >&2
#         echo "[entrypoint] (network, firewall, docker network, VPN, etc.)." >&2
#         exit 1
#     fi
#     sleep 1
# done
# echo "[entrypoint] Database is reachable."

# # --- 3. One-time baseline of an existing schema --------------------------
# # If the target DB already has tables (e.g. created previously via `db push`
# # or by hand) but `_prisma_migrations` is empty, `migrate deploy` will fail
# # with "The database schema is not empty". Detect that case and mark the
# # initial migration as already applied so deploy becomes a no-op for the
# # existing schema. This is safe and idempotent — `migrate resolve` only
# # writes a row to `_prisma_migrations`; it never touches your tables/data.
# echo "[entrypoint] Checking Prisma migration status…"
# STATUS_OUTPUT=$($PRISMA migrate status --schema=$SCHEMA 2>&1 || true)
# echo "$STATUS_OUTPUT"

# case "$STATUS_OUTPUT" in
#     *"P3005"*|*"database schema is not empty"*|*"schema is not empty"*)
#         echo "[entrypoint] Existing schema detected with no migration history."
#         echo "[entrypoint] Baselining by marking '$BASELINE_MIGRATION' as applied…"
#         $PRISMA migrate resolve --schema=$SCHEMA --applied "$BASELINE_MIGRATION"
#         ;;
# esac

# # --- 4. Apply any pending migrations -------------------------------------
# echo "[entrypoint] Applying Prisma migrations (postgres)…"
# $PRISMA migrate deploy --schema=$SCHEMA

# --- 5. Start the app ----------------------------------------------------
echo "[entrypoint] Starting Next.js server on :${PORT:-3000}…"
exec node server.js
