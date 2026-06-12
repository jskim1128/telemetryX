# Feature Tracking

A web app for tracking usage of your other apps. Built on the
[Sakai-React](https://github.com/primefaces/sakai-react) admin template
with a Next.js API layer, Prisma + PostgreSQL persistence, and Kubernetes
manifests for a stateful deployment.

## Features

- **Three tracking categories**: app opens, feature triggers, tags
- **Per-app API keys** (hashed at rest, shown once at creation/rotation)
- **Dashboard** with trends, KPIs, top apps, top features, departments
- **App Detail** page with charts, recent events, and a *Show App ID & API Key* dialog
- **Register App** page for developers to initialize a tracked app
- **Search** across all registered apps
- Postgres persistence via Kubernetes `StatefulSet` + `PersistentVolumeClaim`
  so tracking data survives every deployment.

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
docker build -f docker/Dockerfile -t feat-tracking:latest .
docker run --rm -p 3000:3000 \
  -e DATABASE_URL='postgres://feat:featpass@host.docker.internal:5432/feattracking' \
  feat-tracking:latest
```

---

## Kubernetes deployment

Manifests in `k8s/`:

| File | Resource |
|---|---|
| `00-namespace.yaml` | `Namespace: feat-tracking` |
| `10-postgres-secret.yaml` | `Secret: postgres-credentials` (change before prod) |
| `11-postgres-service.yaml` | Headless `Service: postgres` for DNS |
| `12-postgres-statefulset.yaml` | `StatefulSet: postgres` + `PVC` (10Gi) |
| `20-app-secret.yaml` | `Secret: app-secrets` (DATABASE_URL) |
| `21-app-configmap.yaml` | Non-secret env (NODE_ENV, PORT, …) |
| `22-app-deployment.yaml` | App `Deployment` (2 replicas) |
| `23-app-service.yaml` | `Service: feat-tracking-app` (ClusterIP, port 80) |
| `24-app-ingress.yaml` | Optional `Ingress` (placeholder host) |

### Deploy

```bash
# 1. build & push the image to a registry your cluster can pull from
docker build -f docker/Dockerfile -t <registry>/feat-tracking:<tag> .
docker push <registry>/feat-tracking:<tag>

# 2. edit k8s/22-app-deployment.yaml -> image: <registry>/feat-tracking:<tag>
# 3. edit k8s/10-postgres-secret.yaml + k8s/20-app-secret.yaml with real passwords
# 4. edit k8s/24-app-ingress.yaml -> host

# 5. apply manifests
kubectl apply -f k8s/00-namespace.yaml
kubectl apply -f k8s/
```

### Persistence guarantee

Tracking data is stored in PostgreSQL, whose data directory is on a
`PersistentVolume` provisioned via the StatefulSet's `volumeClaimTemplates`.
The PV is re-attached to the Postgres pod across restarts, image upgrades,
and redeploys of either the app or the database, so **no data is lost on
deployment**.

To pin a specific StorageClass, set `storageClassName` in
`k8s/12-postgres-statefulset.yaml`.

### Rolling out app upgrades

```bash
docker build -f docker/Dockerfile -t <registry>/feat-tracking:<new-tag> .
docker push <registry>/feat-tracking:<new-tag>
kubectl -n feat-tracking set image deploy/feat-tracking-app app=<registry>/feat-tracking:<new-tag>
kubectl -n feat-tracking rollout status deploy/feat-tracking-app
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
