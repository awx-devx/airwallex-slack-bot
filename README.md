# Airwallex Slack invoicing bot

Tag the bot and a client in a Slack thread that already has the project and price. The bot extracts the details, asks only if something is missing, posts a draft for the requester to approve, then creates a **one-time** Airwallex invoice and posts the digital payment link.

Email to the client’s Slack-profile address is implemented and **off** (`EMAIL_ENABLED=false`).

The product spec in [`docs/`](docs/00-overview.md) is the source of truth.

## Prerequisites

- Node.js 20+
- A Slack app with Socket Mode (scopes and events in [docs/02-slack.md](docs/02-slack.md))
- An Airwallex sandbox or production account with Billing + Payments, plus:
  - Client ID and API key
  - `legal_entity_id` (`le_…`)
  - `linked_payment_account_id` (`acct_…`)
- An OpenAI or Anthropic API key (extraction; set `LLM_PROVIDER`)

Do not invent Airwallex IDs. Copy them from the web app. Open items are listed in [docs/07-decisions.md](docs/07-decisions.md).

## Setup

```bash
cp .env.example .env
# fill Slack, Airwallex, and LLM values (`LLM_PROVIDER=openai` or `anthropic`)
npm install
npm run dev
```

Invite the bot to the channel, then in a thread:

```
@Invoice Bot send an invoice to @client
```

Approve the draft. The bot will not call Airwallex until you do.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Socket Mode with reload |
| `npm run build` | Compile to `dist/` |
| `npm start` | Run `dist/index.js` |
| `npm run typecheck` | `tsc --noEmit` |

## Slack app

1. Create an app at [api.slack.com/apps](https://api.slack.com/apps).
2. Enable Socket Mode; create an app-level token with `connections:write`.
3. Add the bot scopes and event subscriptions from [docs/02-slack.md](docs/02-slack.md).
4. Install to the workspace. Copy the bot token, signing secret, and app token into `.env`.

## Docs

| File | Topic |
| --- | --- |
| [docs/00-overview.md](docs/00-overview.md) | Product brief |
| [docs/01-user-flow.md](docs/01-user-flow.md) | Conversation and approval |
| [docs/02-slack.md](docs/02-slack.md) | Bolt, scopes, Block Kit |
| [docs/03-airwallex.md](docs/03-airwallex.md) | Customer + invoice API sequence |
| [docs/04-extraction.md](docs/04-extraction.md) | LLM schema |
| [docs/05-email.md](docs/05-email.md) | Gated mailer |
| [docs/06-architecture.md](docs/06-architecture.md) | Layout and env |
| [docs/07-decisions.md](docs/07-decisions.md) | Decided vs open config |
| [docs/08-implementation-checklist.md](docs/08-implementation-checklist.md) | Build order |
