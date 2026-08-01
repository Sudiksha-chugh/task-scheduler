# JobFlow — MERN Job Scheduling & Workflow Orchestration Platform

A MERN + JavaScript re-architecture of a FlowForge-style platform: multi-tenant job scheduling, cron dispatch, DAG workflows, and real-time monitoring — built entirely on the Node.js/JS ecosystem instead of Spring Boot/Java/Next.js.

---

## 1. Tech Stack Mapping

| Layer  | JobFlow (MERN + JS) | Purpose |
|---|---|---|
| Language  | Node.js 20+ (JavaScript, or TS if desired) | Runtime |
| API Framework  | Express.js (or Fastify) | REST API, DI-lite via modules |
| Database  | MongoDB + Mongoose | Durable state storage |
| Migrations | migrate-mongo | Schema/seed versioning |
| Messaging  | Redis Streams **or** BullMQ (Redis-backed queues) | Async execution events, job queue |
| Cache / rate limit  | Redis (ioredis) | Rate limiting, fast counters, worker liveness |
| Auth | jsonwebtoken + bcrypt + Passport (optional) | Auth & authorization |
| Scheduling | node-cron / Agenda / BullMQ repeatable jobs | Cron & one-shot dispatch |
| Realtime | Socket.IO **or** native SSE via Express | Live monitoring stream |
| Frontend Framework |  Vite + React 18 (or Next.js if SSR wanted) | SPA/console |
| Workflow Editor |  React Flow (same lib, framework-agnostic) | Visual DAG builder |
| Charts |  Recharts | Analytics dashboards |
| Data Fetching | TanStack Query | Server state/caching |
| Forms |  React Hook Form + Zod | Same — fully portable |
| Styling |  Tailwind v4 | Same |
| Code Editor | Monaco Editor (@monaco-editor/react) | JSON/body editing |
| Testing | Jest/Vitest + Supertest + `mongodb-memory-server` / Testcontainers-node | Unit & integration tests |
| Build | npm workspaces / Turborepo | Monorepo build orchestration |

---

## 2. Architecture

```
┌───────────────────────────────────────────────────────────────────┐
│                          JobFlow Platform                          │
│                                                                     │
│   ┌──────────────────┐      REST / Socket.IO    ┌───────────────┐ │
│   │  React (Vite) UI │ ◄───────────────────────► │  API Service  │ │
│   │  Port: 5173       │                          │ (Express)     │ │
│   └──────────────────┘                           │  Port: 4000   │ │
│                                                    └──────┬────────┘ │
│                                                           │          │
│                                          ┌─────────────────▼───────┐│
│                                          │        MongoDB           ││
│                                          │  - users / tenants       ││
│                                          │  - projects / jobs       ││
│                                          │  - executions / leases   ││
│                                          │  - outbox_events         ││
│                                          │  - workflows              ││
│                                          │  Port: 27017              ││
│                                          └─────────────────┬───────┘│
│                                                           │          │
│                       ┌────────────────────────────────────▼───────┐│
│                       │         Redis (BullMQ + Pub/Sub)            ││
│                       │  Queues: execution-queue, result-queue      ││
│                       │  Port: 6379                                 ││
│                       └────────────┬─────────────────────────────────┘│
│                                    │                                   │
│             ┌───────────────────────▼──────────────────────┐          │
│             │            Worker Service Pool                │          │
│             │  ┌────────┐  ┌────────┐  ┌────────┐          │          │
│             │  │Worker 1│  │Worker 2│  │Worker N│          │          │
│             │  └────────┘  └────────┘  └────────┘          │          │
│             │  - Claims execution leases (BullMQ jobs)       │          │
│             │  - Heartbeats every 10s (Redis TTL keys)       │          │
│             │  - Dispatches HTTP via axios/undici            │          │
│             │  - Emits result events to Redis                │          │
│             └────────────────────────────────────────────────┘          │
│                                                                        │
│   ┌────────────────────┐       ┌────────────────────────────────────┐│
│   │  Scheduler Service  │       │        Event Processor              ││
│   │  - node-cron poller │       │  - Consumes result events           ││
│   │  - Enqueues DAG      │       │  - Persists execution outcomes      ││
│   │    nodes             │       │  - Emits downstream workflow steps  ││
│   │  - Reclaims stale     │       │                                    ││
│   │    leases              │       │                                    ││
│   └────────────────────┘       └────────────────────────────────────┘│
└───────────────────────────────────────────────────────────────────┘
```

**Key substitution:** Kafka's durable log is replaced by **BullMQ** (Redis-backed queues with persistence, retries, delayed jobs, and dead-letter support built in) — this gets you 80% of Kafka's guarantees with far less operational overhead, appropriate for a MERN-scale project. If you want closer Kafka parity, swap in **KafkaJS** against Redpanda directly.

---

## 3. Reliability Guarantees (MERN equivalents)

| Guarantee | JobFlow (MERN) approach |
|---|---|
| Exactly-once dispatch |  MongoDB `findOneAndUpdate` with `status: PENDING` filter (atomic CAS) + fencing token field |
| Outbox pattern |  Mongo `outbox_events` collection written in the same operation (use Mongo transactions on a replica set) + a poller that publishes to BullMQ |
| Optimistic concurrency | Mongoose `versionKey` (`__v`) with `optimisticConcurrency: true` |
| Lease protocol |  Redis key `lease:{executionId}` with `PX` TTL; worker renews via `PEXPIRE`; scheduler reclaims on expiry |
| Dead-letter queue | BullMQ's built-in `failed` queue + custom `DEAD` status in Mongo |
| Idempotent triggers |  `Idempotency-Key` header hashed and stored with unique Mongo index |

---

## 4. Data Models (Mongoose Schemas, sketch)

```js
// models/Tenant.js
const tenantSchema = new Schema({
  name: String,
  slug: { type: String, unique: true },
  createdAt: Date,
}, { timestamps: true });

// models/User.js
const userSchema = new Schema({
  email: { type: String, unique: true },
  passwordHash: String,
  tenant: { type: Schema.Types.ObjectId, ref: 'Tenant' },
  role: { type: String, enum: ['OWNER','ADMIN','DEVELOPER','VIEWER'] },
}, { timestamps: true });

// models/Job.js
const jobSchema = new Schema({
  project: { type: Schema.Types.ObjectId, ref: 'Project', index: true },
  name: String,
  targetUrl: String,
  httpMethod: { type: String, default: 'POST' },
  headers: Object,
  body: Object,
  scheduleType: { type: String, enum: ['CRON','ONE_SHOT','MANUAL'] },
  cronExpression: String,
  timeoutSeconds: { type: Number, default: 30 },
  retryStrategy: { type: String, enum: ['EXPONENTIAL_BACKOFF','LINEAR','FIXED','NONE'] },
  retryMaxAttempts: { type: Number, default: 3 },
  nextRunAt: Date,
  lastRunAt: Date,
  enabled: { type: Boolean, default: true },
}, { timestamps: true, optimisticConcurrency: true });

// models/Execution.js
const executionSchema = new Schema({
  job: { type: Schema.Types.ObjectId, ref: 'Job', index: true },
  status: { type: String, enum: ['PENDING','LEASED','RUNNING','SUCCESS','FAILED','DEAD'], default: 'PENDING' },
  fencingToken: Number,
  retryCount: { type: Number, default: 0 },
  attempts: [{
    httpStatusCode: Number,
    responseBody: String,
    errorMessage: String,
    startedAt: Date,
    finishedAt: Date,
  }],
}, { timestamps: true, optimisticConcurrency: true });

// models/WorkflowDefinition.js
const workflowSchema = new Schema({
  project: { type: Schema.Types.ObjectId, ref: 'Project' },
  name: String,
  definition: Object, // ReactFlow nodes/edges JSON
}, { timestamps: true });

// models/OutboxEvent.js
const outboxSchema = new Schema({
  aggregateType: String,
  aggregateId: Schema.Types.ObjectId,
  eventType: String,
  payload: Object,
  published: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});
```

---

## 5. Project Structure

```
JobFlow/
├── docker-compose.yml           # MongoDB, Redis
├── package.json                 # npm workspaces root
│
├── packages/
│   ├── event-contracts/         # Shared event payload shapes (JS/Zod)
│   └── test-support/            # Shared Jest fixtures
│
├── services/
│   ├── api-service/             # Express REST API
│   │   ├── src/
│   │   │   ├── controllers/     # auth, tenant, project, job, execution, workflow, apikey
│   │   │   ├── services/        # business logic
│   │   │   ├── models/          # Mongoose schemas
│   │   │   ├── middleware/      # auth (JWT), tenant scoping, rate limit
│   │   │   ├── routes/
│   │   │   ├── config/          # db, redis, cors
│   │   │   └── outbox/          # outbox publisher (poller → BullMQ)
│   │   └── index.js
│   │
│   ├── scheduler-service/       # node-cron poller, lease reclaim
│   ├── worker-service/          # BullMQ worker, HTTP dispatch (axios)
│   └── event-processor/         # BullMQ consumer, persists results, advances DAG
│
└── frontend/                    # React (Vite) SPA
    └── src/
        ├── pages/
        │   ├── Dashboard.jsx
        │   ├── Projects.jsx
        │   ├── Jobs.jsx
        │   ├── JobEditor.jsx    # Monaco-powered
        │   ├── Workflows.jsx    # React Flow DAG builder
        │   ├── Executions.jsx
        │   ├── Workers.jsx      # Socket.IO live feed
        │   ├── Analytics.jsx    # Recharts
        │   └── Settings.jsx
        ├── components/
        ├── providers/           # AuthProvider, QueryProvider, SocketProvider
        ├── services/            # axios API clients
        └── lib/
```

---

## 6. Core API Endpoints (same surface as FlowForge)

```
POST   /api/v1/auth/login
POST   /api/v1/auth/refresh

GET    /api/v1/projects
POST   /api/v1/projects/:projectId/jobs
POST   /api/v1/projects/:projectId/jobs/:id/trigger

GET    /api/v1/executions
POST   /api/v1/executions/:id/retry

POST   /api/v1/projects/:projectId/workflows
POST   /api/v1/projects/:projectId/workflows/:id/trigger

GET    /api/v1/monitoring/stream      # Socket.IO or SSE
GET    /api/v1/monitoring/workers
```

---

## 7. DAG Workflow Execution (Node.js logic sketch)

```js
// event-processor: on execution result
async function onExecutionResult(executionId, result) {
  const execution = await Execution.findByIdAndUpdate(
    executionId,
    { status: result.success ? 'SUCCESS' : 'FAILED' },
    { new: true }
  );

  const node = await NodeExecution.findOne({ execution: executionId });
  const run = await WorkflowRun.findById(node.workflowRun);

  const siblings = await NodeExecution.find({ workflowRun: run._id, parentNodeId: node.nodeId });
  // fan-out: enqueue children whose predecessors are ALL complete
  for (const child of getDownstreamNodes(run.definition, node.nodeId)) {
    const predecessorsDone = await allPredecessorsSucceeded(run._id, child.id);
    if (predecessorsDone) await enqueueNodeExecution(run, child);
  }

  if (await allNodesComplete(run._id)) {
    run.status = 'SUCCESS';
    await run.save();
  }
}
```

---

## 8. Quick Start

```bash
git clone <repo>
cd JobFlow
docker compose up -d mongo redis

# API service
cd services/api-service
cp .env.example .env
npm install
npm run dev          # http://localhost:4000

# Worker
cd services/worker-service && npm install && npm run dev

# Scheduler
cd services/scheduler-service && npm install && npm run dev

# Frontend
cd frontend && npm install && npm run dev   # http://localhost:5173
```

**.env (api-service)**
```
MONGO_URI=mongodb://localhost:27017/jobflow
REDIS_URL=redis://localhost:6379
JWT_SECRET=change_me_min_32_chars
PORT=4000
CORS_ORIGIN=http://localhost:5173
```


---

## 9. CI/CD Pipeline

Given the monorepo (npm workspaces) with 4 backend services + 1 frontend, the pipeline needs to build/test each independently but deploy them as separate artifacts.

### 10.1 Pipeline Stages

```
┌────────────┐   ┌───────────────┐   ┌────────────────┐   ┌──────────────┐   ┌────────────┐
│   Lint      │──►│  Unit Tests   │──►│ Integration    │──►│  Build       │──►│  Deploy     │
│ (eslint,    │   │ (jest, per    │   │ Tests (Mongo + │   │  Docker      │   │  (per env)  │
│  prettier)  │   │  workspace)   │   │ Redis service  │   │  images per  │   │             │
│             │   │               │   │ containers)     │   │  service     │   │             │
└────────────┘   └───────────────┘   └────────────────┘   └──────────────┘   └────────────┘
```

Trigger model:
- **PR → `main`**: lint + unit + integration tests only (no build/deploy) — required status check
- **Push → `main`**: full pipeline, build images, deploy to **staging**
- **Tag `v*.*.*`**: build, deploy to **production** (manual approval gate)

### 10.2 GitHub Actions — CI (`.github/workflows/ci.yml`)

```yaml
name: CI

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

jobs:
  lint:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        workspace: [services/api-service, services/worker-service, services/scheduler-service, services/event-processor, frontend]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run lint --workspace=${{ matrix.workspace }}

  unit-tests:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        workspace: [services/api-service, services/worker-service, services/scheduler-service, services/event-processor]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run test:unit --workspace=${{ matrix.workspace }}

  integration-tests:
    runs-on: ubuntu-latest
    services:
      mongo:
        image: mongo:7
        ports: ["27017:27017"]
      redis:
        image: redis:7-alpine
        ports: ["6379:6379"]
    env:
      MONGO_URI: mongodb://localhost:27017/jobflow_test
      REDIS_URL: redis://localhost:6379
      JWT_SECRET: test_secret_min_32_characters_long
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run test:integration --workspace=services/api-service

  frontend-build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run build --workspace=frontend
      - run: npx tsc --noEmit --skipLibCheck --workspace=frontend
        if: false # enable if TS adopted later
```

### 10.3 GitHub Actions — Build & Push Images (`.github/workflows/cd-staging.yml`)

```yaml
name: Deploy Staging

on:
  push:
    branches: [main]

concurrency:
  group: staging
  cancel-in-progress: true

jobs:
  build-and-push:
    if: github.event.workflow_run.conclusion == 'success' || github.event_name == 'push'
    runs-on: ubuntu-latest
    strategy:
      matrix:
        service: [api-service, worker-service, scheduler-service, event-processor]
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v5
        with:
          context: .
          file: services/${{ matrix.service }}/Dockerfile
          push: true
          tags: ghcr.io/${{ github.repository }}/${{ matrix.service }}:${{ github.sha }},ghcr.io/${{ github.repository }}/${{ matrix.service }}:staging
          cache-from: type=gha
          cache-to: type=gha,mode=max

  build-frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v5
        with:
          context: frontend
          push: true
          tags: ghcr.io/${{ github.repository }}/frontend:${{ github.sha }},ghcr.io/${{ github.repository }}/frontend:staging
          build-args: |
            VITE_API_BASE_URL=https://api-staging.jobflow.example.com

  deploy:
    needs: [build-and-push, build-frontend]
    runs-on: ubuntu-latest
    environment: staging
    steps:
      - name: Deploy to staging (example: SSH + docker compose pull/up)
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.STAGING_HOST }}
          username: ${{ secrets.STAGING_USER }}
          key: ${{ secrets.STAGING_SSH_KEY }}
          script: |
            cd /opt/jobflow
            docker compose pull
            docker compose up -d
```

> Swap the deploy step for whatever target you're on: **Kubernetes** (`kubectl set image` / Helm upgrade / ArgoCD sync), **AWS ECS** (`aws ecs update-service --force-new-deployment`), **Render/Railway/Fly.io** (their CLI or GitHub integration), or **Vercel** for the frontend specifically.

### 10.4 Production Deploy (`.github/workflows/cd-production.yml`)

```yaml
name: Deploy Production

on:
  push:
    tags: ["v*.*.*"]

jobs:
  build-and-push:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        service: [api-service, worker-service, scheduler-service, event-processor]
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v5
        with:
          context: .
          file: services/${{ matrix.service }}/Dockerfile
          push: true
          tags: |
            ghcr.io/${{ github.repository }}/${{ matrix.service }}:${{ github.ref_name }}
            ghcr.io/${{ github.repository }}/${{ matrix.service }}:latest

  deploy:
    needs: build-and-push
    runs-on: ubuntu-latest
    environment:
      name: production      # requires manual approval if configured in repo Environments
    steps:
      - name: Deploy to production
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.PROD_HOST }}
          username: ${{ secrets.PROD_USER }}
          key: ${{ secrets.PROD_SSH_KEY }}
          script: |
            cd /opt/jobflow
            docker compose pull
            docker compose up -d --no-deps --build
```

Gate this with a **GitHub Environment** named `production` that requires reviewer approval — that's your manual promotion gate between staging and prod, without needing a separate tool.

### 10.5 Sample Service Dockerfile (`services/api-service/Dockerfile`)

```dockerfile
FROM node:20-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
COPY services/api-service/package.json ./services/api-service/
RUN npm ci --workspace=services/api-service --include-workspace-root

FROM base AS runner
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY services/api-service ./services/api-service
WORKDIR /app/services/api-service
EXPOSE 4000
USER node
CMD ["node", "index.js"]
```

### 10.6 What Each Stage Guards Against

| Stage | Catches |
|---|---|
| Lint | Style drift, unused vars, obvious bugs (eslint) |
| Unit tests | Broken business logic in isolation (mocked Mongo/Redis) |
| Integration tests | Real Mongo transaction/outbox bugs, BullMQ queue wiring issues |
| Docker build | Missing deps, broken Dockerfile, bad build args |
| Staging deploy | Environment-specific config issues before prod exposure |
| Manual approval gate | Human sign-off before customer-facing rollout |

### 10.7 Extras Worth Adding as the Project Matures

- **Dependabot / Renovate** — automated dependency PRs (`.github/dependabot.yml`)
- **CodeQL** — GitHub's built-in SAST scanning (`.github/workflows/codeql.yml`)
- **Semantic release** — auto-version + changelog from Conventional Commits (matches the `feat:`/`fix:` convention already used)
- **Preview environments** — spin up an ephemeral stack per PR (e.g. via Docker Compose on a PR-labeled subdomain) for QA before merge
- **Migration safety check** — a CI job that runs `migrate-mongo up` against a throwaway Mongo container to catch broken migrations before merge
- **Smoke test post-deploy** — hit `/actuator`-style `/health` endpoint after deploy and roll back automatically on failure

