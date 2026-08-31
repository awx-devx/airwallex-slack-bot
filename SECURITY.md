# Security

This repository is a **reference demo**. When configured, it holds Slack tokens
and an Airwallex API key, and it can create real invoices after a human
approves a draft.

## Reporting a vulnerability

Do not open a public GitHub issue for security problems.

Use [GitHub private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability) on this repository.

## What this repo never stores

- Slack bot / app tokens or signing secrets
- Airwallex client IDs, API keys, or account IDs
- LLM API keys
- `.env` (copy from `.env.example`)
- `data/customer-map.json` (runtime Slack user → billing customer map)

If a secret was ever committed or shared, rotate it in Slack, Airwallex, and
the LLM provider before using the app again.

## Operator rules

- Start against the Airwallex **sandbox** (`https://api.sandbox.airwallex.com`).
- The bot does not call Airwallex until the requester clicks Approve.
- Drafts live in process memory (60 minute TTL). This is a single-instance demo, not a production store.
- Email is implemented and **off** (`EMAIL_ENABLED=false`) until you opt in.
