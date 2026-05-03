# Local & Docker Run Guide

[← Back to main README](../README.md)

This guide explains how to run KeyLM on your machine using either a normal local Node.js workflow or the full Docker Compose stack.

## Requirements

### For local development

- Node.js 20 or newer recommended
- npm
- PostgreSQL database
  - A local PostgreSQL database, or
  - Supabase Postgres connection strings

### For Docker

- Docker
- Docker Compose plugin

## Environment setup

Create your local environment file:

```bash
cp .env.example .env
```



Generate a valid `APP_ENCRYPTION_KEY`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Generate a strong `APP_AUTH_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

> `GROQ_API_KEY` is only required if you want the shared **KeyLM Free** fallback to work.

## Run locally

### 1. Install dependencies

```bash
npm install
```

### 2. Generate Prisma client

Usually this runs automatically after install through `postinstall`, but you can run it manually:

```bash
npm run prisma:generate
```

### 3. Run database migrations

For local development:

```bash
npm run prisma:migrate
```

For an already managed database where you only want to apply existing migrations:

```bash
npm run prisma:deploy
```

### 4. Start the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), create an account, and start chatting.

## Run with Docker Compose

The repository includes a local-development Docker setup for the full stack:

- `db` — PostgreSQL 16 Alpine
- `app` — Next.js dev server with live reload

### 1. Prepare `.env`

For a quick boot, you can skip this step and run Docker Compose directly. The compose file includes safe local-development defaults and automatically points Prisma to the bundled `db` service.

For working login, Turnstile, or the shared Groq free tier, create a real `.env` from the Docker-specific example and fill in the same values described in `.env.example`:

```bash
cp .env.docker.example .env
```




Optional Docker Compose variables:

```env
POSTGRES_DB="keylm"
POSTGRES_USER="postgres"
POSTGRES_PASSWORD="postgres"
POSTGRES_PORT="5432"
APP_PORT="3000"
```

> In Docker, `DATABASE_URL` and `DIRECT_URL` are overridden by `docker-compose.yml` so the app can connect to the internal `db` service.
> The Docker image is for local development only; it runs `prisma generate`, applies existing migrations, and starts `next dev` automatically.

### 2. Start the whole stack

```bash
docker compose up --build
```

This command will:

1. Start PostgreSQL.
2. Wait until the database is healthy.
3. Build the local dev app image.
4. Generate Prisma client and apply existing migrations inside the app container.
5. Run the Next.js dev server with live reload on [http://localhost:3000](http://localhost:3000).

### 3. Stop the stack

```bash
docker compose down
```

### 4. Reset everything, including the database volume

```bash
docker compose down -v
```

Use this only when you intentionally want to delete the local Docker database data.

## Useful commands

```bash
npm run dev              # Start local development server
npm run build            # Build production app
npm run start            # Start production server after build
npm run prisma:generate  # Generate Prisma client
npm run prisma:migrate   # Create/apply local Prisma migrations
npm run prisma:deploy    # Apply existing migrations in production
```

## Troubleshooting

### Prisma cannot connect to the database

- Check `DATABASE_URL` and `DIRECT_URL`.
- Make sure your database is running.
- If using Supabase, verify that your password and project reference are correct.

### Supabase login does not redirect correctly

- Add `http://localhost:3000/auth/callback` to Supabase Auth redirect URLs.
- Make sure `APP_PUBLIC_BASE_URL="http://localhost:3000"` for local development.

### Turnstile error on login/register

- Set `NEXT_PUBLIC_TURNSTILE_SITE_KEY` in `.env`.
- Add the Turnstile secret key in Supabase Dashboard Captcha settings, not in frontend env.
