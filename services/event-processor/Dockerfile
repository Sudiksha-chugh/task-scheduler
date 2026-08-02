FROM node:20-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
COPY services/event-processor/package.json ./services/event-processor/
RUN npm ci --workspace=services/event-processor --include-workspace-root

FROM base AS runner
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY services/event-processor ./services/event-processor
WORKDIR /app/services/event-processor
USER node
CMD ["node", "index.js"]
