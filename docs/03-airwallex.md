# Airwallex

One-time invoices via the Billing API. Official guides: [Get started with invoicing](https://www.airwallex.com/docs/billing/invoicing/get-started-with-invoicing.md), [Invoices via API](https://www.airwallex.com/docs/billing/invoicing/invoices-via-api), [Create invoice](https://www.airwallex.com/docs/api/billing/invoices/create), [Add line items](https://www.airwallex.com/docs/api/billing/invoices/add_line_items.md), [Billing customers](https://www.airwallex.com/docs/api/billing/billing_customers/create), [Authentication](https://www.airwallex.com/docs/api/authentication/api_access_token/login).

The Slack draft is not an Airwallex object. Airwallex is called **only on Approve**, in this order.

## Base URLs

| Environment | Host |
| --- | --- |
| Sandbox | `https://api.sandbox.airwallex.com` |
| Production | `https://api.airwallex.com` |

Set `AIRWALLEX_BASE_URL` explicitly. Do not guess.

## Authentication

`POST /api/v1/authentication/login`

Headers (not body):

- `x-client-id`: Client ID from the Airwallex web app
- `x-api-key`: API key
- `Content-Type: application/json`

Response `201`:

```json
{ "token": "eyJ…", "expires_at": "2021-06-18T16:30:00+0000" }
```

Reuse the token until `expires_at` (about 30 minutes). Refresh a minute early. Send `Authorization: Bearer <token>` on all Billing calls.

Optional: `x-login-as` if the API key is scoped to multiple accounts (`AIRWALLEX_LOGIN_AS`).

## Write sequence (Approve)

1. **Customer** — find local map `slack_user_id → billing_customer_id`. If missing, `GET /api/v1/billing/billing_customers` pages and match `metadata.slack_user_id` or email. If still missing, `POST /api/v1/billing/billing_customers/create`.
2. **Invoice** — `POST /api/v1/billing/invoices/create` → status `DRAFT`.
3. **Line items** — `POST /api/v1/billing/invoices/{id}/add_line_items`.
4. **Finalize** — `POST /api/v1/billing/invoices/{id}/finalize` → `FINALIZED`, `payment_status: UNPAID`.
5. Read `hosted_url` (and `pdf_url` if returned). Post them to Slack.

If step 3 or 4 fails after create, post the Airwallex error and the invoice id if any. v1 does not auto-delete the orphan `DRAFT` (delete is irreversible and out of scope). The requester can retry Approve only if we have not finalized; after a failed finalize, do not blindly retry without checking retrieve.

## Billing Customer

`POST /api/v1/billing/billing_customers/create`

| Field | Source |
| --- | --- |
| `request_id` | UUID per attempt |
| `name` | Slack `real_name` / `name` |
| `email` | Slack `profile.email` if present |
| `type` | `INDIVIDUAL` |
| `default_billing_currency` | Invoice currency |
| `default_legal_entity_id` | `AIRWALLEX_LEGAL_ENTITY_ID` if set |
| `metadata.slack_user_id` | Client Slack user ID |
| `nickname` | Slack user ID (human-readable fallback) |

List API ([GET billing_customers](https://www.airwallex.com/docs/api/billing/billing_customers/list)) has **no metadata filter**. Reuse strategy:

1. Local JSON map (see [06-architecture](06-architecture.md)) — primary.
2. Paginate list (`page_size` 20, follow `page_after`) and match `metadata.slack_user_id`, then email.
3. Create.

Persist the new id in the local map after create.

## Create invoice

`POST /api/v1/billing/invoices/create`

Required / used fields:

| Field | Value |
| --- | --- |
| `request_id` | UUID |
| `billing_customer_id` | From customer step |
| `currency` | Extracted or `AIRWALLEX_DEFAULT_CURRENCY` |
| `collection_method` | `CHARGE_ON_CHECKOUT` |
| `linked_payment_account_id` | `AIRWALLEX_LINKED_PAYMENT_ACCOUNT_ID` (required for this collection method when the org has more than one account; always send if set) |
| `legal_entity_id` | `AIRWALLEX_LEGAL_ENTITY_ID` if set |
| `days_until_due` | `AIRWALLEX_DAYS_UNTIL_DUE` (default `14`) |
| `default_tax_percent` | `AIRWALLEX_DEFAULT_TAX_PERCENT` if set |
| `memo` | Extracted memo or a short project description |

Do **not** use Hosted Billing Checkout. Digital invoice `hosted_url` is on the Invoice object and stays valid for 35 days after the due date.

## Line items

`POST /api/v1/billing/invoices/{id}/add_line_items`

Invoices only accept **one-off** prices (`recurring` / `period_unit` null). v1 uses an **inline** price and **inline** product (no catalog):

```json
{
  "line_items": [
    {
      "description": "Website redesign — milestone 1",
      "quantity": 1,
      "price": {
        "description": "Website redesign — milestone 1",
        "flat_amount": 5000,
        "pricing_model": "FLAT",
        "product": {
          "name": "Website redesign"
        }
      }
    }
  ],
  "request_id": "<uuid>"
}
```

Rules:

- Exactly one of `price` or `price_id`. v1 always uses `price`.
- Exactly one of `product` or `product_id`. v1 always uses `product` with `name`.
- `FLAT` + `flat_amount` for a single charge. `PER_UNIT` + `unit_amount` only if quantity is greater than 1 and the thread states a per-unit price.
- Amounts are decimal numbers as Airwallex documents them (not integer cents).

## Finalize

`POST /api/v1/billing/invoices/{id}/finalize`

This is the commercial agreement. After this, the invoice is not editable. Payment link: `hosted_url`. PDF: `pdf_url` (may be absent until finalized).

## Idempotency

Every mutating Airwallex call sends a unique `request_id` (UUID). On Approve retry of the **same** Slack draft, reuse the same `request_id`s stored on the draft so a double-click does not create two invoices.

## Account prerequisites

From Airwallex, not Slack:

- Billing enabled; Payments enabled on the collection account (required for digital invoice collection).
- `AIRWALLEX_LEGAL_ENTITY_ID` — legal entity id from account / billing settings.
- `AIRWALLEX_LINKED_PAYMENT_ACCOUNT_ID` — Settings → Account details (`acct_…`). Required for `CHARGE_ON_CHECKOUT` when multiple payment accounts exist.

These stay as env placeholders until supplied ([07-decisions](07-decisions.md)).

## Out of scope endpoints

Do not call in v1: void, delete, mark_as_paid, pay, subscriptions, coupons, preview (optional later), billing webhooks.
