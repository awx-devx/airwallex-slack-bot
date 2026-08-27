# Architecture

Node.js + TypeScript. Single process. Socket Mode Slack connection. No HTTP server required for Slack.

## Directory layout

```
docs/                      # This spec (source of truth)
src/
  index.ts                 # Load config, start Bolt (Socket Mode)
  config.ts                # Env parse and fail-fast
  types.ts                 # Shared types
  slack/
    app.ts                 # Bolt App construction
    mention.ts             # app_mention handler
    messages.ts            # Clarifying-reply handler
    actions.ts             # Approve / Cancel
    blocks.ts              # Draft and result Block Kit
    thread.ts              # History / replies / mention parse / users.info
  extract/
    schema.ts              # JSON Schema + types
    index.ts               # extractInvoiceDraft
    openai.ts              # OpenAI adapter
    anthropic.ts           # Anthropic adapter
  airwallex/
    client.ts              # Fetch wrapper + auth token cache
    customers.ts           # Create / reuse
    invoices.ts            # Create, add_line_items, finalize
  email/
    mailer.ts              # Gated Resend sender
  store/
    drafts.ts              # In-memory pending drafts
    customers.ts           # slack_user_id → billing_customer_id (JSON file)
.env.example
package.json
tsconfig.json
```

## Config (`src/config.ts`)

Fail at process start if required vars are missing. Do not start Bolt.

**Always required**

- `SLACK_BOT_TOKEN`
- `SLACK_APP_TOKEN`
- `SLACK_SIGNING_SECRET`
- `AIRWALLEX_CLIENT_ID`
- `AIRWALLEX_API_KEY`
- `AIRWALLEX_BASE_URL`

**Required for the selected LLM** (`LLM_PROVIDER`, default `openai`)

- `OPENAI_API_KEY` when `LLM_PROVIDER=openai`
- `ANTHROPIC_API_KEY` when `LLM_PROVIDER=anthropic`

**Required for a successful Approve** (fail at start so we do not surprise the requester)

- `AIRWALLEX_LEGAL_ENTITY_ID`
- `AIRWALLEX_LINKED_PAYMENT_ACCOUNT_ID`
- `AIRWALLEX_DEFAULT_CURRENCY` (ISO-4217). Used when the thread omits currency; if you want the bot to always ask, leave it unset **only if** you accept that every thread must name a currency. v1 requires this env so drafts can complete when the thread is silent on currency.

**Optional**

- `AIRWALLEX_LOGIN_AS`
- `AIRWALLEX_DEFAULT_TAX_PERCENT`
- `AIRWALLEX_DAYS_UNTIL_DUE` (default `14`)
- `LLM_PROVIDER` (default `openai`)
- `OPENAI_MODEL` (default `gpt-4o-mini`)
- `ANTHROPIC_MODEL` (default `claude-sonnet-4-5`)
- `EMAIL_ENABLED` (default `false`)
- `RESEND_API_KEY` / `EMAIL_FROM` (required if email enabled)
- `AIRWALLEX_SELLER_NAME` (email subject)
- `CUSTOMER_MAP_PATH` (default `./data/customer-map.json`)
- `LOG_LEVEL`

## Draft store (in-memory)

Key: `${channel}:${threadTs}`.

Value includes:

- `draftId` (UUID)
- `requesterId`
- `clientUserId`
- extraction result
- Slack `channel`, `threadTs`, `draftMessageTs`
- state: `awaiting_clarification` | `pending_approval` | `submitting`
- Airwallex `request_id`s for customer / invoice / line items / finalize (stable for retries)
- `updatedAt`

TTL: 60 minutes. Single instance only; a restart drops pending drafts (acceptable for v1).

## Customer map (JSON file)

Airwallex cannot filter customers by metadata. Persist:

```json
{ "U123": "bcus_…" }
```

at `CUSTOMER_MAP_PATH`. Create `data/` at runtime. This file is local state, not a secret, but do not commit workspace-specific maps.

## Idempotency and concurrency

- One draft per thread; new mention supersedes.
- Approve sets state to `submitting` before Airwallex calls; a second click is ignored.
- Reuse stored `request_id`s on retry after a transport failure **before** finalize succeeds. Once `hosted_url` is posted, mark the draft complete and ignore further Approve.

## Secrets

Never log tokens, API keys, or full Authorization headers. `.env` is gitignored. `.env.example` lists names only.

## Dependencies (v1)

- `@slack/bolt`
- `openai`
- `@anthropic-ai/sdk`
- `zod` (env + extraction validation)
- `dotenv`
- `typescript`, `tsx`, `@types/node` (dev)

No Express. No database.

## Runtime script

`npm run dev` → `tsx watch src/index.ts`  
`npm run build` → `tsc`  
`npm start` → `node dist/index.js`
