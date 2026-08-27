import { z } from "zod";
import type { SlackUserProfile, TranscriptMessage } from "../types.js";

export const extractionResultSchema = z.object({
  client_confirmed: z.boolean(),
  line_items: z.array(
    z.object({
      product_name: z.string(),
      description: z.string(),
      amount: z.number().nullable(),
      quantity: z.number().int(),
      pricing_model: z.enum(["FLAT", "PER_UNIT"]),
    }),
  ),
  currency: z.string().nullable(),
  memo: z.string().nullable(),
  missing_fields: z.array(
    z.enum(["client", "amount", "currency", "description"]),
  ),
  clarifying_question: z.string().nullable(),
  ready_for_draft: z.boolean(),
});

export type ExtractionResult = z.infer<typeof extractionResultSchema>;

export const EXTRACTION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "client_confirmed",
    "line_items",
    "currency",
    "memo",
    "missing_fields",
    "clarifying_question",
    "ready_for_draft",
  ],
  properties: {
    client_confirmed: { type: "boolean" },
    line_items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "product_name",
          "description",
          "amount",
          "quantity",
          "pricing_model",
        ],
        properties: {
          product_name: { type: "string" },
          description: { type: "string" },
          amount: { type: ["number", "null"] },
          quantity: { type: "integer" },
          pricing_model: { type: "string", enum: ["FLAT", "PER_UNIT"] },
        },
      },
    },
    currency: { type: ["string", "null"] },
    memo: { type: ["string", "null"] },
    missing_fields: {
      type: "array",
      items: {
        type: "string",
        enum: ["client", "amount", "currency", "description"],
      },
    },
    clarifying_question: { type: ["string", "null"] },
    ready_for_draft: { type: "boolean" },
  },
} as const;

export const SYSTEM_PROMPT = `You extract invoice fields from a Slack thread so a human can approve a one-time Airwallex invoice.

Rules:
- Return JSON only, matching the schema.
- client_confirmed is true only if the input already identified a Slack client user.
- Never invent an amount. Ranges ("3-5k"), "around", "TBD", or jokes mean amount is missing.
- Never choose the client. Identity comes from Slack tags in the input.
- Currency must be ISO-4217 (USD, AUD, …). Use defaultCurrency from the input only when the thread does not name a currency. If neither exists, currency is null and missing_fields includes "currency".
- Prefer the latest explicit correction in the thread.
- Ignore unrelated chat. Mentions of the bot are instructions, not line items.
- Do not add tax. Tax is applied later from configuration.
- product_name is a short good/service name. description is what the customer should see.
- quantity defaults to 1. Use FLAT unless the thread clearly states a per-unit price and a quantity.
- amount is in major units (5000 means 5000.00, not cents).
- If missing_fields is non-empty, write exactly one clarifying_question and set ready_for_draft false.
- ready_for_draft is true only when missing_fields is empty, client_confirmed is true, every line item has a positive amount, and currency is a 3-letter code.`;

export type ExtractionInput = {
  transcript: TranscriptMessage[];
  requester: SlackUserProfile;
  client: SlackUserProfile | null;
  defaultCurrency?: string;
};

export function buildUserPrompt(input: ExtractionInput): string {
  const lines = input.transcript.map((message) => {
    const who = `${message.displayName} (${message.userId}, ${message.role})`;
    return `${who}: ${message.text}`;
  });

  return [
    `Requester: ${input.requester.displayName} (${input.requester.userId})`,
    input.client
      ? `Client (from Slack tag): ${input.client.displayName} (${input.client.userId})${input.client.email ? ` email=${input.client.email}` : " (no Slack email)"}`
      : "Client (from Slack tag): unknown — missing_fields must include client",
    `defaultCurrency: ${input.defaultCurrency ?? "unset"}`,
    "",
    "Transcript:",
    lines.join("\n") || "(empty)",
  ].join("\n");
}
