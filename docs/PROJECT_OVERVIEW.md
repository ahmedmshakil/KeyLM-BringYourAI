# Project Goals & Architecture

[← Back to main README](../README.md)

This document explains what KeyLM is trying to solve, the main product goals, and how the application is structured internally.

## Project goal

KeyLM aims to be a simple, secure, multi-provider AI chat workspace where users can:

- Start chatting immediately through a shared Groq-powered free tier.
- Bring their own OpenAI, Gemini, or Anthropic API keys.
- Keep provider keys encrypted and private.
- Discover available models automatically.
- Save chat threads, messages, settings, and token usage.
- Move from free usage to full BYOK control without changing tools.

## Problem solved

AI users often manage multiple provider dashboards, API keys, model names, and chat histories separately. This creates friction and security risk.

KeyLM solves that by providing:

- **One workspace** for multiple AI providers.
- **Secure key vault behavior** with encrypted storage and masked display.
- **Unified model discovery** across providers.
- **Persistent conversation history** across BYOK and free-tier threads.
- **Streaming chat UX** without exposing provider keys to the browser.
- **Free-to-BYOK onboarding** so new users can try the app before adding a key.

## High-level architecture

KeyLM is a single full-stack Next.js application.

```text
Browser UI
   ↓
Next.js App Router pages
   ↓
Next.js API route handlers
   ↓
Service layer
   ↓
Provider adapters + Prisma/PostgreSQL
```

Main building blocks:

- **Frontend UI** — `src/app/app/page.tsx`
  - Auth screens
  - Provider key management
  - Model selection
  - Thread list
  - Streaming chat interface
- **API routes** — `src/app/api/**`
  - Auth endpoints
  - App bootstrap
  - Provider keys/models
  - Threads/messages
  - Usage/free-tier endpoints
- **Service layer** — `src/lib/services/**`
  - Thread lifecycle
  - Message persistence
  - Provider key validation/storage
  - Model caching
  - Usage dashboard/free-tier logic
- **Provider adapters** — `src/lib/providers/**`
  - OpenAI
  - Gemini
  - Anthropic
  - Groq
  - Shared provider interfaces for validation, model listing, chat, and streaming
- **Persistence** — `prisma/**`
  - PostgreSQL schema
  - Prisma migrations
  - User, key, model cache, thread, message, audit, quota, and rate-limit tables
- **Platform utilities** — `src/lib/**`
  - Signed session cookies
  - AES-256-GCM encryption
  - Passwordless auth bridge
  - Rate limiting
  - Streaming helpers

## Runtime flow

1. User opens the app.
2. `/api/app/bootstrap` resolves session and initial app state.
3. Supabase handles passwordless Magic Link/OTP verification.
4. KeyLM creates its own signed HTTP-only app session.
5. User can chat with KeyLM Free if Groq fallback is configured and quota is available.
6. User can add a provider API key for BYOK mode.
7. Provider keys are validated, encrypted, masked, and stored in PostgreSQL.
8. Model lists are fetched from provider APIs and cached per user/key.
9. User creates a thread with a provider and model.
10. Messages are sent through `/api/threads/:threadId/messages`.
11. Provider responses stream back to the browser through SSE.
12. Assistant output and token usage are persisted to the database.

## Authentication model

KeyLM uses a hybrid auth approach:

- Supabase verifies email Magic Links and OTP codes.
- The app syncs the Supabase user into its own `User` table.
- The app issues a signed HTTP-only session cookie.
- API routes authorize requests through the app session.

Important files:

- `src/lib/passwordlessAuth.ts`
- `src/app/auth/callback/route.ts`
- `src/app/api/auth/**`
- `src/utils/supabase/**`

## Provider key security

Provider keys are handled as sensitive server-side secrets.

Security behavior:

- Keys are submitted only to server API routes.
- Keys are encrypted with AES-256-GCM before database storage.
- Plaintext keys are never returned to the client.
- UI receives only masked key information.
- Key lifecycle actions are recorded in audit logs.

Important files:

- `src/lib/crypto.ts`
- `src/lib/services/keyService.ts`
- `src/app/api/providers/[provider]/keys/**`

## Provider abstraction

Each provider adapter normalizes provider-specific behavior into shared app concepts:

- Validate key
- List models
- Send chat request
- Stream response deltas
- Normalize token usage where available

Adapters live in:

```text
src/lib/providers/
├── anthropic.ts
├── gemini.ts
├── groq.ts
├── openai.ts
├── types.ts
└── utils.ts
```

## Data model summary

The Prisma schema stores the core app state:

- `User` — app user profile, Supabase user link, session version.
- `ProviderKey` — encrypted API keys, key masks, validation status.
- `ProviderModelCache` — cached model lists per provider/key.
- `Thread` — provider/model-specific chat thread metadata.
- `Message` — user/assistant messages and provider metadata.
- `AuditLog` — key lifecycle and security-relevant actions.
- `PasswordResetToken` — legacy password reset support.
- `UserDailyFreeUsage` — per-user daily Groq free quota.
- `GlobalDailyFreeUsage` — global daily Groq free quota.
- `RateLimitBucket` — DB-backed request rate limiting.

Schema location:

```text
prisma/schema.prisma
```

## Free-tier design

KeyLM Free uses a server-side Groq key controlled by the app owner.

Design goals:

- Let new users try the product without bringing an API key.
- Keep the shared Groq key server-side only.
- Protect costs with per-user and global daily limits.
- Encourage users to switch to their own key after initial exploration.


## Security notes

- Provider API keys are encrypted at rest.
- Shared Groq key is never exposed to browser clients.
- Session cookies are HTTP-only.
- Model, thread, message, and key access is scoped to the authenticated user.
- Rate limiting protects sensitive and expensive endpoints.
- Security headers are configured in `next.config.js`.

## Project structure

```text
src/
├── app/
│   ├── api/          # Route handlers
│   ├── app/          # Authenticated workspace page
│   ├── auth/         # Auth callback route
│   └── docs/         # In-app documentation page
├── lib/
│   ├── client/       # Browser API/SSE helpers
│   ├── providers/    # AI provider adapters
│   ├── services/     # Business logic services
│   └── *.ts          # Auth, crypto, DB, session, rate-limit utilities
├── utils/supabase/   # Supabase browser/server/middleware clients
prisma/
├── schema.prisma     # Database schema
└── migrations/       # Database migrations
```


