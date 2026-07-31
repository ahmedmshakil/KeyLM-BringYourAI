import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Docs - KeyLM',
  description: 'Project documentation for the KeyLM hybrid free-tier and BYOK chat app.'
};

const toc = [
  { id: 'overview', label: 'Overview' },
  { id: 'quickstart', label: 'Quick Start' },
  { id: 'environment', label: 'Environment' },
  { id: 'flow', label: 'User Flow' },
  { id: 'architecture', label: 'Architecture' },
  { id: 'structure', label: 'Project Structure' },
  { id: 'api', label: 'API Endpoints' },
  { id: 'data', label: 'Data Model' },
  { id: 'ux', label: 'UX Behavior' },
  { id: 'security', label: 'Security' },
  { id: 'edge-cases', label: 'Edge Cases' },
  { id: 'testing', label: 'Testing' },
  { id: 'roadmap', label: 'Roadmap' }
];

const quickStartSteps = [
  {
    title: 'Install dependencies',
    code: 'npm install'
  },
  {
    title: 'Create the environment file',
    code: 'cp .env.example .env\n# set DATABASE_URL, APP_AUTH_SECRET, APP_ENCRYPTION_KEY, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, GROQ_API_KEY, MIMO_API_KEY'
  },
  {
    title: 'Generate an encryption key',
    code: `node -e "console.log(Buffer.from(require('crypto').randomBytes(32)).toString('base64'))"`
  },
  {
    title: 'Run database migrations',
    code: 'npm run prisma:migrate'
  },
  {
    title: 'Start the dev server',
    code: 'npm run dev'
  }
];

const highlights = [
  {
    title: 'Hybrid Access',
    description: 'Signed-in users can choose shared Groq Free or Xiaomi MiMo Pro models before or alongside personal keys.'
  },
  {
    title: 'Model Catalog',
    description: 'Models are normalized across providers and cached for 24 hours per user.'
  },
  {
    title: 'Streaming Chat',
    description: 'Server-sent events deliver token deltas with stop and retry safety.'
  },
  {
    title: 'Threaded History',
    description: 'Threads persist provider, model, settings, message history, and token usage.'
  }
];

const architectureModules = [
  {
    title: 'Auth and sessions',
    description: 'Supabase passwordless email auth with Magic Links/OTP and signed, httpOnly app session cookies.'
  },
  {
    title: 'Key management',
    description: 'Provider keys are stored encrypted, masked in UI, and audited.'
  },
  {
    title: 'Provider adapters',
    description: 'OpenAI, Gemini, Anthropic, Groq, and Xiaomi MiMo adapters normalize models, streaming, and usage.'
  },
  {
    title: 'Model service',
    description: 'Model lists are cached per key and refreshed on demand.'
  },
  {
    title: 'Thread service',
    description: 'Threads and messages are persisted with idempotent request IDs.'
  },
  {
    title: 'Shared-catalog quotas',
    description: 'Per-user and global daily counters gate all shared Groq Free and Xiaomi MiMo Pro requests.'
  }
];

const projectStructure = [
  {
    title: 'src/app',
    description: 'App Router pages and API route handlers.'
  },
  {
    title: 'src/lib',
    description: 'Core services, providers, crypto, auth, and utilities.'
  },
  {
    title: 'prisma',
    description: 'Database schema and migrations.'
  },
  {
    title: 'src/app/globals.css',
    description: 'Shared theme and component styles.'
  }
];

const endpointGroups = [
  {
    title: 'Auth',
    items: [
      { method: 'POST', path: '/api/auth/register', description: 'Send a Supabase passwordless signup Magic Link or OTP.' },
      { method: 'POST', path: '/api/auth/login', description: 'Send a Supabase passwordless login Magic Link or OTP.' },
      { method: 'POST', path: '/api/auth/verify-otp', description: 'Verify an email OTP and start the app session.' },
      { method: 'GET', path: '/auth/callback', description: 'Handle Magic Link callback, sync the user, and start the app session.' },
      { method: 'POST', path: '/api/auth/logout', description: 'Clear the session cookie.' },
      { method: 'GET', path: '/api/auth/me', description: 'Return the current session user.' },
      { method: 'POST', path: '/api/auth/password-reset/request', description: 'Legacy password reset endpoint; passwordless auth does not require it.' },
      { method: 'POST', path: '/api/auth/password-reset/confirm', description: 'Legacy password reset confirmation endpoint.' }
    ]
  },
  {
    title: 'Provider keys',
    items: [
      { method: 'POST', path: '/api/providers/:provider/keys', description: 'Validate and store a new key.' },
      { method: 'GET', path: '/api/providers/:provider/keys', description: 'List keys for a provider.' },
      {
        method: 'POST',
        path: '/api/providers/:provider/keys/:keyId/validate',
        description: 'Re-validate a stored key.'
      },
      { method: 'DELETE', path: '/api/providers/:provider/keys/:keyId', description: 'Revoke a key.' }
    ]
  },
  {
    title: 'Models',
    items: [
      {
        method: 'GET',
        path: '/api/providers/:provider/models',
        description: 'Return cached models, with optional refresh=true.'
      },
      {
        method: 'POST',
        path: '/api/providers/:provider/models/refresh',
        description: 'Force a model refresh and update cache.'
      }
    ]
  },
  {
    title: 'Free usage',
    items: [
      {
        method: 'GET',
        path: '/api/usage/free',
        description: 'Return the current shared-catalog model list and user/global quota snapshot.'
      }
    ]
  },
  {
    title: 'Threads and messages',
    items: [
      { method: 'POST', path: '/api/threads', description: 'Create a BYOK or shared KeyLM Free/Pro thread.' },
      { method: 'GET', path: '/api/threads', description: 'List threads for the user.' },
      { method: 'GET', path: '/api/threads/:threadId', description: 'Get a thread and its messages.' },
      { method: 'DELETE', path: '/api/threads/:threadId', description: 'Delete a thread.' },
      {
        method: 'POST',
        path: '/api/threads/:threadId/messages',
        description: 'Send a message, stream SSE deltas, and persist token usage.'
      }
    ]
  }
];

const dataModels = [
  {
    title: 'User',
    fields: 'id, email, passwordHash?, supabaseUserId, lastLoginAt, createdAt'
  },
  {
    title: 'ProviderKey',
    fields: 'provider, keyCiphertext, keyMask, status, lastValidatedAt, lastUsedAt'
  },
  {
    title: 'ProviderModelCache',
    fields: 'provider, keyId, models, fetchedAt, expiresAt'
  },
  {
    title: 'Thread',
    fields: 'provider, model, systemPrompt, settings, status, updatedAt'
  },
  {
    title: 'Message',
    fields: 'threadId, role, content, providerMessageId, clientRequestId, metadata.usage'
  },
  {
    title: 'AuditLog',
    fields: 'action, provider, keyId, metadata, createdAt'
  },
  {
    title: 'PasswordResetToken',
    fields: 'tokenHash, expiresAt, usedAt'
  },
  {
    title: 'UserDailyFreeUsage',
    fields: 'userId, day, count'
  },
  {
    title: 'GlobalDailyFreeUsage',
    fields: 'day, count'
  }
];

export default function DocsPage() {
  return (
    <main className="container docs">
      <section className="docs-hero">
        <div>
          <span className="badge">Docs</span>
          <h1>KeyLM Project Documentation</h1>
          <p>
            KeyLM is a hybrid free-tier and BYOK multi-provider chat app built with Next.js App Router,
            Prisma, and Postgres. This page documents the product flow, backend APIs, and data model in one place.
          </p>
          <div className="hero-actions">
            <Link className="button" href="/app">
              Open the App
            </Link>
            <Link className="button secondary" href="/">
              Back Home
            </Link>
          </div>
        </div>
        <nav className="card docs-toc" aria-label="Documentation sections">
          <h3>On this page</h3>
          {toc.map((item) => (
            <a key={item.id} href={`#${item.id}`} className="docs-toc-link">
              {item.label}
            </a>
          ))}
        </nav>
      </section>

      <section id="overview" className="card docs-section">
        <h2>Overview</h2>
        <p className="tagline">
          A single workspace where users can start on a shared Groq free pool, then move to their own
          OpenAI, Gemini, or Anthropic keys.
        </p>
        <div className="docs-grid">
          {highlights.map((item) => (
            <div key={item.title} className="docs-mini">
              <h4>{item.title}</h4>
              <p>{item.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="quickstart" className="card docs-section">
        <h2>Quick Start</h2>
        <div className="docs-steps">
          {quickStartSteps.map((step, index) => (
            <div key={step.title} className="docs-step">
              <h3>
                {index + 1}. {step.title}
              </h3>
              <pre>
                <code>{step.code}</code>
              </pre>
            </div>
          ))}
        </div>
      </section>

      <section id="environment" className="card docs-section">
        <h2>Environment</h2>
        <p className="tagline">Required variables for local development and production.</p>
        <dl className="docs-kv">
          <div>
            <dt>DATABASE_URL</dt>
            <dd>Postgres connection string used by Prisma.</dd>
          </div>
          <div>
            <dt>APP_AUTH_SECRET</dt>
            <dd>HMAC secret for signing session tokens.</dd>
          </div>
          <div>
            <dt>NEXT_PUBLIC_SUPABASE_URL</dt>
            <dd>Supabase project URL used for passwordless Email Auth.</dd>
          </div>
          <div>
            <dt>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</dt>
            <dd>Supabase publishable/anon key used to request Magic Links and verify OTP codes.</dd>
          </div>
          <div>
            <dt>NEXT_PUBLIC_TURNSTILE_SITE_KEY</dt>
            <dd>Cloudflare Turnstile public site key rendered on the passwordless login/register form.</dd>
          </div>
          <div>
            <dt>APP_PUBLIC_BASE_URL</dt>
            <dd>Public app origin used to build the /auth/callback Magic Link redirect URL.</dd>
          </div>
          <div>
            <dt>APP_ENCRYPTION_KEY</dt>
            <dd>32-byte base64 key for encrypting provider secrets.</dd>
          </div>
          <div>
          <dt>GROQ_API_KEY</dt>
          <dd>Server-only API key used for the four shared KeyLM Free Groq models.</dd>
          </div>
          <div>
            <dt>GROQ_BASE_URL</dt>
            <dd>Groq base URL, defaults to https://api.groq.com/openai/v1.</dd>
          </div>
          <div>
            <dt>GROQ_FREE_MODEL</dt>
            <dd>Initial shared Groq model selection and demo model, defaults to moonshotai/kimi-k2-instruct-0905.</dd>
          </div>
          <div>
            <dt>GROQ_FREE_FALLBACK_MODELS</dt>
            <dd>Optional comma-separated Groq fallback models if the primary free model is unavailable.</dd>
          </div>
          <div>
            <dt>MIMO_API_KEY</dt>
            <dd>Server-only Xiaomi MiMo API key used for the shared Pro models.</dd>
          </div>
          <div>
            <dt>MIMO_BASE_URL</dt>
            <dd>Xiaomi MiMo base URL, defaults to https://api.xiaomimimo.com/v1.</dd>
          </div>
          <div>
            <dt>FREE_USER_DAILY_LIMIT</dt>
            <dd>Per-user daily shared-catalog request limit, defaults to 50.</dd>
          </div>
          <div>
            <dt>FREE_GLOBAL_DAILY_LIMIT</dt>
            <dd>Global daily shared-catalog request limit, defaults to 100.</dd>
          </div>
          <div>
            <dt>RATE_LIMIT_PER_MINUTE</dt>
            <dd>Optional request limit for chat and password reset endpoints.</dd>
          </div>
          <div>
            <dt>PASSWORD_RESET_TTL_MINUTES</dt>
            <dd>Legacy password reset TTL. Passwordless OTP/link expiry is configured in Supabase Auth as 900 seconds.</dd>
          </div>
        </dl>
        <p className="tagline">
          Supabase setup: enable Email Auth, add http://localhost:3000/auth/callback and your production callback URL to Auth redirect URLs,
          set Email OTP expiry to 900 seconds, enable Captcha with Cloudflare Turnstile, add TURNSTILE_SECRET_KEY only in Supabase Dashboard,
          and include both the Magic Link and OTP token in the Supabase email template if you want users to choose either method.
        </p>
      </section>

      <section id="flow" className="card docs-section">
        <h2>User Flow</h2>
        <ol className="docs-list">
          <li>Create an account or sign in.</li>
          <li>Choose a KeyLM Free Groq model or Pro Xiaomi MiMo model while daily quota is available.</li>
          <li>Add a provider key and validate it with a lightweight request when you want BYOK mode.</li>
          <li>Load the model list for connected providers and create BYOK threads.</li>
          <li>Send a message and stream responses via SSE.</li>
          <li>Persist assistant output, token usage, and continue the thread.</li>
        </ol>
        <div className="notice-bar">
          Streaming responses use server-sent events from the messages endpoint, with idempotency on requestId.
        </div>
      </section>

      <section id="architecture" className="card docs-section">
        <h2>Architecture</h2>
        <p className="tagline">
          The app is split into route handlers under <code>src/app/api</code> and reusable services under
          <code>src/lib</code>.
        </p>
        <div className="docs-grid">
          {architectureModules.map((item) => (
            <div key={item.title} className="docs-mini">
              <h4>{item.title}</h4>
              <p>{item.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="structure" className="card docs-section">
        <h2>Project Structure</h2>
        <div className="docs-grid">
          {projectStructure.map((item) => (
            <div key={item.title} className="docs-mini">
              <h4>{item.title}</h4>
              <p>{item.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="api" className="card docs-section">
        <h2>API Endpoints</h2>
        {endpointGroups.map((group) => (
          <div key={group.title} className="docs-group">
            <h3>{group.title}</h3>
            <div className="docs-endpoints">
              {group.items.map((item) => (
                <div key={`${item.method}-${item.path}`} className="docs-endpoint">
                  <span className={`docs-method ${item.method.toLowerCase()}`}>{item.method}</span>
                  <div>
                    <p className="docs-endpoint-path">{item.path}</p>
                    <p className="docs-endpoint-desc">{item.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>

      <section id="data" className="card docs-section">
        <h2>Data Model</h2>
        <div className="docs-grid">
          {dataModels.map((model) => (
            <div key={model.title} className="docs-mini">
              <h4>{model.title}</h4>
              <p>{model.fields}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="ux" className="card docs-section">
        <h2>UX Behavior</h2>
        <ul className="docs-list">
          <li>All signed-in users can choose the shared KeyLM Free/Pro catalog while quota remains.</li>
          <li>The shared catalog and BYOK model controls remain available independently.</li>
          <li>Model lists are cached for 24 hours and can be refreshed manually.</li>
          <li>Threads are locked to the provider and model chosen at creation, including shared Groq and Xiaomi MiMo threads.</li>
          <li>After 5 shared requests, the UI shows a reminder that personal keys use a separate provider account.</li>
          <li>Streaming responses show deltas in real time with stop support.</li>
          <li>Each assistant reply shows prompt, output, and total token usage when available.</li>
        </ul>
      </section>

      <section id="security" className="card docs-section">
        <h2>Security</h2>
        <ul className="docs-list">
          <li>Provider keys are encrypted at rest and never returned in plaintext.</li>
          <li>The shared Groq and Xiaomi MiMo keys stay server-side and are never exposed to clients.</li>
          <li>Supabase verifies Magic Links/OTPs; the app then issues its existing signed httpOnly session cookie.</li>
          <li>Rate limiting protects chat streaming and password reset requests.</li>
          <li>Audit logs track key lifecycle events for traceability.</li>
          <li>Model and thread access is scoped to the authenticated user.</li>
        </ul>
      </section>

      <section id="edge-cases" className="card docs-section">
        <h2>Edge Cases</h2>
        <ul className="docs-list">
          <li>A key that was valid can be revoked later; validation endpoints update status.</li>
          <li>If a model refresh fails, cached models are served with a stale flag.</li>
          <li>Duplicate message requests are deduped via clientRequestId.</li>
          <li>Shared-catalog quota resets at 00:00 UTC for both the user bucket and the global pool.</li>
          <li>Rate limits return retryable errors with 429 responses.</li>
        </ul>
      </section>

      <section id="testing" className="card docs-section">
        <h2>Testing</h2>
        <ul className="docs-list">
          <li>Unit: provider adapters, crypto helpers, and validation schemas.</li>
          <li>Integration: provider routing, quota reservation, model caching, and thread persistence.</li>
          <li>E2E: use KeyLM Free and Pro models, exhaust, quota, connect a key, stream chat, and save history.</li>
          <li>Security: verify secrets never leak to logs or responses.</li>
        </ul>
      </section>

      <section id="roadmap" className="card docs-section">
        <h2>Roadmap</h2>
        <ul className="docs-list">
          <li>Tool calling and structured output support.</li>
          <li>Vision attachments with capability gating.</li>
          <li>Usage analytics and per-model cost reporting.</li>
          <li>Team workspaces with shared key vaults.</li>
        </ul>
      </section>
    </main>
  );
}
