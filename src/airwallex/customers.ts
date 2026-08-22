import { config } from "../config.js";
import {
  getMappedCustomerId,
  setMappedCustomerId,
} from "../store/customers.js";
import type { SlackUserProfile } from "../types.js";
import { airwallexRequest } from "./client.js";

type BillingCustomer = {
  id: string;
  email?: string;
  metadata?: Record<string, string>;
};

type CustomerList = {
  items?: BillingCustomer[];
  page_after?: string | null;
};

const MAX_LIST_PAGES = 10;

export async function findOrCreateCustomer(
  client: SlackUserProfile,
  requestId: string,
): Promise<string> {
  const mapped = await getMappedCustomerId(client.userId);
  if (mapped) return mapped;

  const listed = await findExistingCustomer(client);
  if (listed) {
    await setMappedCustomerId(client.userId, listed);
    return listed;
  }

  const created = await airwallexRequest<BillingCustomer>(
    "POST",
    "/api/v1/billing/billing_customers/create",
    {
      request_id: requestId,
      name: client.displayName,
      email: client.email,
      type: "INDIVIDUAL",
      nickname: client.userId,
      default_billing_currency: config.airwallex.defaultCurrency,
      default_legal_entity_id: config.airwallex.legalEntityId,
      metadata: { slack_user_id: client.userId },
    },
  );

  await setMappedCustomerId(client.userId, created.id);
  return created.id;
}

async function findExistingCustomer(
  client: SlackUserProfile,
): Promise<string | undefined> {
  let pageAfter: string | undefined;
  for (let page = 0; page < MAX_LIST_PAGES; page += 1) {
    const query = new URLSearchParams({ page_size: "20" });
    if (pageAfter) query.set("page_after", pageAfter);
    const list = await airwallexRequest<CustomerList>(
      "GET",
      `/api/v1/billing/billing_customers?${query.toString()}`,
    );
    const match = (list.items ?? []).find((item) => {
      if (item.metadata?.slack_user_id === client.userId) return true;
      if (client.email && item.email?.toLowerCase() === client.email.toLowerCase()) {
        return true;
      }
      return false;
    });
    if (match) return match.id;
    if (!list.page_after) break;
    pageAfter = list.page_after;
  }
  return undefined;
}
