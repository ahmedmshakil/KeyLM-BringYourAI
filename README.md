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
##  Quick Start

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
```


### 3. Setup database
```bash
npm run prisma:migrate
```

### 4. Run the app
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and create an account to get started. New users can chat on the shared Groq free tier until they connect their own provider key.



## 🏗️ Tech Stack

- **Frontend**: Next.js 14 (App Router), React, TypeScript
- **Backend**: Next.js API Routes
- **Database**: PostgreSQL with Prisma ORM
- **Auth**: Custom JWT-based authentication
- **Encryption**: AES-256-GCM for API key storage
- **Streaming**: Server-Sent Events (SSE)

## 👨‍💻 Author

** Shakil Ahmed**

- GitHub: [@ahmedmshakil](https://github.com/ahmedmshakil)
