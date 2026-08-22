# Slack

The bot uses the official **Bolt for JavaScript** SDK (`@slack/bolt`) with **Socket Mode** so local and single-instance deploys do not need a public HTTP URL.

Reference: [Bolt for JavaScript](https://docs.slack.dev/tools/bolt-js), [users.info](https://docs.slack.dev/reference/methods/users.info), [users:read.email](https://docs.slack.dev/reference/scopes/users.read.email).

## Runtime

- `socketMode: true`
- Bot token (`xoxb-…`) + app-level token (`xapp-…` with `connections:write`)
- Signing secret still required by Bolt
- Acknowledge `app_mention` and actions immediately, then work asynchronously (Slack’s 3-second limit)

## Events and listeners

| Listener | When | Action |
| --- | --- | --- |
| `app_mention` | Requester tags the bot | Start or restart extraction for that thread |
| `message` (thread) | Human reply in a thread that has a pending “awaiting clarification” draft | Re-extract; ignore bot messages and Approve/Cancel noise |
| `action` `invoice_approve` | Button | If actor is requester, run Airwallex flow |
| `action` `invoice_cancel` | Button | If actor is requester, drop draft |

Do not subscribe to `message.channels` globally for all messages. After a mention, use `conversations.replies` / `conversations.history` on demand. For clarification, listen to `message` events and ignore threads with no pending draft.

## Web API methods

| Method | Use |
| --- | --- |
| `conversations.replies` | Full thread when `thread_ts` is set |
| `conversations.history` | Last 50 messages for a top-level mention |
| `users.info` | Requester and client profile (name, email) |
| `chat.postMessage` | Questions, draft, payment link (always `thread_ts`) |
| `chat.update` | Mutate the draft card after Approve/Cancel/error |
| `auth.test` | Resolve the bot’s own user ID at startup |

## Scopes (bot)

Request these together and reinstall the app after changing them:

| Scope | Why |
| --- | --- |
| `app_mentions:read` | `app_mention` |
| `chat:write` | Post and update messages |
| `channels:history` | Public channel history / replies |
| `groups:history` | Private channels |
| `im:history` | DMs |
| `mpim:history` | Group DMs |
| `channels:read` | Channel metadata if needed |
| `users:read` | `users.info` |
| `users:read.email` | `profile.email` (required in addition to `users:read`) |

`users:read` alone does **not** return email. See [Slack changelog on email access](https://docs.slack.dev/changelog/2017-04-narrowing-email-access).

## Email from Slack

```ts
const info = await client.users.info({ user: clientUserId });
const email = info.user?.profile?.email; // may be undefined
const name =
  info.user?.profile?.real_name ||
  info.user?.real_name ||
  info.user?.name ||
  clientUserId;
```

If `email` is missing: still allow the invoice; set Billing Customer `email` only when present; skip the mailer.

## Block Kit

Draft message: header, section fields (client, amount, currency, description), context (email warning), actions.

Action IDs (stable):

- `invoice_approve`
- `invoice_cancel`

Button `value` is a JSON string: `{ "draftId": "<uuid>" }` only. Do not put amounts in the button value as the source of truth; the in-memory draft store is authoritative.

## App manifest (Socket Mode)

Create the app at [api.slack.com/apps](https://api.slack.com/apps). Equivalent manifest:

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

`message.*` subscriptions are required so clarifying replies reach the bot. The handler no-ops unless the thread has a pending draft.

## Tokens (env)

| Variable | Slack UI location |
| --- | --- |
| `SLACK_BOT_TOKEN` | OAuth & Permissions → Bot User OAuth Token |
| `SLACK_APP_TOKEN` | Basic Information → App-Level Tokens (`connections:write`) |
| `SLACK_SIGNING_SECRET` | Basic Information → Signing Secret |

## Invite

The bot must be a member of the channel. If history calls return `not_in_channel`, tell the requester to `/invite @InvoiceBot`.
