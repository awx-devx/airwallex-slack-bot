import { config } from "../config.js";
import type { AirwallexRequestIds, InvoiceDraft, LineItemDraft } from "../types.js";
import { airwallexRequest } from "./client.js";

export type FinalizedInvoice = {
  id: string;
  hosted_url?: string;
  pdf_url?: string;
  number?: string;
  status?: string;
  payment_status?: string;
};

type LineItemPayload = {
  description: string;
  quantity: number;
  price: {
    description: string;
    pricing_model: "FLAT" | "PER_UNIT";
    flat_amount?: number;
    unit_amount?: number;
    product: { name: string };
  };
};

function toLineItem(item: LineItemDraft): LineItemPayload {
  const price: LineItemPayload["price"] = {
    description: item.description,
    pricing_model: item.pricingModel,
    product: { name: item.productName },
  };
  if (item.pricingModel === "PER_UNIT") {
    price.unit_amount = item.amount;
  } else {
    price.flat_amount = item.amount;
  }
  return {
    description: item.description,
    quantity: item.quantity,
    price,
  };
}

export async function createAndFinalizeInvoice(
  billingCustomerId: string,
  draft: InvoiceDraft,
  requestIds: AirwallexRequestIds,
): Promise<FinalizedInvoice> {
  const createBody: Record<string, unknown> = {
    request_id: requestIds.invoice,
    billing_customer_id: billingCustomerId,
    currency: draft.currency,
    collection_method: "CHARGE_ON_CHECKOUT",
    linked_payment_account_id: config.airwallex.linkedPaymentAccountId,
    legal_entity_id: config.airwallex.legalEntityId,
    days_until_due: config.airwallex.daysUntilDue,
    memo: draft.memo || draft.lineItems[0]?.description,
  };
  if (config.airwallex.defaultTaxPercent !== undefined) {
    createBody.default_tax_percent = config.airwallex.defaultTaxPercent;
  }

  const invoice = await airwallexRequest<FinalizedInvoice>(
    "POST",
    "/api/v1/billing/invoices/create",
    createBody,
  );

  await airwallexRequest(
    "POST",
    `/api/v1/billing/invoices/${invoice.id}/add_line_items`,
    {
      request_id: requestIds.lineItems,
      line_items: draft.lineItems.map(toLineItem),
    },
  );

  return airwallexRequest<FinalizedInvoice>(
    "POST",
    `/api/v1/billing/invoices/${invoice.id}/finalize`,
    { request_id: requestIds.finalize },
  );
}

export function lineItemsTotal(items: LineItemDraft[]): number {
  return items.reduce((sum, item) => {
    if (item.pricingModel === "PER_UNIT") {
      return sum + item.amount * item.quantity;
    }
    return sum + item.amount;
  }, 0);
}
