import OpenAI from "openai";
import { config } from "../config.js";
import type { SlackUserProfile, TranscriptMessage } from "../types.js";
import {
  EXTRACTION_JSON_SCHEMA,
  SYSTEM_PROMPT,
  extractionResultSchema,
  type ExtractionResult,
} from "./schema.js";

export type ExtractionInput = {
  transcript: TranscriptMessage[];
  requester: SlackUserProfile;
  client: SlackUserProfile | null;
  defaultCurrency?: string;
};

const openai = new OpenAI({ apiKey: config.openai.apiKey });

function buildUserPrompt(input: ExtractionInput): string {
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

export async function extractWithOpenAI(
  input: ExtractionInput,
): Promise<ExtractionResult> {
  const completion = await openai.chat.completions.create({
    model: config.openai.model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserPrompt(input) },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "invoice_extraction",
        strict: true,
        schema: EXTRACTION_JSON_SCHEMA,
      },
    },
  });

  const text = completion.choices[0]?.message?.content;
  if (!text) {
    throw new Error("OpenAI returned an empty extraction");
  }

  return extractionResultSchema.parse(JSON.parse(text));
}
