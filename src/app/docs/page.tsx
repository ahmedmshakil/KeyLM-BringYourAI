import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Docs - KeyLM',
  description: 'Project documentation for the KeyLM BYOK chat app.'
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
    code: 'cp .env.example .env\n# set DATABASE_URL, APP_AUTH_SECRET, APP_ENCRYPTION_KEY'
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
    title: 'BYOK Key Vault',
    description: 'Keys are validated on add and encrypted at rest with AES-256-GCM.'
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
    description: 'Threads persist provider, model, settings, and message history.'
  }
];

const architectureModules = [
  {
    title: 'Auth and sessions',
    description: 'Email and password auth with signed, httpOnly session cookies.'
  },
  {
    title: 'Key management',
    description: 'Provider keys are stored encrypted, masked in UI, and audited.'
  },
  {
    title: 'Provider adapters',
    description: 'OpenAI, Gemini, and Anthropic adapters normalize models and streaming.'
  },
  {
    title: 'Model service',
    description: 'Model lists are cached per key and refreshed on demand.'
  },
  {
    title: 'Thread service',
    description: 'Threads and messages are persisted with idempotent request IDs.'
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
      { method: 'POST', path: '/api/auth/register', description: 'Create an account and start a session.' },
      { method: 'POST', path: '/api/auth/login', description: 'Authenticate and start a session.' },
      { method: 'POST', path: '/api/auth/logout', description: 'Clear the session cookie.' },
      { method: 'GET', path: '/api/auth/me', description: 'Return the current session user.' },
      { method: 'POST', path: '/api/auth/password-reset/request', description: 'Create a password reset token.' },
      { method: 'POST', path: '/api/auth/password-reset/confirm', description: 'Finish a password reset.' }
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
    title: 'Threads and messages',
    items: [
      { method: 'POST', path: '/api/threads', description: 'Create a new thread.' },
      { method: 'GET', path: '/api/threads', description: 'List threads for the user.' },
      { method: 'GET', path: '/api/threads/:threadId', description: 'Get a thread and its messages.' },
      { method: 'DELETE', path: '/api/threads/:threadId', description: 'Delete a thread.' },
      {
        method: 'POST',
        path: '/api/threads/:threadId/messages',
        description: 'Send a message and stream SSE deltas.'
      }
    ]
  }
];

const dataModels = [
  {
    title: 'User',
    fields: 'id, email, passwordHash, createdAt'
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
    fields: 'threadId, role, content, providerMessageId, clientRequestId'
  },
  {
    title: 'AuditLog',
    fields: 'action, provider, keyId, metadata, createdAt'
  },
  {
    title: 'PasswordResetToken',
    fields: 'tokenHash, expiresAt, usedAt'
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
            KeyLM is a BYOK multi-provider chat app built with Next.js App Router, Prisma, and Postgres.
            This page documents the product flow, backend APIs, and data model in one place.
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
          A single workspace for OpenAI, Gemini, and Anthropic where users keep control of their own keys.
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
            <dt>APP_ENCRYPTION_KEY</dt>
            <dd>32-byte base64 key for encrypting provider secrets.</dd>
          </div>
          <div>
            <dt>RATE_LIMIT_PER_MINUTE</dt>
            <dd>Optional request limit for chat and password reset endpoints.</dd>
          </div>
          <div>
            <dt>PASSWORD_RESET_TTL_MINUTES</dt>
            <dd>Optional TTL for password reset tokens (defaults to 60).</dd>
          </div>
        </dl>
      </section>

      <section id="flow" className="card docs-section">
        <h2>User Flow</h2>
        <ol className="docs-list">
          <li>Create an account or sign in.</li>
          <li>Add a provider key and validate it with a lightweight request.</li>
          <li>Load the model list for the connected provider.</li>
          <li>Select a model and create a new thread.</li>
          <li>Send a message and stream responses via SSE.</li>
          <li>Persist assistant output and continue the thread.</li>
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
          <li>Model dropdown appears only after a provider key is active.</li>
          <li>Model lists are cached for 24 hours and can be refreshed manually.</li>
          <li>Threads are locked to the provider and model chosen at creation.</li>
          <li>Streaming responses show deltas in real time with stop support.</li>
          <li>Key status is surfaced as active, invalid, or revoked.</li>
        </ul>
      </section>

      <section id="security" className="card docs-section">
        <h2>Security</h2>
        <ul className="docs-list">
          <li>Provider keys are encrypted at rest and never returned in plaintext.</li>
          <li>Passwords are hashed with bcrypt and sessions are signed server-side.</li>
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
          <li>Rate limits return retryable errors with 429 responses.</li>
        </ul>
      </section>

      <section id="testing" className="card docs-section">
        <h2>Testing</h2>
        <ul className="docs-list">
          <li>Unit: provider adapters, crypto helpers, and validation schemas.</li>
          <li>Integration: key validation, model caching, and thread persistence.</li>
          <li>E2E: connect key, load models, stream chat, and save history.</li>
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
