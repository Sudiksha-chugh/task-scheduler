# JobFlow — MERN Job Scheduling & Workflow Orchestration Platform

A MERN + JavaScript re-architecture of a FlowForge-style platform: multi-tenant job scheduling, cron dispatch, DAG workflows, and real-time monitoring — built entirely on the Node.js/JS ecosystem instead of Spring Boot/Java/Next.js.

---

## 1. Tech Stack Mapping

| Layer | FlowForge (Java) | JobFlow (MERN + JS) | Purpose |
|---|---|---|---|
| Language | Java 21 | Node.js 20+ (JavaScript, or TS if desired) | Runtime |
| API Framework | Spring Boot | Express.js (or Fastify) | REST API, DI-lite via modules |
| Database | PostgreSQL + JPA | MongoDB + Mongoose | Durable state storage |
| Migrations | Flyway | migrate-mongo | Schema/seed versioning |
| Messaging | Kafka (Redpanda) | Redis Streams **or** BullMQ (Redis-backed queues) | Async execution events, job queue |
| Cache / rate limit | Valkey (Redis) | Redis (ioredis) | Rate limiting, fast counters, worker liveness |
| Auth | Spring Security + JWT | jsonwebtoken + bcrypt + Passport (optional) | Auth & authorization |
| Scheduling | Custom cron poller | node-cron / Agenda / BullMQ repeatable jobs | Cron & one-shot dispatch |
| Realtime | SSE | Socket.IO **or** native SSE via Express | Live monitoring stream |
| Frontend Framework | Next.js 16 / React 19 | Vite + React 18 (or Next.js if SSR wanted) | SPA/console |
| Workflow Editor | ReactFlow | React Flow (same lib, framework-agnostic) | Visual DAG builder |
| Charts | Recharts | Recharts | Analytics dashboards |
| Data Fetching | TanStack Query | TanStack Query | Server state/caching |
| Forms | React Hook Form + Zod | React Hook Form + Zod | Same — fully portable |
| Styling | Tailwind v4 | Tailwind v4 | Same |
| Code Editor | Monaco | Monaco Editor (@monaco-editor/react) | JSON/body editing |
| Testing | JUnit + Testcontainers | Jest/Vitest + Supertest + `mongodb-memory-server` / Testcontainers-node | Unit & integration tests |
| Build | Maven | npm workspaces / Turborepo | Monorepo build orchestration |

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

| Guarantee | FlowForge approach | JobFlow (MERN) approach |
|---|---|---|
| Exactly-once dispatch | PostgreSQL conditional updates + fencing tokens | MongoDB `findOneAndUpdate` with `status: PENDING` filter (atomic CAS) + fencing token field |
| Outbox pattern | Transactional outbox table + Kafka | Mongo `outbox_events` collection written in the same operation (use Mongo transactions on a replica set) + a poller that publishes to BullMQ |
| Optimistic concurrency | `@Version` columns | Mongoose `versionKey` (`__v`) with `optimisticConcurrency: true` |
| Lease protocol | Heartbeated worker leases | Redis key `lease:{executionId}` with `PX` TTL; worker renews via `PEXPIRE`; scheduler reclaims on expiry |
| Dead-letter queue | DEAD status + manual retry | BullMQ's built-in `failed` queue + custom `DEAD` status in Mongo |
| Idempotent triggers | Idempotency key check | `Idempotency-Key` header hashed and stored with unique Mongo index |

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

## 9. Notes on Trade-offs vs. the Java Version

- **MongoDB vs PostgreSQL**: you lose native multi-row ACID joins across collections, but Mongo 5+ transactions on a replica set give you enough atomicity for the outbox + execution-state pattern above. Model relationships with `ObjectId` refs and populate as needed.
- **BullMQ vs Kafka**: BullMQ is simpler to run locally (just Redis) and gives you retries/backoff/dead-letter out of the box, but it isn't a durable append-only log — fine for a job orchestrator, less fine if you need Kafka-style replay/consumer groups at scale.
- **Socket.IO vs SSE**: Socket.IO is easier for bidirectional real-time in Express; plain SSE (`res.write` with `text/event-stream`) is a closer 1:1 match to FlowForge's `/monitoring/stream` if you want to keep it unidirectional and simple.
- **Testing**: `mongodb-memory-server` + `ioredis-mock` (or real Testcontainers-node with Docker) mirror FlowForge's Testcontainers-based integration suite.

---

## 10. CI/CD Pipeline

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

---

## 11. Cursor Prompts — Build It Step by Step

Paste these into Cursor **in order**, one at a time, letting it finish and verify each step before moving to the next. Each prompt assumes Cursor has the full blueprint above in context (paste this whole file into the repo root as `BLUEPRINT.md` first, so Cursor can reference it).

### Step 0 — Bootstrap the monorepo
```
Read BLUEPRINT.md in this repo. Set up an npm workspaces monorepo matching the
"Project Structure" section exactly: root package.json with workspaces for
services/api-service, services/worker-service, services/scheduler-service,
services/event-processor, packages/event-contracts, packages/test-support,
and frontend. Add a docker-compose.yml with mongo:7 and redis:7-alpine services
with named volumes and healthchecks. Add a root .eslintrc, .prettierrc, and
.gitignore for Node + React. Do not implement any business logic yet — just
the skeleton, empty package.json per workspace, and folder structure.
```

### Step 1 — API service: models + config
```
In services/api-service, implement the Mongoose schemas from BLUEPRINT.md
section 4 (Tenant, User, Project, Job, Execution, WorkflowDefinition,
OutboxEvent) plus ApiKey and WorkerCapability models to match the entity
relationships diagram. Add src/config/db.js (mongoose connect with retry),
src/config/redis.js (ioredis client), and src/config/env.js (validate env
vars with zod, matching the .env.example in section 8). Add optimisticConcurrency
where noted. Do not write controllers yet.
```

### Step 2 — API service: auth
```
Implement JWT auth in services/api-service: POST /api/v1/auth/login,
/auth/refresh, /auth/logout per the API Reference in BLUEPRINT.md. Use
bcrypt for password hashing, jsonwebtoken for access/refresh tokens. Add
middleware/auth.js (verifies JWT, attaches req.user), and
middleware/tenantScope.js (enforces req.user.tenant matches resource tenant
on every query). Write Jest unit tests for the auth service with mocked
Mongoose models.
```

### Step 3 — API service: core CRUD (projects, jobs, executions, workflows, api keys)
```
Implement the remaining controllers/services/routes in services/api-service
for Projects, Jobs, Executions, Workflows, and ApiKeys exactly matching the
"Core API Endpoints" table in BLUEPRINT.md section 6. Enforce RBAC
(OWNER/ADMIN/DEVELOPER/VIEWER) per route. Apply tenantScope middleware
everywhere. Add express-validator or zod request validation on all POST/PUT
bodies. Return consistent error shapes via a global error-handling middleware.
```

### Step 4 — Outbox pattern
```
Implement the transactional outbox in services/api-service/src/outbox/:
1) a helper that writes an OutboxEvent document inside the same Mongo
   session/transaction as any state-changing write (e.g. job trigger,
   execution creation), 2) a poller (src/outbox/publisher.js) that reads
   unpublished OutboxEvent docs every N ms, pushes them onto a BullMQ queue
   named "execution-queue", and marks them published. Wire this poller to
   start when the API service boots. Add an integration test using
   mongodb-memory-server that verifies: writing a job trigger produces
   exactly one outbox event, and the poller publishes it to a mocked queue.
```

### Step 5 — Worker service
```
Implement services/worker-service per BLUEPRINT.md architecture: a BullMQ
worker consuming "execution-queue". On each job: 1) attempt to claim the
lease via Redis SET NX PX with a fencing token, skip if already leased,
2) update Execution status to LEASED then RUNNING, 3) dispatch the HTTP
request to job.targetUrl using axios with the configured method/headers/body
/timeout, 4) publish a result to a "result-queue" BullMQ queue, 5) send a
heartbeat (Redis key with TTL, refreshed every 10s while running). Handle
timeouts and network errors as FAILED results, not thrown exceptions.
```

### Step 6 — Scheduler service
```
Implement services/scheduler-service: a node-cron (or Agenda) based poller
that 1) every 30s queries Jobs with scheduleType=CRON, enabled=true, and
nextRunAt <= now, creates a PENDING Execution + outbox event for each, and
advances nextRunAt using the cron-parser library, 2) every 15s scans for
Redis lease keys that have expired without a corresponding SUCCESS/FAILED
result and reclaims them by resetting the Execution to PENDING and
re-enqueuing. Add unit tests for the cron-to-nextRunAt calculation and the
stale-lease reclaim logic.
```

### Step 7 — Event processor + DAG workflow execution
```
Implement services/event-processor: a BullMQ worker consuming "result-queue".
On each result: 1) update the Execution and append an attempt record,
2) apply the retry policy from BLUEPRINT.md (exponential/linear/fixed) if
FAILED and retries remain, else mark DEAD, 3) if the execution belongs to a
WorkflowRun node, implement the fan-out/fan-in logic from BLUEPRINT.md
section 7: check if all predecessor nodes succeeded, enqueue newly-unblocked
downstream nodes, and mark the WorkflowRun SUCCESS/FAILED when all nodes are
terminal. Add integration tests covering: a 2-node linear workflow, a
fan-out to 3 parallel nodes, and a fan-in that waits for all predecessors.
```

### Step 8 — Realtime monitoring stream
```
Add GET /api/v1/monitoring/stream to api-service as an SSE endpoint (or
Socket.IO namespace if preferred) that broadcasts execution status changes,
worker heartbeats, and queue depth. Have event-processor and worker-service
publish these events to a Redis pub/sub channel; have the API service
subscribe and forward to connected SSE/socket clients, scoped per tenant.
Add GET /api/v1/monitoring/workers (worker heartbeat snapshot from Redis)
and GET /api/v1/monitoring/queues (BullMQ queue depth via bullmq's
Queue.getJobCounts()).
```

### Step 9 — Frontend scaffold
```
Scaffold the frontend/ Vite + React app per BLUEPRINT.md project structure:
pages (Dashboard, Projects, Jobs, JobEditor, Workflows, Executions, Workers,
Analytics, Settings), providers (AuthProvider, QueryProvider, SocketProvider),
services/ (axios clients per resource matching the API endpoints), and a
Tailwind v4 design system with Button, Card, Badge, Dialog, StatusBadge,
Skeleton, MetricCard components. Set up React Router, TanStack Query, and
protected routes that redirect to /login when unauthenticated.
```

### Step 10 — Frontend: Jobs + Executions pages
```
Build the Jobs list/create/edit pages and Executions explorer in the
frontend, wired to the real api-service endpoints via TanStack Query.
Jobs page: sortable/paginated table (EntityTable component), create/edit
form with React Hook Form + Zod validation matching the Job schema, Monaco
editor for the request body JSON. Executions page: filterable table by
status/job/date, expandable row showing per-attempt timeline (attempt
number, status, duration, error).
```

### Step 11 — Frontend: Workflow builder
```
Build the Workflows page using React Flow: a canvas where users add job
nodes, connect them into a DAG, and the UI validates for cycles before
allowing save (reject on cycle detected). On save, POST the ReactFlow
nodes/edges JSON to /api/v1/projects/:projectId/workflows as the
`definition` field. Add a "Trigger" button that POSTs to the trigger
endpoint and a live view of the current WorkflowRun's node statuses,
updating via the SSE/socket connection from Step 8.
```

### Step 12 — Tests + CI/CD wiring
```
Set up Jest configs per workspace, add npm scripts `test:unit` and
`test:integration` per BLUEPRINT.md section 10.6. Create
.github/workflows/ci.yml, cd-staging.yml, and cd-production.yml exactly as
specified in BLUEPRINT.md section 10.2–10.4. Add a Dockerfile per backend
service matching section 10.5, and a frontend Dockerfile (multi-stage:
npm run build, then serve via nginx). Verify `npm run build --workspaces`
and `docker compose up` both succeed locally before finishing.
```

### Tips for using the section 11 prompts with Cursor
- Keep BLUEPRINT.md in the repo and reference it by name in every prompt — Cursor will re-read it as ground truth instead of drifting.
- After each step, ask Cursor to run the relevant tests before moving on (`Run the tests for services/api-service and fix any failures before continuing`).
- If Cursor's output diverges from a table/schema in the blueprint, paste the specific section back in rather than re-explaining from memory — keeps token usage down and accuracy up.
- Steps 4–7 (outbox, worker, scheduler, event-processor) are the trickiest — the exactly-once/lease/DAG logic is where bugs hide. Worth asking Cursor to write the integration tests *before* the implementation for those steps if you want tighter guarantees.

---

## 12. Beginner Track — Simpler Path if You're New to This

The 12-step plan in section 11 assumes comfort with Express, Mongo, Redis, and distributed-systems concepts (leases, fencing tokens, outbox pattern). If you're newer to backend dev, building all of that at once will produce code you can't debug when something breaks. Do this instead:

**Strategy: build a working MVP first, then layer in the distributed-systems parts.**

MVP scope (skip for now): multi-tenancy, RBAC, outbox pattern, leases/fencing tokens, DAG workflows, SSE. You'll add these back in Part B once the basics work end to end.

MVP scope (build first): one user, one API, one job type (HTTP call on a schedule), a simple queue, and a basic UI to see it running. This alone teaches you Express, Mongo, and a job queue — the real foundations.

### Part A — MVP (do these in order, and actually run the app after each one)

**A1 — Just the API, no queue, no frontend yet**
```
I'm a beginner. Create a simple Express + MongoDB API called "jobflow-api"
with ONE model, Job: { name, targetUrl, httpMethod, cronExpression, enabled,
createdAt }. Give me routes: GET /jobs, POST /jobs, GET /jobs/:id,
PUT /jobs/:id, DELETE /jobs/:id. Use Mongoose. Add a .env.example with
MONGO_URI and PORT. Explain in comments what each file does, since I'm
learning. Keep it as simple as possible — no auth, no folders beyond
routes/models/index.js for now.
```
👉 After this, run it, open MongoDB Compass or `mongosh`, and create a job with Postman/curl. Confirm you can see it saved. Don't move on until this works and you understand what POST /jobs actually does.

**A2 — Add a scheduler that actually fires jobs**
```
Add node-cron to jobflow-api. Every job with a cronExpression and enabled:true
should get dispatched: use axios to call job.targetUrl with job.httpMethod.
Log the result (status code, or error) to the console for now — no database
changes yet. Explain how node-cron's schedule works and how it's different
from a normal setInterval.
```
👉 Set a job with cron `* * * * *` (every minute) pointing at a free test endpoint like `https://httpbin.org/post`. Watch your console log a request every minute. This is the core loop of the whole system — make sure you get why it works before adding complexity.

**A3 — Record execution history**
```
Add an Execution model: { job (ref to Job), status (PENDING/SUCCESS/FAILED),
httpStatusCode, errorMessage, ranAt }. When the cron dispatcher runs a job,
create an Execution document with the result. Add GET /executions and
GET /jobs/:id/executions routes. Explain what a Mongoose ref/populate is and
show me an example of fetching a job with its executions.
```
👉 Check MongoDB — you should now see a growing list of Execution documents each time a job fires. This is your audit trail.

**A4 — A queue instead of calling axios directly (this is the "why BullMQ" moment)**
```
I want to understand job queues. Refactor jobflow-api so the cron scheduler
doesn't call axios directly — instead it adds a job to a BullMQ queue called
"execution-queue" (Redis-backed). Create a separate worker.js file (run with
`node worker.js` in its own terminal) that consumes the queue, does the
axios call, and saves the Execution result. Explain, in plain terms, why
splitting this into "scheduler enqueues" + "worker processes" is useful
compared to A2's approach — what problem does it solve?
```
👉 Run `node index.js` (API) and `node worker.js` (worker) in two terminals. Watch jobs flow from one process to the other via Redis. This is the actual concept behind FlowForge's worker pool — now you'll understand it instead of just copying it.

**A5 — Basic React frontend**
```
Create a simple Vite + React frontend for jobflow-api: a page listing jobs
(fetched from GET /jobs) with a form to create a new job, and a page
listing executions (GET /executions) showing status and timestamp. No auth,
no design system yet — plain HTML elements with minimal Tailwind. Use
fetch or axios, no TanStack Query yet since I'm still learning React state.
Explain how useEffect + useState work together for the data fetching.
```
👉 You now have a working, understandable, end-to-end system: create a job in the UI → cron fires it → worker executes it → execution shows up in the UI.

**A6 — Retries**
```
Add retry logic to the worker: if the HTTP call fails, retry up to 3 times
with exponential backoff (BullMQ supports this natively — show me the
config option instead of writing manual retry loops). If all retries fail,
mark the Execution as DEAD. Explain what BullMQ's attempts and backoff
options actually do under the hood.
```

### Part B — Level up toward the full FlowForge design (only after Part A works and you understand it)

Once Part A is solid, go back to section 11's steps 0–12, but tell Cursor explicitly:
```
I already have a working MVP (jobflow-api with cron → BullMQ → worker →
executions → basic React UI). Now refactor/extend it toward the full
architecture in BLUEPRINT.md: add multi-tenancy and auth, the outbox
pattern, worker leases with fencing tokens, and DAG workflows. Do ONE of
these at a time and explain what problem each one solves before writing
code.
```

### General beginner tips for working with Cursor

- **Commit to git after every working step.** `git add -A && git commit -m "A1: basic job CRUD API"`. If Cursor breaks something in the next step, you can diff or revert instead of losing progress.
- **Ask "explain what you just did" after every generation**, before running it. If you can't paraphrase the explanation back in one sentence, ask again with "explain it more simply."
- **Run the code yourself, don't just trust it compiled.** Actually POST a job, actually watch the worker log. Bugs in cron expressions, env vars, and Mongo connection strings are extremely common and only show up at runtime.
- **When something breaks, paste the exact error into Cursor** rather than describing it from memory — error messages usually contain the fix.
- **Don't let Cursor add packages you don't recognize.** If it suggests a library you've never heard of, ask it to explain why before accepting.
- **Keep each prompt scoped to one file or one feature.** The moment a single prompt touches 5+ files, it gets hard to review — which defeats the point of learning as you go.

---