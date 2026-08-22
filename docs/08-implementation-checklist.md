# Implementation checklist

Build in this order. Do not add features outside [00-overview](00-overview.md).

Status below reflects the v1 codebase in `src/`.

## Scaffold

- [x] `package.json`, `tsconfig.json`, `.gitignore`, `.env.example`
- [x] `src/config.ts` fail-fast env
- [x] `src/types.ts`
- [x] `README.md` pointing at `docs/` and Slack + Airwallex setup

## Stores

- [x] In-memory draft store with TTL and one-draft-per-thread
- [x] JSON customer map (`slack_user_id` → `billing_customer_id`)

## Slack

- [x] Bolt Socket Mode app
- [x] `auth.test` for bot user id
- [x] Thread / history fetch and mention parsing
- [x] `users.info` for name + email
- [x] `app_mention` → extract → question or draft
- [x] `message` handler for clarification only
- [x] Block Kit draft + Approve/Cancel
- [x] Requester-only action check
- [x] Update card on success / cancel / error

## Extraction

- [x] JSON Schema + Zod validation
- [x] OpenAI adapter
- [x] Server-side `ready_for_draft` checks (never infer amount/client/currency)

## Airwallex

- [x] Token cache (`login` + `expires_at`)
- [x] Customer reuse then create
- [x] Invoice create → add_line_items → finalize
- [x] Stable `request_id`s on the draft
- [x] Post `hosted_url` / `pdf_url`

## Email

- [x] `sendInvoiceEmail` no-op when `EMAIL_ENABLED` is false
- [x] Resend implementation when enabled
- [x] Skip when client has no Slack email

## Manual test (sandbox)

- [ ] Invite bot, mention with client in a thread that has a price
- [ ] Missing amount → one question → draft
- [ ] Non-requester clicks Approve → ephemeral denial
- [ ] Cancel → no Airwallex objects
- [ ] Approve → finalized invoice + link in thread
- [ ] Confirm email was not sent with default env
