# PostgreSQL migrations

This folder holds the production (PostgreSQL) migration history for
`prisma/schema.postgres.prisma`. It is **separate** from `prisma/migrations/`,
which is the SQLite history used by local development.

## Generate the initial Postgres migration

Run this once against any reachable Postgres (local Docker via
`docker-compose up -d postgres`, a throwaway DB, or the production
host at `10.91.26.224`). Replace the URL as appropriate:

```bash
# Example A: local Docker Postgres (via docker-compose.yml)
DATABASE_URL="postgresql://feat:featpass@localhost:5432/feattracking?schema=public" \
  npm run prisma:migrate:prod -- --name init

# Example B: production host (10.91.26.224)
DATABASE_URL="postgresql://postgres:sandisk-telemetryx@10.91.26.224:5432/postgres?schema=public" \
  npm run prisma:migrate:prod -- --name init
```

That command writes a new SQL file under `prisma/migrations-postgres/` —
commit it to git.

## Apply migrations in production

Handled automatically by the Docker entrypoint
(`docker/entrypoint.sh`), which runs:

```
prisma migrate deploy --schema=prisma/schema.postgres.prisma
```

at container start, using the `DATABASE_URL` injected from
`k8s/20-app-secret.yaml` (which points at the external Postgres on
`10.91.26.224`).
