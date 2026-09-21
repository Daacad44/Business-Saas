FROM node:22-alpine AS builder
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV PRISMA_GENERATE_SKIP_AUTOINSTALL=1
RUN corepack enable && corepack prepare pnpm@10.15.1 --activate
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json .npmrc ./
COPY apps/web/package.json ./apps/web/
COPY apps/api/package.json ./apps/api/
COPY apps/worker/package.json ./apps/worker/
COPY packages/config/package.json ./packages/config/
COPY packages/types/package.json ./packages/types/
COPY packages/validation/package.json ./packages/validation/
COPY packages/database/package.json ./packages/database/
COPY packages/notifications/package.json ./packages/notifications/
COPY prisma/schema.prisma ./prisma/

RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm --filter @daljir/database generate
RUN pnpm --filter @daljir/worker build

FROM node:22-alpine AS runner
RUN apk add --no-cache libc6-compat openssl
RUN addgroup -S daljir && adduser -S daljir -G daljir
WORKDIR /app

ENV NODE_ENV=production
ENV WORKER_HEALTH_PORT=4100

COPY --from=builder /app ./

WORKDIR /app/apps/worker
USER daljir

EXPOSE 4100

CMD ["node", "--import", "tsx", "src/index.ts"]
