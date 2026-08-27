# Decisions

## Decided

| Topic | Decision |
| --- | --- |
| Invoice type | One-time invoices only. No subscriptions |
| Collection | `CHARGE_ON_CHECKOUT` (digital invoice `hosted_url`). Not Hosted Billing Checkout |
| Line items | Inline `price` + inline `product.name` from the thread. No catalog |
| Customer | Create or reuse from tagged Slack user; `metadata.slack_user_id`; local JSON map |
| Slack draft vs Airwallex `DRAFT` | Slack preview first. Airwallex only on Approve |
| Who approves | Requester only |
| Thread scope | Existing thread: that thread only. Top-level mention: last 50 channel messages, then continue in a new thread |
| LLM | Required. Isolated adapter. OpenAI or Anthropic structured outputs (`LLM_PROVIDER`) |
| Email | Implemented, `EMAIL_ENABLED=false`. Resend when enabled |
| Slack SDK | `@slack/bolt`, Socket Mode |
| Language | TypeScript |
| Draft persistence | In-memory, 60 minute TTL, single instance |
| Tax / coupons / void / mark-paid | Out of scope except optional env tax percent on create |

## Open items (env, not invented in code)

These stay placeholders. Fill `.env` before a real Approve. The process will not start without the required ones in [06-architecture](06-architecture.md).

| Item | Env | Notes |
| --- | --- | --- |
| Sandbox vs production host | `AIRWALLEX_BASE_URL` | `https://api.sandbox.airwallex.com` or `https://api.airwallex.com` |
| Legal entity | `AIRWALLEX_LEGAL_ENTITY_ID` | From Airwallex account / billing settings (`le_…`) |
| Payment account | `AIRWALLEX_LINKED_PAYMENT_ACCOUNT_ID` | Settings → Account details (`acct_…`) |
| Default currency | `AIRWALLEX_DEFAULT_CURRENCY` | ISO-4217, e.g. `USD`. Used when the thread does not name a currency |
| Default tax percent | `AIRWALLEX_DEFAULT_TAX_PERCENT` | Omit to send no tax field (Airwallex default 0) |
| Days until due | `AIRWALLEX_DAYS_UNTIL_DUE` | Defaults to `14` if unset |
| Multi-account login | `AIRWALLEX_LOGIN_AS` | Only if the API key is multi-account |
| LLM vendor / model | `LLM_PROVIDER`, `OPENAI_API_KEY` / `OPENAI_MODEL`, `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL` | Default `openai`. Gemini not wired |
| Email provider | `EMAIL_ENABLED`, `RESEND_API_KEY`, `EMAIL_FROM` | Off until you turn it on |
| Seller name in email subject | `AIRWALLEX_SELLER_NAME` | Optional |

If you want a different default currency, tax, or LLM vendor, change env (or the extract adapter) — do not hard-code account IDs in source.

## Review checkpoint

Before treating this spec as locked:

1. Confirm one-time + digital invoice + inline product is what you want.
2. Supply Airwallex sandbox Client ID, API key, legal entity, and payment account.
3. Confirm OpenAI or Anthropic as the v1 LLM (`LLM_PROVIDER`).
4. Leave email off until you have a Resend domain (or swap the mailer).
