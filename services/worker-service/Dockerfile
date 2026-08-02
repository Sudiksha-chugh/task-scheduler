FROM node:20-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
COPY services/worker-service/package.json ./services/worker-service/
RUN npm ci --workspace=services/worker-service --include-workspace-root

FROM base AS runner
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY services/worker-service ./services/worker-service
WORKDIR /app/services/worker-service
USER node
CMD ["node", "index.js"]
