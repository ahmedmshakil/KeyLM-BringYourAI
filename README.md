# KeyLM-BringYourAI

Multi-provider BYOK chat app (OpenAI, Gemini, Anthropic) built with Next.js App Router and Prisma.

## Getting Started

1) Install dependencies
```bash
npm install
```

2) Create `.env` from `.env.example` and set:
- `DATABASE_URL`
- `APP_AUTH_SECRET`
- `APP_ENCRYPTION_KEY` (32-byte base64)

Generate a key with:
```bash
node -e "console.log(Buffer.from(require('crypto').randomBytes(32)).toString('base64'))"
```

3) Migrate the database
```bash
npm run prisma:migrate
```

4) Run the app
```bash
npm run dev
```

Open `http://localhost:3000` and sign in to connect provider keys.

## Notes
- Provider keys are encrypted at rest; raw keys are never returned to the client.
- Model lists are cached per user/provider for 24 hours and can be refreshed from the UI.
- Streaming uses SSE from the `/api/threads/:threadId/messages` endpoint.
