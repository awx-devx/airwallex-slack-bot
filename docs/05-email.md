# Email

After a finalized invoice, the bot may email the digital invoice `hosted_url` to the **email on the client’s Slack profile**. Slack cannot send mail. Airwallex Customer communications ([billing settings](https://www.airwallex.com/docs/billing/configure-your-billing-settings)) is a separate product and is **not** this feature.

v1 **implements** the mailer and **does not send** unless `EMAIL_ENABLED=true`.

## Feature flag

| `EMAIL_ENABLED` | Behavior |
| --- | --- |
| `false` (default) | After posting the Slack link, skip the mailer. Log `email skipped: disabled` |
| `true` | Call `sendInvoiceEmail` if the client has a Slack email |

Missing Slack email: never send; say so on the Slack success message (“No Slack email on file; link posted here only”).

## Interface

```ts
type InvoiceEmail = {
  to: string;
  clientName: string;
  hostedUrl: string;
  pdfUrl?: string;
  amount: number;
  currency: string;
  description: string;
};

sendInvoiceEmail(payload: InvoiceEmail): Promise<void>
```

When disabled, `sendInvoiceEmail` returns immediately without a network call.

## Default transport (v1)

**Resend** HTTP API (`https://api.resend.com/emails`) so we do not run SMTP. Env:

| Variable | Required when enabled |
| --- | --- |
| `EMAIL_ENABLED` | No (default false) |
| `RESEND_API_KEY` | Yes if enabled |
| `EMAIL_FROM` | Yes if enabled (verified domain sender) |

If `EMAIL_ENABLED=true` but Resend env is missing, startup fails.

## Message

- Subject: `Invoice from {workspace or AIRWALLEX_SELLER_NAME}: {description}`
- Body (plain text + simple HTML): client name, amount + currency, one-line description, `hosted_url`, optional `pdf_url`
- No attachments (Airwallex hosts the PDF)

## Not in v1

- CC the requester
- Retry queues / bounce handling beyond one Resend request
- Using Airwallex’s own invoice emails as a replacement for this module
