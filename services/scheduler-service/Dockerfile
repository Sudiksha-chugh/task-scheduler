FROM node:20-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
COPY services/scheduler-service/package.json ./services/scheduler-service/
RUN npm ci --workspace=services/scheduler-service --include-workspace-root

FROM base AS runner
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY services/scheduler-service ./services/scheduler-service
WORKDIR /app/services/scheduler-service
USER node
CMD ["node", "index.js"]
