import Anthropic from "@anthropic-ai/sdk";
import { jsonSchemaOutputFormat } from "@anthropic-ai/sdk/helpers/json-schema";
import { config } from "../config.js";
import {
  EXTRACTION_JSON_SCHEMA,
  SYSTEM_PROMPT,
  buildUserPrompt,
  extractionResultSchema,
  type ExtractionInput,
  type ExtractionResult,
} from "./schema.js";

let client: Anthropic | undefined;

function getAnthropic(): Anthropic {
  if (config.llm.provider !== "anthropic") {
    throw new Error(
      `Anthropic adapter called with LLM_PROVIDER=${config.llm.provider}`,
    );
  }
  if (!client) {
    client = new Anthropic({ apiKey: config.llm.apiKey });
  }
  return client;
}

export async function extractWithAnthropic(
  input: ExtractionInput,
): Promise<ExtractionResult> {
  const message = await getAnthropic().messages.parse({
    model: config.llm.model,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildUserPrompt(input) }],
    output_config: {
      format: jsonSchemaOutputFormat(EXTRACTION_JSON_SCHEMA),
    },
  });

  if (message.stop_reason === "refusal") {
    throw new Error("Anthropic refused the extraction request");
  }
  if (message.stop_reason === "max_tokens") {
    throw new Error("Anthropic extraction was truncated (max_tokens)");
  }
  if (!message.parsed_output) {
    throw new Error("Anthropic returned an empty extraction");
  }

  return extractionResultSchema.parse(message.parsed_output);
}
