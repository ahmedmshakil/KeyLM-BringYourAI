# Contributing to KeyLM

Thanks for contributing. Please read this guide before opening an issue or pull request.

## Before You Start

- Follow the [Code of Conduct](CODE_OF_CONDUCT.md).
- For vulnerabilities or accidental secret exposure, follow the [Security Policy](SECURITY.md) instead of opening a public issue.
- Search existing issues and pull requests before creating a new one.
- Keep proposed changes focused; discuss large product or architecture changes in an issue first.

## Local Setup

1. Fork the repository and create a branch from the default branch.
2. Install dependencies with `npm install`.
3. Copy `.env.example` to `.env` and provide local, non-production values.
4. Generate the Prisma client with `npm run prisma:generate`.
5. Apply local migrations with `npm run prisma:migrate`, or use `npm run prisma:deploy` against an already-managed database.
6. Start the app with `npm run dev`.

See [docs/LOCAL_AND_DOCKER_RUN.md](docs/LOCAL_AND_DOCKER_RUN.md) for full local and Docker instructions.

## Development Guidelines

- Use TypeScript and follow the existing Next.js App Router structure.
- Keep UI behavior accessible: use semantic elements, labels, keyboard-friendly controls, and clear error states.
- Keep provider keys and shared provider credentials server-side. Never expose secrets through client code, API responses, or logs.
- Preserve user ownership checks, idempotency behavior, rate limits, and shared quota enforcement when editing API routes.
- Add Prisma migrations for intentional schema changes. Do not edit an existing migration that may already be deployed.
- Update relevant docs and environment examples when configuration, provider support, or public API behavior changes.

## Verification

Before opening a pull request, run:

```bash
npx tsc --noEmit
npm run build
```

Also test the affected user flow locally. For example, provider changes should cover key validation, model selection, streaming, error handling, and quota behavior where relevant.

## Pull Requests

- Use a short, imperative commit message. Existing commits follow formats such as `feat(scope): description`, `fix(scope): description`, `docs: description`, and `chore: description`.
- Describe the problem, implementation, and verification steps in the pull request.
- Link the relevant issue when one exists.
- Include screenshots or a short recording for visible UI changes.
- Do not mix unrelated formatting, dependency upgrades, or generated-file changes with a feature unless they are required.
- Keep all checks passing and respond to review feedback constructively.

## Reporting Bugs and Requesting Features

For bugs, include expected behavior, actual behavior, reproduction steps, environment details, and relevant non-sensitive logs.

For feature requests, explain the user problem and the expected outcome. Avoid including API keys, user data, or other secrets in public reports.
