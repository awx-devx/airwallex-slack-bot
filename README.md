# Airwallex Slack invoicing bot

**This is a reference demo, not a product.** Clone it to see how a Slack thread can become an Airwallex **one-time invoice**. Use it as a starting point for your own integration — it is not production-ready, not a hosted Slack app, and not an official Airwallex or Slack application.

Tag the bot and a client in a thread that already has the project and price. The bot extracts the details, asks only if something is missing, posts a draft for the **requester** to approve, then creates the invoice and posts the digital payment link. Airwallex is not called until Approve.

Email to the client’s Slack-profile address is implemented and **off** (`EMAIL_ENABLED=false`).

Example names and amounts in `docs/` (`Acme`, `$5,000`) are **fictional**.

## What this is / is not

| This demo | Not this demo |
| --- | --- |
| One Slack workspace, one Airwallex account | Multi-workspace OAuth / distributed Slack app |
| Socket Mode (no public HTTP URL) | Slack Events HTTP + load-balanced fleet |
| In-memory drafts, 60 minute TTL, single process | Durable job queue, multi-instance |
| One-time invoices, `CHARGE_ON_CHECKOUT` | Subscriptions, auto-charge, credit notes |
| Human Approve before any Airwallex write | Autonomous invoicing |

Start on the Airwallex **sandbox**. Point `AIRWALLEX_BASE_URL` at production only when you intend to create real invoices.

## Prerequisites

- Node.js 20+
- A Slack workspace you can install an app into
- An Airwallex **sandbox** (or production) account with Billing + Payments, plus:
  - Client ID and API key
  - `legal_entity_id` (`le_…`) — from the Airwallex web app; do not invent it
  - `linked_payment_account_id` (`acct_…`) — Settings → Account details
- An OpenAI or Anthropic API key (extraction; set `LLM_PROVIDER`)

Open items that stay in env (never hardcoded) are listed in [docs/07-decisions.md](docs/07-decisions.md).

## Quickstart

```bash
git clone https://github.com/HeimLabs/airwallex-slack-bot.git
cd airwallex-slack-bot
cp .env.example .env
# fill Slack, Airwallex, and LLM values (see table below)
npm install
npm run dev
```

The process fails fast if required env is missing. Invite the bot to a channel, then in a thread:

```
@Invoice Bot send an invoice to @client
```

Approve the draft. Cancel never creates an Airwallex object.

`.env` and `data/` (the Slack user → billing customer map) are gitignored. Never commit them.

## Slack app

1. Create an app at [api.slack.com/apps](https://api.slack.com/apps) → **Create New App** → **From an app manifest**. Paste:

```yaml
display_information:
  name: Airwallex Invoice Bot
features:
  bot_user:
    display_name: Invoice Bot
    always_online: true
oauth_config:
  scopes:
    bot:
      - app_mentions:read
      - chat:write
      - channels:history
      - groups:history
      - im:history
      - mpim:history
      - channels:read
      - users:read
      - users:read.email
settings:
  event_subscriptions:
    bot_events:
      - app_mention
      - message.channels
      - message.groups
      - message.im
      - message.mpim
  interactivity:
    is_enabled: true
  socket_mode_enabled: true
  org_deploy_enabled: false
  token_rotation_enabled: false
```

2. **Basic Information** → App-Level Tokens → create a token with `connections:write`. That is `SLACK_APP_TOKEN` (`xapp-…`).
3. Copy **Signing Secret** → `SLACK_SIGNING_SECRET`.
4. **OAuth & Permissions** → Install to workspace → Bot User OAuth Token → `SLACK_BOT_TOKEN` (`xoxb-…`).
5. Invite the bot: `/invite @Invoice Bot` in the channel you will use.

Full scope notes: [docs/02-slack.md](docs/02-slack.md).

## Environment variables

Copy `.env.example` to `.env`. Required vars must be set or the process will not start.

### Required

| Variable | Where to get it |
| --- | --- |
| `SLACK_BOT_TOKEN` | Slack app → OAuth & Permissions → Bot User OAuth Token |
| `SLACK_APP_TOKEN` | Slack app → Basic Information → App-Level Tokens (`connections:write`) |
| `SLACK_SIGNING_SECRET` | Slack app → Basic Information → Signing Secret |
| `AIRWALLEX_CLIENT_ID` | Airwallex web app → API / developer settings |
| `AIRWALLEX_API_KEY` | Same |
| `AIRWALLEX_BASE_URL` | `https://api.sandbox.airwallex.com` (default) or `https://api.airwallex.com` |
| `AIRWALLEX_LEGAL_ENTITY_ID` | Airwallex account / billing settings (`le_…`) |
| `AIRWALLEX_LINKED_PAYMENT_ACCOUNT_ID` | Settings → Account details (`acct_…`) |
| `AIRWALLEX_DEFAULT_CURRENCY` | ISO-4217, e.g. `USD` — used when the thread omits currency |
| `OPENAI_API_KEY` | When `LLM_PROVIDER` is `openai` (the default) |
| `ANTHROPIC_API_KEY` | When `LLM_PROVIDER=anthropic` |

### Optional

| Variable | Default | Purpose |
| --- | --- | --- |
| `LLM_PROVIDER` | `openai` | `openai` or `anthropic` |
| `OPENAI_MODEL` | `gpt-4o-mini` | Extraction model |
| `ANTHROPIC_MODEL` | `claude-sonnet-4-5` | Extraction model |
| `AIRWALLEX_DEFAULT_TAX_PERCENT` | unset | Omit to send no tax field |
| `AIRWALLEX_DAYS_UNTIL_DUE` | `14` | Invoice due date |
| `AIRWALLEX_LOGIN_AS` | unset | Only if the API key is multi-account |
| `AIRWALLEX_SELLER_NAME` | unset | Email subject when email is on |
| `EMAIL_ENABLED` | `false` | Set `true` only with Resend configured |
| `RESEND_API_KEY` / `EMAIL_FROM` | — | Required if email is enabled |
| `CUSTOMER_MAP_PATH` | `./data/customer-map.json` | Local Slack → billing customer map |
| `LOG_LEVEL` | `info` | Process log level |

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Socket Mode with reload |
| `npm run build` | Compile to `dist/` |
| `npm start` | Run `dist/index.js` |
| `npm run typecheck` | `tsc --noEmit` |

## How it works

```text
Slack mention → LLM extraction → clarifying questions (if needed)
             → draft card (Approve / Cancel)
             → on Approve: Billing Customer → invoice → line items → finalize
             → post hosted_url in the thread
```

- Only the requester can Approve or Cancel.
- Drafts are in-memory, keyed by channel + thread, 60 minute TTL. Restarting the process drops pending drafts.
- Billing customers are reused via `data/customer-map.json` (created at runtime, gitignored).
- Collection is a digital invoice (`CHARGE_ON_CHECKOUT`) with a `hosted_url` valid for 35 days after the due date.

The product spec in [`docs/`](docs/00-overview.md) is the source of truth for behavior.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| Process exits on start | Missing required env — the error lists the keys |
| `not_in_channel` | `/invite @Invoice Bot` into that channel |
| Bot ignores replies | Manifest must include `message.channels` (and groups/im/mpim); handler no-ops unless that thread has a pending draft |
| Extraction keeps asking | Thread needs a description **and** a price; currency falls back to `AIRWALLEX_DEFAULT_CURRENCY` |
| Approve fails with Airwallex 4xx | Confirm `le_…` / `acct_…` from the **same** sandbox or production org as `AIRWALLEX_BASE_URL` |
| Email never sends | `EMAIL_ENABLED` defaults to `false` |

## Security

Read [SECURITY.md](SECURITY.md).

- Never commit `.env` or `data/`.
- Use sandbox until you are ready to invoice real customers.
- This demo is a single process with secrets in env. It is not hardened for a shared host or multi-tenant deploy.
- You are responsible for your Slack workspace, Airwallex account, and compliance.

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
| [docs/08-implementation-checklist.md](docs/08-implementation-checklist.md) | How the demo was built |
| [SECURITY.md](SECURITY.md) | Vulnerability reporting |

## License

[MIT](LICENSE). Airwallex and Slack are trademarks of their respective owners. This project is not affiliated with, endorsed by, or an official product of Airwallex or Slack.
