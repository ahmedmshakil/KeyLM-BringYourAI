# Supabase Deployment Guide

[← Back to main README](../README.md)

This guide explains how to configure Supabase for KeyLM and deploy the app to production.

KeyLM uses Supabase for:

- Hosted PostgreSQL database
- Passwordless email authentication with Magic Links/OTP
- Auth callback/session handoff into the app
- Optional Captcha protection through Cloudflare Turnstile

## 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com/).
2. Create a new project.
3. Save your database password securely.
4. Wait until the project is fully provisioned.

## 2. Collect database connection strings

In Supabase Dashboard, open:

```text
Project Settings → Database → Connection string
```

KeyLM expects two Prisma URLs:

```env
DATABASE_URL="postgresql://postgres.PROJECT_REF:YOUR_PASSWORD@HOST:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres:YOUR_PASSWORD@HOST:5432/postgres"
```

Recommended usage:

- `DATABASE_URL` — pooled connection string for runtime queries.
- `DIRECT_URL` — direct connection string for Prisma migrations.

> Replace `PROJECT_REF`, `YOUR_PASSWORD`, and host values with the values from your Supabase dashboard.

## 3. Configure Supabase Auth

Open:

```text
Authentication → Providers → Email
```

Enable email authentication/passwordless login.

Then open:

```text
Authentication → URL Configuration
```

Add redirect URLs:

```text
http://localhost:3000/auth/callback
https://your-domain.com/auth/callback
```

Set your production site URL:

```text
https://your-domain.com
```

## 4. Configure OTP/Magic Link expiry

Open Supabase email/auth settings and set email OTP expiry to:

```text
900 seconds
```

That equals 15 minutes and matches the app guidance.

If you customize email templates, make sure users can access either:

- Magic Link URL, or
- OTP token/code

The app supports both `/auth/callback` Magic Link verification and manual OTP verification.

## 5. Configure Cloudflare Turnstile

KeyLM renders a Turnstile challenge on passwordless login/register.

### App environment

Set the public site key in your app deployment environment:

```env
NEXT_PUBLIC_TURNSTILE_SITE_KEY="your-cloudflare-turnstile-site-key"
```

### Supabase Dashboard

In Supabase Captcha settings, add the secret key:

```text
TURNSTILE_SECRET_KEY
```

Important:

- Do **not** expose `TURNSTILE_SECRET_KEY` in frontend/public app env.
- Keep it only inside Supabase Dashboard Captcha settings.

## 6. Collect Supabase public API values

Open:

```text
Project Settings → API
```

Set these in your app env:

```env
NEXT_PUBLIC_SUPABASE_URL="https://PROJECT_REF.supabase.co"
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="your-supabase-publishable-or-anon-key"
```

## 7. Configure production environment variables

Set these variables in your hosting provider or production `.env`:



Generate secrets locally if needed:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Use the first value for `APP_AUTH_SECRET` and the second value for `APP_ENCRYPTION_KEY`.

## 8. Apply Prisma migrations

Before or during production release, run:

```bash
npm run prisma:deploy
```

For Docker Compose deployments, the `migrate` service already runs:

```bash
npx prisma migrate deploy
```

## 9. Deploy the app

KeyLM is a standard Next.js app and can be deployed to any Node-compatible host.

### Vercel-style flow

1. Connect the GitHub repository.
2. Add all production environment variables.
3. Make sure build command is:

```bash
npm run build
```
