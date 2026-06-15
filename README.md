# Feature Tracking

A web app for tracking usage of your other apps. Built on the
[Sakai-React](https://github.com/primefaces/sakai-react) admin template
with a Next.js API layer, Prisma + PostgreSQL persistence (external DB
host), and Kubernetes manifests for the application tier.

## Features

- **Three tracking categories**: app opens, feature triggers, tags
- **Per-app API keys** (hashed at rest, shown once at creation/rotation)
- **Dashboard** with trends, KPIs, top apps, top features, departments
- **App Detail** page with charts, recent events, and a *Show App ID & API Key* dialog
- **Register App** page for developers to initialize a tracked app
- **Search** across all registered apps
- Postgres persistence on a dedicated external host (`10.91.26.224`), so
  tracking data is fully decoupled from the Kubernetes app lifecycle.

---

## Tracking API

All three endpoints require:
- Header `x-api-key: <plaintext key>`
- JSON body with **required `email`**

### POST `/api/track/app-opened`
```json
{ "email": "jane@company.com", "department": "Finance", "sessionId": "s-1", "metadata": { "version": "1.2.0" } }
```

### POST `/api/track/feature`
```json
{ "email": "jane@company.com", "featureName": "export_csv", "department": "Finance" }
```

### POST `/api/track/tag`
```json
{ "email": "jane@company.com", "tag": "beta-tester", "department": "Finance" }
```

Responses: `202 { "ok": true }` on success, `400` validation error, `401` invalid key, `403` deactivated app.

---

## API key lifecycle

1. Register an app → server generates a key like `ft_a1b2c3d4...`, stores
   only `sha256(key)` and the first 12 chars as a display prefix, returns
   the full key in the response **once**.
2. The developer copies and stores the key in their app's secret config.
3. Their app sends `x-api-key: <key>` on every tracking call.
4. If lost, use **Rotate API Key** on the App Detail page — generates a new
   key (shown once) and invalidates the old one immediately.

The full key is never recoverable from the database. This prevents key
exposure if the DB is ever dumped.

---

## Local development

Requires: Node 20+, Docker (for Postgres), Git.

```bash
# 1. start Postgres
docker-compose up -d postgres

# 2. install deps and set env
cp .env.example .env
npm install

# 3. apply schema
npx prisma migrate dev --name init

# 4. start the app
npm run dev
# open http://localhost:3000
```

To run the full stack containerized locally:
```bash
docker-compose up --build
```

---

## Docker

A multi-stage `docker/Dockerfile` produces a small image with Next.js
standalone output and Prisma client. The entrypoint runs
`prisma migrate deploy` before starting the server.

```bash
docker build -f docker/Dockerfile -t telemetryx:latest .
docker run --rm -p 3000:3000 \
  -e DATABASE_URL='postgres://feat:featpass@host.docker.internal:5432/feattracking' \
  telemetryx:latest
```

---

## Kubernetes deployment

Manifests in `k8s/`:

| File | Resource |
|---|---|
| `00-namespace.yaml` | `Namespace: telemetryx` |
| `20-app-secret.yaml` | `Secret: app-secrets` (DATABASE_URL → external Postgres on 10.91.26.224) |
| `21-app-configmap.yaml` | Non-secret env (NODE_ENV, PORT, …) |
| `22-app-deployment.yaml` | App `Deployment` (2 replicas) |
| `23-app-service.yaml` | `Service: telemetryx-app` (ClusterIP, port 80) |
| `24-app-ingress.yaml` | Optional `Ingress` (placeholder host) |

> The PostgreSQL database is no longer hosted inside the cluster. It runs
> on a dedicated VM at `10.91.26.224:5432`; the previous
> `10-postgres-secret.yaml`, `11-postgres-service.yaml`, and
> `12-postgres-statefulset.yaml` manifests have been removed.

### Deploy

```bash
# 1. build & push the image to a registry your cluster can pull from
docker build -f docker/Dockerfile -t <registry>/telemetryx:<tag> .
docker push <registry>/telemetryx:<tag>

# 2. edit k8s/22-app-deployment.yaml -> image: <registry>/telemetryx:<tag>
# 3. edit k8s/20-app-secret.yaml with the real DATABASE_URL for 10.91.26.224
# 4. edit k8s/24-app-ingress.yaml -> host

# 5. apply manifests
kubectl apply -f k8s/00-namespace.yaml
kubectl apply -f k8s/
```

### Persistence

Tracking data is stored in PostgreSQL on the dedicated host
`10.91.26.224:5432`. Persistence, backups, and upgrades of the database
are owned by that host — **not** by Kubernetes — so app rollouts in the
cluster never touch the data. To rotate the DB credentials or move the
DB elsewhere, update `DATABASE_URL` in `k8s/20-app-secret.yaml` and
re-apply the secret.

### Rolling out app upgrades

```bash
docker build -f docker/Dockerfile -t <registry>/telemetryx:<new-tag> .
docker push <registry>/telemetryx:<new-tag>
kubectl -n telemetryx set image deploy/telemetryx-app app=<registry>/telemetryx:<new-tag>
kubectl -n telemetryx rollout status deploy/telemetryx-app
```

Migrations run from the container entrypoint (`prisma migrate deploy`) on
each pod start; the command is idempotent.

---

## Project structure

```
.
├── app/                       # Sakai-React App Router shell + pages
│   └── (main)/
│       ├── page.tsx           # Dashboard
│       └── apps/
│           ├── page.tsx       # All apps (search + DataTable)
│           ├── register/      # Register an app
│           └── [id]/          # App detail (Show Credentials dialog)
├── layout/                    # Sakai layout components (pruned menu)
├── pages/api/                 # All HTTP APIs (Next Pages router)
│   ├── apps/                  # Admin: list/register/get/update/rotate-key
│   ├── stats/                 # Aggregations for the dashboard
│   └── track/                 # Tracking endpoints (require x-api-key)
├── lib/                       # prisma client, apiKey, validation, auth, stats
├── prisma/                    # schema.prisma + migrations
├── docker/                    # Dockerfile + entrypoint
├── k8s/                       # Kubernetes manifests
├── docker-compose.yml         # Local dev convenience
└── README.md
```

---

## Built on

- [Sakai-React](https://github.com/primefaces/sakai-react) (MIT) — UI shell, theme, Chart.js
- [PrimeReact](https://primereact.org) — components
- [Next.js 13](https://nextjs.org) — App Router (UI) + Pages Router (APIs)
- [Prisma](https://prisma.io) + [PostgreSQL](https://postgresql.org)
