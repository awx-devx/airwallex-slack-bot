# Extraction

The Slack thread is unstructured. Bolt cannot turn “website redesign for $5k” into an invoice payload. An LLM is required for v1. It is **read-only**: it never calls Airwallex, never sends email, and never approves.

## Why an LLM

The requester tags the bot after a free-form project discussion. The bot must:

- Pull amount, currency, description, and optional memo from natural language
- Notice what is missing
- Phrase **one** clarifying question

Regex and keyword rules fail on currency words, ranges, jokes, and multi-message context. A Slack modal is the documented no-LLM fallback and is **out of scope** for v1.

## Adapter

Default provider: **OpenAI** (`gpt-4o-mini`) with JSON Schema structured outputs.

The rest of the app depends only on:

```ts
extractInvoiceDraft(input: ExtractionInput): Promise<ExtractionResult>
```

Swap the implementation (Gemini, etc.) without changing Slack or Airwallex code.

## Input

```ts
type TranscriptMessage = {
  userId: string;
  displayName: string;
  role: "human" | "bot";
  text: string; // Slack mrkdwn, mentions already replaced with @Name (U123)
};

type ExtractionInput = {
  transcript: TranscriptMessage[];
  requester: { userId: string; displayName: string };
  client: { userId: string; displayName: string; email?: string } | null;
  defaultCurrency?: string; // from AIRWALLEX_DEFAULT_CURRENCY, if set
};
```

The client user is chosen by Slack mention rules ([01-user-flow](01-user-flow.md)), not by the LLM. Pass `client: null` when unknown so the model can set `missing_fields` to include `client`.

## Output schema (authoritative)

The model must return JSON matching this schema (strict):

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "client_confirmed",
    "line_items",
    "currency",
    "memo",
    "missing_fields",
    "clarifying_question",
    "ready_for_draft"
  ],
  "properties": {
    "client_confirmed": { "type": "boolean" },
    "line_items": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["product_name", "description", "amount", "quantity", "pricing_model"],
        "properties": {
          "product_name": { "type": "string" },
          "description": { "type": "string" },
          "amount": { "type": ["number", "null"] },
          "quantity": { "type": "integer" },
          "pricing_model": { "type": "string", "enum": ["FLAT", "PER_UNIT"] }
        }
      }
    },
    "currency": { "type": ["string", "null"] },
    "memo": { "type": ["string", "null"] },
    "missing_fields": {
      "type": "array",
      "items": {
        "type": "string",
        "enum": ["client", "amount", "currency", "description"]
      }
    },
    "clarifying_question": { "type": ["string", "null"] },
    "ready_for_draft": { "type": "boolean" }
  }
}
```

Field rules:

| Field | Rule |
| --- | --- |
| `client_confirmed` | `true` only if a Slack client user was provided in input |
| `line_items` | One or more. `product_name` is a short good/service name. `description` is the line the customer should see. `amount` is the major-unit number (5000 not 500000). `quantity` defaults to 1. Use `FLAT` unless the thread clearly states a per-unit price and a quantity |
| `currency` | ISO-4217 uppercase (e.g. `USD`). Use `defaultCurrency` from input **only** if the thread does not name a currency. If neither exists, `null` and add `currency` to `missing_fields` |
| `memo` | Optional thank-you / project note; null if none |
| `missing_fields` | Only the enums listed. Never invent an amount to clear `amount` |
| `clarifying_question` | Required (non-null) if `missing_fields` is non-empty; one question only |
| `ready_for_draft` | `true` only when `missing_fields` is empty, `client_confirmed` is true, every line has a positive `amount`, and `currency` is a 3-letter code |

## Never infer

The model must **not** guess:

- Amount (including picking one number from a range like “3–5k”)
- Client (identity comes from Slack tags)
- Currency, unless it is in the thread **or** `defaultCurrency` was provided

If the thread says “around 5k” or “TBD”, amount is missing.

## System prompt (intent)

You extract invoice fields for a human to approve. You do not role-play finance advice. You do not add tax unless the thread states a tax amount (tax percent is applied later from env). Prefer the latest explicit correction in the thread. Ignore unrelated chat. Mentions of the bot are instructions, not line items.

## Post-validation (code, not the model)

After parse, the app rejects `ready_for_draft` unless:

- `client` is non-null
- `currency` matches `/^[A-Z]{3}$/`
- At least one line item with `amount > 0` and `quantity >= 1`
- `missing_fields` is empty

If validation fails, treat as not ready and ask a generic clarifying question if the model did not supply one.

## Provider env

| Variable | Role |
| --- | --- |
| `OPENAI_API_KEY` | Required when using the default adapter |
| `OPENAI_MODEL` | Default `gpt-4o-mini` |

Gemini is not wired in v1. To add it later, implement the same `extractInvoiceDraft` interface.
