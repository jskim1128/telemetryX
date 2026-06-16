# syntax=docker/dockerfile:1.6

# ------------------------------------------------------------------
# Stage 1: install dependencies
# ------------------------------------------------------------------
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat openssl
# Enable pnpm via corepack (this project uses pnpm — see pnpm-lock.yaml).
# Pin to pnpm 9.x: pnpm 10+/11+ require node:sqlite which needs Node 22+.
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma
# --ignore-scripts so the postinstall (prisma generate) does NOT run here;
# we run prisma generate explicitly in the builder stage against the prod schema.
# --config.node-linker=hoisted produces a flat npm-style node_modules so the
# runtime stage can COPY node_modules/.prisma, @prisma, prisma directly
# (pnpm's default isolated layout uses symlinks into .pnpm/ which don't
# survive cross-stage COPY cleanly).
RUN pnpm install --frozen-lockfile --ignore-scripts --config.node-linker=hoisted

# ------------------------------------------------------------------
# Stage 2: build
# ------------------------------------------------------------------
FROM node:20-alpine AS builder
RUN apk add --no-cache libc6-compat openssl
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# The app targets PostgreSQL (prisma/schema.prisma) for both dev and prod.
RUN pnpm exec prisma generate
RUN pnpm run build

# ------------------------------------------------------------------
# Stage 3: runtime
# ------------------------------------------------------------------
FROM node:20-alpine AS runner
# `nc` (BusyBox netcat) is bundled with alpine and is used by entrypoint.sh
# to wait for the database to be reachable before running migrations.
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

# Copy Next standalone output
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Copy Prisma artefacts needed at runtime to run migrations
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/prisma ./node_modules/prisma

# Entrypoint runs migrations then starts the server
COPY --chown=nextjs:nodejs docker/entrypoint.sh ./entrypoint.sh
# Strip any CRLF line endings (Windows checkouts) and make executable.
RUN sed -i 's/\r$//' ./entrypoint.sh && chmod +x ./entrypoint.sh

USER nextjs
EXPOSE 3000

CMD ["./entrypoint.sh"]
