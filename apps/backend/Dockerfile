FROM node:22-alpine AS base

RUN corepack enable && corepack prepare yarn@1.22.22 --activate
WORKDIR /app

FROM base AS pruner
RUN apk add --no-cache git
COPY . .
RUN npx turbo@2.8.16 prune --scope=@monorepo/backend --docker

FROM base AS deps
WORKDIR /app
COPY --from=pruner /app/out/json/ ./
RUN yarn install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=pruner /app/out/full/ ./
COPY --from=deps /app/node_modules ./node_modules
RUN yarn workspace @monorepo/backend run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 appuser

COPY --from=builder /app/apps/backend/dist ./dist
COPY --from=builder /app/apps/backend/package.json ./package.json
COPY --from=deps /app/node_modules ./node_modules
COPY apps/backend/docker-entrypoint.sh ./docker-entrypoint.sh

RUN chmod +x docker-entrypoint.sh

USER appuser

EXPOSE 4000
ENV PORT=4000

ENTRYPOINT ["sh", "docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]

