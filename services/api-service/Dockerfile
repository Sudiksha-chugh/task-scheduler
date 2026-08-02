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
