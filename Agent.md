
Multi-Provider BYOK Chat App (Next.js + Node.js)

App Name : KeyLM-BringYourAI

You are a senior full-stack architect and product engineer. I want to build a web-based chat app similar to ChatGPT/Gemini, but with a key difference:

BYOK (Bring Your Own Key): Users must provide their own API keys.

Once a user sets a valid provider API key, the UI should show a model dropdown (like the screenshot) for that provider.

The user selects a model and chats using that model.

One website supports multiple providers: OpenAI, Google Gemini, Anthropic (future: Groq, etc.)

 I only want business logic + development logic + architecture + API contracts + UX behavior + security + edge cases + test plan + acceptance criteria.

Assume implementation stack:

Next.js (App Router) for frontend

Node.js backend (can be Next.js API routes/Route Handlers OR separate Express/Fastify service—recommend best approach and justify)

DB: recommend (Postgres preferred; propose Prisma if needed)

Deployment: typical VPS/container

1) System Overview (High-level)

Describe a clean architecture for a BYOK multi-provider chat app:

Key management (secure storage + validation)

Provider adapters (OpenAI/Gemini/Anthropic)

Model catalog (fetch, normalize, cache)

Conversation orchestration (streaming + persistence)

UI (provider connect, model dropdown, chat threads)

Include a simple request/response flow narrative:

Add key → validate → fetch models → select model → send chat message → stream response → save history

2) Core Product Requirements
2.1 User Stories

User creates account (or optional guest mode—recommend one).

User selects a provider (OpenAI/Gemini/Anthropic) and pastes API key.

System validates the key with a minimal request.

If valid: provider shows “Connected” + model dropdown populated.

User selects a model and chats (streaming supported).

User can manage multiple providers and switch between them.

User can rotate/delete keys and delete chat history.

2.2 MVP Features

BYOK connect + validate for 3 providers

Model list dropdown per connected provider

Text chat + streaming

Thread list + history

Key management (add, test, delete)

Basic rate limiting + secure logs

2.3 Non-Goals for MVP

List what to exclude initially (vision input, tool calling, team sharing, cost tracking), but keep the design extensible.

3) Business Logic Rules (BYOK)
3.1 Key Lifecycle & Policies

Define rules for:

Add key → validate → store encrypted → use in requests

Masked display (only last 4 chars)

Track: createdAt, lastValidatedAt, lastUsedAt

Key rotation: user can replace key; old key disabled

Never log raw keys; redact in telemetry/errors

3.2 Key Validation Strategy

For each provider, define what “validation” means:

Minimal endpoint call for verification

Error categories:

invalid key / unauthorized

insufficient permissions

rate limited

billing/quota issue

network/timeout

UX mapping: what the user sees for each category

3.3 Data Handling / Privacy Modes

Define a policy:

Store chat history by default vs opt-out “private mode”

User can delete conversations and keys

Retention approach (e.g., no automatic deletion by default)

4) Model Discovery & Dropdown Behavior
4.1 When Models Appear

Only show models if provider is connected and key validated successfully

Otherwise show empty dropdown + call-to-action

4.2 Caching Strategy

Cache model list per (userId, provider, keyId)

TTL rules (e.g., 24h) + manual refresh button

If refresh fails: show last cached models with warning badge

4.3 Model Normalization

Create a normalized internal model object across providers:

id (provider model id)

displayName

provider

capabilities: streaming, vision, tools, json mode

contextWindow (if known)

recommended category (optional)

Describe how to group models in the dropdown:

Recommended / Latest

Fast / Balanced / Reasoning (if applicable)

Vision-capable vs Text-only

4.4 Model Selection Rules

Model locked per thread (recommended) OR allow switching mid-thread

If switching allowed: define how messages are formatted and recorded

Define behavior when a selected model becomes unavailable later

5) Chat Runtime Logic (Unified Conversation Engine)
5.1 Conversation/Thread Model

A thread must store:

provider

model

system prompt (optional)

settings (temperature, max tokens, etc.)

messages array with roles + timestamps

status (active, archived)

5.2 Send Message Flow (Streaming)

Define the exact sequence:

Client sends message with threadId + provider + model + content + stream=true

Server loads encrypted key for that provider

Server builds provider-specific request from normalized messages

Provider returns streaming tokens

Server streams to client via SSE (or WebSocket—recommend one & justify)

Server persists assistant message (chunks + final)

Include:

stop generation

retry last message

idempotency (avoid duplicate assistant responses on retries)

server-side timeouts

5.3 Multi-Provider Differences

Explain how OpenAI vs Gemini vs Anthropic differ in:

message formatting

system prompt handling

safety settings

streaming implementation

tool calling readiness (future)

5.4 Attachments / Vision (Future-ready)

No implementation now, but define how you’d represent:

images in messages

model capability checks (block sending images to text-only model)

6) Backend Architecture (Next.js + Node)

Recommend one:

Next.js Route Handlers for API + background jobs via worker OR

Separate Node service (Fastify/Express) behind Next.js

Justify based on:

streaming reliability

scaling

security isolation (keys)

deployment simplicity

6.1 Modules/Services

Define clear modules:

Auth + user service

Key vault service (encrypt/decrypt, validation)

Provider adapter layer (OpenAI/Gemini/Anthropic)

Model catalog service (cache)

Chat orchestrator service (streaming + persistence)

Audit/logging + redaction middleware

6.2 Data Store

Recommend Postgres schema (Prisma-friendly) and what tables/fields:

users

provider_keys

provider_models_cache

threads

messages

events/audit_logs (optional)

Include indexes and why (userId + provider, threadId sorting, etc.)

7) API Contract (RESTful Endpoints)

Define REST endpoints with request/response shapes (descriptive, not code):

Key Management

POST /api/providers/:provider/keys

POST /api/providers/:provider/keys/:keyId/validate

GET /api/providers/:provider/keys

DELETE /api/providers/:provider/keys/:keyId

Models

GET /api/providers/:provider/models (from cache; can refresh with query flag)

POST /api/providers/:provider/models/refresh

Threads & Messages

POST /api/threads

GET /api/threads

GET /api/threads/:threadId

DELETE /api/threads/:threadId

POST /api/threads/:threadId/messages (supports streaming)

Specify:

auth requirement

expected status codes

error response format (standardized across app)

streaming response type (SSE recommended)

8) Frontend UX Logic (Next.js App Router)
Screens

Landing / Login

Dashboard: providers + key status + connect/disconnect

Chat screen:

left sidebar: threads

top bar: provider selector + model dropdown

main: messages + streaming state

settings drawer (temperature, max tokens)

UI States

No providers connected → show connect CTA

Key invalid → show error + “Fix key” action

Models loading → skeleton + disabled dropdown

Cached models shown → warning if stale

Streaming → stop button + token-by-token rendering

Rate limited → show retry with backoff suggestion

9) Security Checklist (Must be concrete)

Cover:

Encrypt keys at rest (KMS/Secret Manager or strong app-level encryption)

Never expose keys to client after initial submission

Redact secrets in logs and errors

Rate limiting (per-user + per-IP)

CSRF protection, secure cookies/JWT, CORS rules

Input validation + XSS prevention in chat rendering

Prevent SSRF via provider adapters (no arbitrary URLs)

Audit trail for key changes (optional)

Also include:

threat model bullets (what can go wrong + mitigation)

10) Edge Cases & Failure Handling

List and define handling for:

Key was valid, later revoked

Model list endpoint fails

Provider outage

Rate limit / quota exceeded

User opens two tabs, key rotated mid-stream

User tries to send image to text-only model (future)

Duplicate message due to refresh/retry

Thread provider mismatch (client bug) → server enforcement

11) Testing Strategy

Unit: provider adapters normalization and error mapping

Integration: key validation, model refresh caching

E2E: connect key → models appear → chat streaming → history saved

Security tests: secret redaction, injection attempts

Load tests: concurrent streaming sessions

12) MVP Plan & Milestones

Provide a practical milestone plan:

Week 1: foundation + DB schema + auth + key vault

Week 2: provider adapters + key validation + model catalog

Week 3: chat threads + streaming + persistence

Week 4: UX polish + tests + security hardening + deployment

13) Acceptance Criteria (Pass/Fail)

Write clear bullets, for example:

When a user adds a valid OpenAI key, model dropdown populates within X seconds

Invalid key never stored; user sees “Unauthorized/Invalid key” message

Keys are masked in UI and never appear in logs

Chat streaming works and can be stopped

Switching provider starts a new thread by default (or defined rule)

Deleting a key prevents further requests using that key

Output Format Requirement

Return your answer as a structured spec with headings exactly matching sections 1–13 above. Keep it practical, production-minded. 