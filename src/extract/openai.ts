import OpenAI from "openai";
import { config } from "../config.js";
import {
  EXTRACTION_JSON_SCHEMA,
  SYSTEM_PROMPT,
  buildUserPrompt,
  extractionResultSchema,
  type ExtractionInput,
  type ExtractionResult,
} from "./schema.js";

export type { ExtractionInput } from "./schema.js";

let client: OpenAI | undefined;

function getOpenAI(): OpenAI {
  if (config.llm.provider !== "openai") {
    throw new Error(
      `OpenAI adapter called with LLM_PROVIDER=${config.llm.provider}`,
    );
  }
  if (!client) {
    client = new OpenAI({ apiKey: config.llm.apiKey });
  }
  return client;
}

export async function extractWithOpenAI(
  input: ExtractionInput,
): Promise<ExtractionResult> {
  const completion = await getOpenAI().chat.completions.create({
    model: config.llm.model,
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
