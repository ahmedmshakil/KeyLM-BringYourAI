# KeyLM - Bring Your AI

***Your keys. Your models. Your control.**

A unified chat workspace for OpenAI, Gemini, and Anthropic with a built-in Groq free fallback. Store your API keys securely, switch between providers seamlessly, and chat with streaming responses all in one place.

![KeyLM Dashboard](readmePics/home.png)

## ✨ Features

- **BYOK (Bring Your Own Key)** - Use your own API keys from OpenAI, Gemini, and Anthropic
- **KeyLM Free** - New accounts can use a shared Groq model with daily user/global quotas
- **Encrypted Storage** - Keys are encrypted at rest and never exposed to the client
- **Multi-Provider Support** - Switch between AI providers without losing context
- **Auto Model Discovery** - Automatically fetches and caches available models per provider
- **Token Usage Tracking** - Assistant replies show prompt/output/total token usage when available
- **Smart Upsell Notice** - After 5 free requests, users see a reminder to switch to their own key for better quality

## 🧱 Architecture Overview

KeyLM is a **single Next.js full-stack application**. The UI, API layer, auth, provider integrations, streaming, and persistence live in one codebase.

### Main building blocks

- **Frontend UI**: `src/app/app/page.tsx`
  - Main authenticated workspace
  - Handles login/register/reset flows, provider key management, model selection, threads, and streaming chat UI
- **API routes**: `src/app/api/**`
  - Auth endpoints (`/api/auth/*`)
  - Bootstrap endpoint (`/api/app/bootstrap`)
  - Provider key/model endpoints (`/api/providers/*`)
  - Thread/message endpoints (`/api/threads/*`)
  - Free-tier and demo endpoints
- **Service layer**: `src/lib/services/**`
  - Thread lifecycle
  - Message persistence
  - Provider key validation/storage
  - Model caching
- **Provider adapters**: `src/lib/providers/**`
  - OpenAI, Gemini, Anthropic, and Groq integrations
  - Unified validate/list-models/chat/stream interfaces
- **Security and platform utilities**: `src/lib/**`
  - Signed session cookies
  - AES-256-GCM key encryption
  - Password reset flow
  - DB-backed rate limiting
  - Groq free-tier quota handling
- **Persistence**: `prisma/**`
  - PostgreSQL schema and migrations
  - Stores users, encrypted provider keys, model caches, threads, messages, audit logs, free-tier usage, and rate-limit buckets

### Runtime flow

1. The app boots through `/api/app/bootstrap`
2. Session state is resolved from signed HTTP-only cookies
3. User provider keys are validated and stored encrypted in PostgreSQL
4. Available models are fetched and cached per active key
5. Thread messages are persisted in PostgreSQL
6. Chat responses are streamed back to the client via SSE
7. If no BYOK provider is connected, Groq free-tier fallback can be used when configured

## ⚙️ Environment Variables

### Required

- `DATABASE_URL`
- `DIRECT_URL`
- `APP_AUTH_SECRET`
- `APP_ENCRYPTION_KEY`

### Optional

- `APP_PUBLIC_BASE_URL`
- `RATE_LIMIT_PER_MINUTE`
- `PASSWORD_RESET_TTL_MINUTES`
- `PROVIDER_REQUEST_TIMEOUT_MS`
- `GROQ_API_KEY`
- `GROQ_BASE_URL`
- `GROQ_FREE_MODEL`
- `GROQ_FREE_FALLBACK_MODELS`
- `FREE_USER_DAILY_LIMIT`
- `FREE_GLOBAL_DAILY_LIMIT`

##  Quick Start

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
```

Set the required secrets before starting the app:

- `APP_AUTH_SECRET` for signed auth sessions
- `APP_ENCRYPTION_KEY` for encrypted provider keys
- `GROQ_API_KEY` if you want KeyLM Free enabled

Optional hardening/runtime settings:

- `PASSWORD_RESET_TTL_MINUTES` to change reset-link expiry
- `PROVIDER_REQUEST_TIMEOUT_MS` to cap upstream provider request duration


### 3. Setup database
```bash
npx prisma migrate deploy
```

For local development, you can use:

```bash
npx prisma migrate dev
```

### 4. Run the app
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and create an account to get started. New users can chat on the shared Groq free tier until they connect their own provider key.

## 🐳 Docker Quick Start

This repository now includes a clean production-style Docker setup for the **entire stack**:

- **app**: Next.js standalone production server
- **db**: PostgreSQL
- **migrate**: one-off Prisma migration runner

### 1. Prepare Docker environment

```bash
cp .env.docker.example .env
```

Then set at least:

- `APP_AUTH_SECRET`
- `APP_ENCRYPTION_KEY`

If you want KeyLM Free enabled, also set:

- `GROQ_API_KEY`

### 2. Start the whole project

```bash
docker compose up --build
```

This single command will:

1. start PostgreSQL
2. wait until the database is healthy
3. apply Prisma migrations
4. build the Next.js app image
5. run the app on [http://localhost:3000](http://localhost:3000)

### 3. Stop the stack

```bash
docker compose down
```

### 4. Reset everything including database volume

```bash
docker compose down -v
```

### Docker files included

- `Dockerfile` — multi-stage app image build
- `docker-compose.yml` — app + db + migration orchestration
- `.dockerignore` — optimized build context
- `.env.docker.example` — local Docker env template



## 🏗️ Tech Stack

- **Frontend**: Next.js 16 (App Router), React, TypeScript
- **Backend**: Next.js API Routes
- **Database**: PostgreSQL with Prisma ORM
- **Auth**: Custom JWT-based authentication
- **Encryption**: AES-256-GCM for API key storage
- **Streaming**: Server-Sent Events (SSE)

## 👨‍💻 Author

** Shakil Ahmed**

- GitHub: [@ahmedmshakil](https://github.com/ahmedmshakil)
