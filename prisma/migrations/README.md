# Prisma migrations (PostgreSQL)

This folder holds the migration history for `prisma/schema.prisma`.
The app targets PostgreSQL for both local development and production.

## Create a new migration

After editing `schema.prisma`, generate and apply a migration against
your dev database:

```bash
npm run prisma:migrate -- --name <short_name>
```

That writes a new SQL file under `prisma/migrations/` — commit it to git.

## Apply migrations (CI / production)

```bash
npm run prisma:deploy
```

This is run automatically by the Docker entrypoint
(`docker/entrypoint.sh`) at container start, using the `DATABASE_URL`
injected from `k8s/20-app-secret.yaml`.
