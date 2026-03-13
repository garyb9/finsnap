# monorepo-template

Monorepo starter with a minimal TypeScript backend and a Next.js frontend, wired together with Turborepo, Docker, and Docker Compose.

This README is written so that **a new human or LLM agent** can quickly understand the layout and start adding new apps or packages without guessing.

---

## 1. High-level architecture

- **Root**: Yarn workspaces + Turborepo orchestrating all apps.
- **Backend** (`apps/backend`):
  - Node + TypeScript + Express.
  - Single `/health` endpoint returning `{ status: "ok", timestamp: "<ISO>" }`.
  - Designed to be extended into a real API or service.
- **Frontend** (`apps/frontend`):
  - Next.js App Router + TypeScript.
  - Single page that polls the backend `/health` every 3 seconds and shows timestamp, response, and latency.
  - Designed to be extended into a full UI.

Everything runs together via `yarn dev` (local) or `docker compose up --build` (Docker).

---

## 2. Repository layout

```text
monorepo-template/
├── apps/
│   ├── backend/              # Express backend with /health
│   └── frontend/             # Next.js App Router frontend
├── packages/                 # Shared libraries (empty, .gitkeep)
├── data/                     # Data files (JSON, CSV, etc.)
├── scripts/                  # Standalone utility scripts
├── docker-compose.yml        # Backend + frontend (+ optional Redis/Postgres)
├── turbo.json                # Turborepo pipeline configuration
├── tsconfig.base.json        # Shared TS compiler options
├── tsconfig.json             # Root TS config (for tools)
├── eslint.config.mjs         # ESLint 9 flat config
├── .prettierrc               # Prettier config
└── package.json              # Root workspace + scripts
```

If you are an LLM/agent, **treat each directory under `apps/` or `packages/` as an independent project** with its own `package.json` and `tsconfig.json`, but **never change the root workspace wiring unless explicitly asked**.

---

## 3. Getting started

```bash
git clone <repo-url> my-project
cd my-project
yarn install
```

### 3.1 Run everything in dev (Docker)

```bash
cp apps/backend/.env.example apps/backend/.env
cp apps/frontend/.env.example apps/frontend/.env
docker compose up --build
```

- **Backend**: `http://localhost:4000/health`
- **Frontend demo**: `http://localhost:3000`

The frontend calls the backend `/health` every 3 seconds and shows:

- When the request was sent.
- When the response was received.
- How long it took (ms).
- The backend’s own timestamp and status.

### 3.2 Run locally without Docker

In one terminal:

```bash
yarn dev
```

This runs both apps in parallel via Turborepo:

- Backend on `http://localhost:4000`
- Frontend on `http://localhost:3000`

You can also run an individual app:

```bash
yarn workspace @monorepo/backend dev
yarn workspace @monorepo/frontend dev
```

---

## 4. Root workspace scripts

From the repo root:

```bash
yarn dev      # turbo run dev --parallel (all apps)
yarn build    # turbo run build
yarn lint     # turbo run lint
yarn format   # turbo run format
yarn test     # turbo run test
yarn ci       # turbo run ci (build + lint + test)
```

As a convention, **each app** exposes at least:

- `dev` – local dev mode.
- `build` – production build.
- `start` – run the built app (for Docker / production).
- `lint`, `format`, `test`, `ci` – optional but recommended.

When adding a new app or package, follow this pattern in its own `package.json`.

---

## 5. Backend details (`apps/backend`)

- Entry: `apps/backend/src/index.ts`.
- Exposes `GET /health` that returns:

```json
{ "status": "ok", "timestamp": "<ISO8601>" }
```

- Default port is `4000` (configurable via `PORT`).
- Logging uses Winston (`apps/backend/src/logger.ts`) with `LOG_LEVEL` from env.

Environment example: `apps/backend/.env.example`.

Docker:

- Multi-stage build defined in `apps/backend/Dockerfile`.
- Uses `turbo prune --docker` to only copy what the backend needs from the monorepo.

---

## 6. Frontend details (`apps/frontend`)

- Next.js App Router entry: `apps/frontend/src/app/page.tsx`.
- Uses a client-side polling loop (`fetch`) against:

```text
${process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"}/health
```

- Displays a simple table:
  - Incrementing poll number.
  - Request + completion timestamps.
  - Duration in ms.
  - Backend `status` and `timestamp`.
  - Any error if the call fails.
  - **Styled with `styled-components`** rather than raw class-based markup.

Environment example: `apps/frontend/.env.example`:

```bash
NEXT_PUBLIC_API_URL=http://localhost:4000
```

Docker:

- `apps/frontend/Dockerfile`: production build using `turbo prune` + Next.js `output: "standalone"`.
- `apps/frontend/Dockerfile.dev`: lightweight dev image used by `docker-compose.yml`.

---

## 7. Docker & Docker Compose

Basic commands:

```bash
docker compose up --build
docker compose down
docker compose logs -f

# Prune (reclaim disk space)
docker system prune -f
docker system prune -a --volumes -f
```

Services in `docker-compose.yml`:

- **backend** – builds from `apps/backend/Dockerfile`, exposes `4000:4000`, has a `/health`-based healthcheck.
- **frontend** – builds from `apps/frontend/Dockerfile.dev`, exposes `3000:3000`, depends on `backend`, and uses `NEXT_PUBLIC_API_URL=http://backend:4000`.
- **db (PostgreSQL)** – commented scaffold.
- **redis** – commented scaffold.

To enable PostgreSQL:

1. Uncomment the `db` service and `postgres_data` volume.
2. Set `POSTGRES_URL` in `apps/backend/.env`.

To enable Redis:

1. Uncomment the `redis` service and `redis_data` volume.
2. Set `REDIS_URL` in `apps/backend/.env`.

---

## 8. Extending the monorepo (for humans and agents)

### 8.1 Adding a new app

1. Create a new folder under `apps/`, e.g. `apps/worker`.
2. Add a `package.json` with at least `name`, `version`, and `scripts` (`dev`, `build`, `start`).
3. Add a `tsconfig.json` that `extends: "../../tsconfig.base.json"`.
4. Add source files under `apps/worker/src`.
5. Optionally update `turbo.json` if you need custom pipelines.

Yarn workspaces pick it up automatically as long as it is under `apps/*`.

### 8.2 Adding a shared package

1. Create `packages/<name>` with its own `package.json`.
2. Add TS source under `packages/<name>/src`.
3. Reference it from apps with `@monorepo/<name>` (or another prefix you prefer).

---

## 9. Deployment notes (Vercel / VPS)

- **Frontend (Vercel)**:
  - Set the project root to `apps/frontend`.
  - Use `yarn install` as the install command.
  - Use `yarn workspace @monorepo/frontend build` as the build command.
  - Next.js will detect `output: "standalone"` and generate a production bundle suitable for Docker or serverless hosting.

- **Backend (VPS / container)**:
  - Build `apps/backend` image using `apps/backend/Dockerfile`.
  - Configure environment (`PORT`, `LOG_LEVEL`, `POSTGRES_URL`, `REDIS_URL` as needed).
  - Run the container behind your reverse proxy / load balancer.

---

## 10. Requirements

- Node >= 22.0.0  
- Yarn >= 1.22.0
