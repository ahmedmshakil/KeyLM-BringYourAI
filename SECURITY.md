# Security Policy

## Supported Versions

Security fixes are provided for the current default branch and the latest published version of KeyLM. Older versions may receive guidance but are not guaranteed to receive patches.

## Reporting a Vulnerability

Please do **not** report security vulnerabilities through a public GitHub issue, discussion, or pull request.

Use GitHub's private vulnerability-reporting feature for this repository when it is available. If it is unavailable, contact the maintainer privately through [@ahmedmshakil on GitHub](https://github.com/ahmedmshakil) and request a private reporting channel before sharing sensitive details.

Include, where possible:

- A clear description of the vulnerability and affected component.
- Reproduction steps or a minimal proof of concept.
- Potential impact and affected configurations.
- Any suggested mitigation or fix.

Do not include real API keys, session cookies, user data, database credentials, or other secrets in a report or proof of concept.

## Response Process

The maintainer will acknowledge a valid report within five business days when possible, assess its impact, and provide status updates during remediation. After a fix is available, the project will coordinate disclosure with the reporter when appropriate.

## Security Expectations for Contributors

- Keep provider API keys, database URLs, session secrets, and `.env` files out of commits, logs, screenshots, and issues.
- Use the provided environment examples; never replace placeholders with real credentials.
- Preserve authentication, authorization, rate-limit, encryption, and quota checks when changing API routes.
- Report accidental secret exposure immediately and rotate the exposed secret.

## Out of Scope

The following are generally out of scope unless they demonstrate a concrete security impact:

- Vulnerabilities in unmodified third-party services or hosted provider APIs.
- Missing best-practice headers without an exploitable impact.
- Denial-of-service reports requiring unrealistic traffic volumes.
- Social-engineering attacks against project maintainers or users.
