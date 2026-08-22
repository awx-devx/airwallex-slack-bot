export type SlackUserProfile = {
  userId: string;
  displayName: string;
  email?: string;
};

export type TranscriptMessage = {
  userId: string;
  displayName: string;
  role: "human" | "bot";
  text: string;
};

export type LineItemDraft = {
  productName: string;
  description: string;
  amount: number;
  quantity: number;
  pricingModel: "FLAT" | "PER_UNIT";
};

export type DraftState =
  | "awaiting_clarification"
  | "pending_approval"
  | "submitting";

export type AirwallexRequestIds = {
  customer: string;
  invoice: string;
  lineItems: string;
  finalize: string;
};

export type InvoiceDraft = {
  draftId: string;
  channel: string;
  threadTs: string;
  mentionTs: string;
  draftMessageTs?: string;
  requesterId: string;
  client: SlackUserProfile | null;
  lineItems: LineItemDraft[];
  currency: string;
  memo?: string;
  state: DraftState;
  requestIds: AirwallexRequestIds;
  updatedAt: number;
};

export type InvoiceEmail = {
  to: string;
  clientName: string;
  hostedUrl: string;
  pdfUrl?: string;
  amount: number;
  currency: string;
  description: string;
};
