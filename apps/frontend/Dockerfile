FROM node:22-alpine AS base

RUN corepack enable && corepack prepare yarn@1.22.22 --activate
WORKDIR /app

FROM base AS pruner
RUN apk add --no-cache git
COPY . .
RUN npx turbo@2.8.16 prune --scope=@monorepo/frontend --docker

FROM base AS deps
WORKDIR /app
COPY --from=pruner /app/out/json/ ./
RUN yarn install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=pruner /app/out/full/ ./
COPY --from=deps /app/node_modules ./node_modules
RUN yarn workspace @monorepo/frontend run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

COPY --from=builder /app/apps/frontend/public ./public
COPY --from=builder /app/apps/frontend/.next/static ./apps/frontend/.next/static
COPY --from=builder /app/apps/frontend/.next/standalone ./ 

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "apps/frontend/server.js"]

