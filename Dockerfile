# syntax=docker/dockerfile:1.7

# Local development image for KeyLM.
# Use with `docker compose up --build` to run Next.js dev server + local Postgres.
FROM node:20-bookworm-slim

WORKDIR /app

ENV NODE_ENV=development \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1 \
    WATCHPACK_POLLING=true \
    CHOKIDAR_USEPOLLING=true

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && chown -R node:node /app

USER node

# Install dependencies first so Docker can cache this layer between source edits.
COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node prisma ./prisma
RUN npm ci

# Source is copied for `docker build`; docker-compose also bind-mounts the
# project directory for live reload during local development.
COPY --chown=node:node . .

EXPOSE 3000

# One-command local startup:
# 1. regenerate Prisma client for the mounted source
# 2. apply existing migrations to the local compose database
# 3. start Next.js dev server on all interfaces so the host can access it
CMD ["sh", "-c", "npm run prisma:generate && npm run prisma:deploy && npm run dev -- --hostname 0.0.0.0 --port 3000"]
