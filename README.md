# KeyLM — Bring Your AI

**Your keys. Your models. Your control.**

KeyLM is a unified AI chat workspace where users can start with a shared Groq-powered free tier, then bring their own OpenAI, Gemini, or Anthropic API keys for full control. It keeps provider keys encrypted, discovers models automatically, saves threaded conversations, and streams responses in real time.

![KeyLM Dashboard](readmePics/home.png)

## ✨ Features

- **BYOK workspace** — connect and use your own OpenAI, Gemini, or Anthropic API keys.
- **KeyLM Free** — new users can chat through a shared Groq fallback with daily quotas.
- **Encrypted key storage** — provider keys are encrypted at rest and never exposed to the client.
- **Multi-provider chat** — switch providers and models without changing apps.
- **Auto model discovery** — fetch and cache model lists per connected provider key.
- **Threaded history** — save conversations, provider/model choices, settings, and token usage.
- **Streaming responses** — receive assistant replies through Server-Sent Events (SSE).
- **Usage visibility** — show prompt/output/total token usage when provider data is available.

## 📚 Documentation

Use the guides below to run, deploy, and understand the project.

<table>
  <tr>
    <td width="33%" align="center">
      <a href="docs/LOCAL_AND_DOCKER_RUN.md">
        <strong>🚀 Local & Docker Run</strong>
      </a>
      <br />
      <sub>Install, configure env, run locally, or start the full Docker stack.</sub>
    </td>
    <td width="33%" align="center">
      <a href="docs/SUPABASE_DEPLOYMENT.md">
        <strong>☁️ Supabase Deployment</strong>
      </a>
      <br />
      <sub>Set up Supabase Postgres/Auth, env variables, redirects, and production deployment.</sub>
    </td>
    <td width="33%" align="center">
      <a href="docs/PROJECT_OVERVIEW.md">
        <strong>🏗️ Goals & Architecture</strong>
      </a>
      <br />
      <sub>Project goal, problem solved, runtime flow, services, data model, and security notes.</sub>
    </td>
  </tr>
</table>

### Quick links

- [Run locally or with Docker](docs/LOCAL_AND_DOCKER_RUN.md)
- [Deploy with Supabase](docs/SUPABASE_DEPLOYMENT.md)
- [Read project goals and architecture](docs/PROJECT_OVERVIEW.md)

## 🧱 Tech Stack

- **Framework**: Next.js 16 App Router
- **Language**: TypeScript
- **UI**: React, CSS modules/global styles
- **Backend**: Next.js Route Handlers
- **Database**: PostgreSQL with Prisma ORM
- **Auth**: Supabase passwordless email auth + signed HTTP-only app sessions
- **Security**: AES-256-GCM encryption for provider API keys
- **Streaming**: Server-Sent Events (SSE)
- **AI Providers**: OpenAI, Gemini, Anthropic, and Groq free fallback
- **Containerization**: Docker + Docker Compose

## 👨‍💻 Author

**Shakil Ahmed**

- GitHub: [@ahmedmshakil](https://github.com/ahmedmshakil)

