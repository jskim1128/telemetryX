# PostgreSQL migrations

This folder holds the production (PostgreSQL) migration history for
`prisma/schema.postgres.prisma`. It is **separate** from `prisma/migrations/`,
which is the SQLite history used by local development.

## Generate the initial Postgres migration

Run this once against a reachable Postgres (local Docker, port-forwarded
StatefulSet, or any throwaway DB). Replace the URL as appropriate:

```bash
# Example: local Docker Postgres
docker run --rm -d -p 5432:5432 \
  -e POSTGRES_USER=feat \
  -e POSTGRES_PASSWORD=pw \
  -e POSTGRES_DB=feattracking \
  postgres:16-alpine

DATABASE_URL="postgresql://feat:pw@localhost:5432/feattracking?schema=public" \
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
`k8s/20-app-secret.yaml`.
