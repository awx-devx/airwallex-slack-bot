import { config } from "../config.js";
import type { LineItemDraft } from "../types.js";
import { extractWithAnthropic } from "./anthropic.js";
import { extractWithOpenAI } from "./openai.js";
import type { ExtractionInput, ExtractionResult } from "./schema.js";

export type { ExtractionInput, ExtractionResult } from "./schema.js";

const GENERIC_QUESTION =
  "I still need a bit more to prepare the invoice. Who is the client (tag them), what should I bill, and for how much in which currency?";

export type ValidatedExtraction = {
  ready: boolean;
  result: ExtractionResult;
  lineItems: LineItemDraft[];
  currency?: string;
  memo?: string;
  question?: string;
};

function normalizeCurrency(value: string | null): string | undefined {
  if (!value) return undefined;
  const code = value.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : undefined;
}

export async function extractInvoiceDraft(
  input: ExtractionInput,
): Promise<ValidatedExtraction> {
  const clientKnown = Boolean(input.client);
  const extract =
    config.llm.provider === "anthropic"
      ? extractWithAnthropic
      : extractWithOpenAI;
  const result = await extract({
    ...input,
    defaultCurrency: input.defaultCurrency ?? config.airwallex.defaultCurrency,
  });

  const missing = new Set(result.missing_fields);
  if (!clientKnown) {
    missing.add("client");
    result.client_confirmed = false;
  } else {
    result.client_confirmed = true;
    missing.delete("client");
  }

  const lineItems: LineItemDraft[] = [];
  for (const item of result.line_items) {
    const amount = item.amount;
    const quantity = item.quantity >= 1 ? item.quantity : 1;
    const productName = item.product_name.trim();
    const description = item.description.trim() || productName;
    if (!productName && !description) {
      missing.add("description");
      continue;
    }
    if (amount === null || !(amount > 0)) {
      missing.add("amount");
      continue;
    }
    lineItems.push({
      productName: productName || description,
      description,
      amount,
      quantity,
      pricingModel: item.pricing_model,
    });
  }

  if (lineItems.length === 0) {
    missing.add("amount");
    if (!result.line_items.some((item) => item.description || item.product_name)) {
      missing.add("description");
    }
  }

  let currency = normalizeCurrency(result.currency);
  if (!currency) {
    currency = config.airwallex.defaultCurrency;
  }
  if (!currency) {
    missing.add("currency");
  } else {
    missing.delete("currency");
  }

  const ready =
    missing.size === 0 &&
    result.client_confirmed &&
    lineItems.length > 0 &&
    Boolean(currency);

  result.missing_fields = [...missing];
  result.ready_for_draft = ready;
  if (!ready && !result.clarifying_question) {
    result.clarifying_question = GENERIC_QUESTION;
  }

  return {
    ready,
    result,
    lineItems,
    currency,
    memo: result.memo?.trim() || undefined,
    question: ready ? undefined : result.clarifying_question ?? GENERIC_QUESTION,
  };
}
