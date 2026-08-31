# Overview

> **Reference demo.** Not a hosted Slack app, not production-ready, not an official Airwallex or Slack product. Setup: [README.md](../README.md).

A Slack bot that turns a project thread into an Airwallex **one-time invoice**. A teammate tags the bot and the client; the bot reads the thread, asks only for missing fields, posts a Slack draft for approval, and on approve creates and finalizes the invoice. It posts the digital invoice link in the thread. Emailing that link to the client's Slack-profile email is implemented and **disabled** by default.

This document is the product brief. Implementation must follow [01-user-flow](01-user-flow.md) through [08-implementation-checklist](08-implementation-checklist.md).

## Problem

Project details and a price already live in Slack. Creating the invoice today means leaving Slack, copying amounts into Airwallex, and sending a payment link by hand. The bot keeps that work in the thread and requires a human approve step before any Airwallex write.

## Actors

| Actor | Who | What they do |
| --- | --- | --- |
| Requester | Slack user who mentions the bot | Starts the flow, answers clarifying questions, is the only person who can Approve or Cancel |
| Client | Slack user tagged in the mention (not the bot) | The party to invoice. Need not type anything. Their Slack profile name + email (if any) become the Airwallex Billing Customer |
| Bot | This app | Reads the thread, extracts fields, asks questions, shows a draft, talks to Airwallex only after Approve |

If more than one non-bot user is tagged, the bot treats the first tagged human who is not the requester as the client. If that is ambiguous, it asks.

## What this is

- One Slack workspace, one Airwallex account (sandbox or production via env).
- **One-time invoices only** ([Airwallex invoicing](https://www.airwallex.com/docs/billing/invoicing/get-started-with-invoicing.md)).
- Collection via **digital invoice** (`CHARGE_ON_CHECKOUT`), which returns a `hosted_url` valid for 35 days after the due date. Not Hosted Billing Checkout (1-hour expiry).
- Line items built **inline** from the thread (product name + flat amount). No Product/Price catalog required.
- Billing Customer created or reused from the tagged Slack user (`metadata.slack_user_id`).
- Slack draft is a preview. Airwallex is not called until Approve.

## In scope (v1)

- `@bot` mention with a tagged client
- Thread (or top-level mention) gathering
- LLM extraction + one clarifying question at a time
- Slack Block Kit draft: Approve / Cancel
- Requester-only actions
- Create/reuse Billing Customer, create invoice, add line items, finalize
- Post `hosted_url` (and `pdf_url` if present) in the thread
- Email module implemented, gated by `EMAIL_ENABLED=false`

## Out of scope (v1)

- Subscriptions / recurring invoices
- Void, delete, mark-as-paid, credit notes
- Coupons, catalog price lookup, multi-line item editing UI
- Auto-charge (`AUTO_CHARGE`) or out-of-band (`OUT_OF_BAND`) collection
- Slack modal “no LLM” form
- Multi-workspace OAuth / distributed Slack app
- Airwallex webhooks (paid/unpaid updates back to Slack)
- Using Airwallex Customer communications as the Slack-email substitute (different product; see [05-email](05-email.md))

## Layering

| Layer | Responsibility | Must not |
| --- | --- | --- |
| Slack Bolt | Events, thread fetch, user profile/email, draft UI, posting the link | Parse invoice fields from free text |
| LLM | Structured extraction + clarifying question text | Call Airwallex or send email |
| Airwallex | Customer, invoice, line items, finalize, `hosted_url` | Read Slack |
| Mailer | Optional send of `hosted_url` to Slack-profile email | Run unless `EMAIL_ENABLED=true` |

## Success criteria

1. Requester mentions the bot and a client in a thread that already has a project description and a price.
2. If anything required is missing, the bot asks **one** question and waits for a reply in the same thread.
3. The bot posts a draft the requester can Approve or Cancel.
4. Cancel never creates an Airwallex object.
5. Approve creates a finalized one-time invoice and posts the payment link in the thread.
6. Email code exists but does not send while `EMAIL_ENABLED` is false.

## Document map

| File | Topic |
| --- | --- |
| [01-user-flow.md](01-user-flow.md) | Conversation and approval rules |
| [02-slack.md](02-slack.md) | Bolt, scopes, events, Block Kit |
| [03-airwallex.md](03-airwallex.md) | Auth, customer, invoice API sequence |
| [04-extraction.md](04-extraction.md) | LLM schema and missing-field policy |
| [05-email.md](05-email.md) | Mailer interface and feature flag |
| [06-architecture.md](06-architecture.md) | Repo layout, env, stores |
| [07-decisions.md](07-decisions.md) | Decided vs open config |
| [08-implementation-checklist.md](08-implementation-checklist.md) | Build order |
