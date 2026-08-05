FROM node:20-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
COPY services/api-service/package.json ./services/api-service/
COPY services/worker-service/package.json ./services/worker-service/
COPY services/scheduler-service/package.json ./services/scheduler-service/
COPY services/event-processor/package.json ./services/event-processor/
COPY frontend/package.json ./frontend/
COPY packages/shared/package.json ./packages/shared/
COPY packages/event-contracts/package.json ./packages/event-contracts/
COPY packages/test-support/package.json ./packages/test-support/
RUN npm ci --workspace=services/event-processor --include-workspace-root

FROM base AS runner
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY services/event-processor ./services/event-processor
COPY packages/shared ./packages/shared
WORKDIR /app/services/event-processor
USER node
CMD ["node", "index.js"]
