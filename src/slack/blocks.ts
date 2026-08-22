import type { KnownBlock } from "@slack/types";
import { lineItemsTotal } from "../airwallex/invoices.js";
import { config } from "../config.js";
import type { InvoiceDraft } from "../types.js";

export const APPROVE_ACTION_ID = "invoice_approve";
export const CANCEL_ACTION_ID = "invoice_cancel";

function money(amount: number, currency: string): string {
  return `${amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${currency}`;
}

function buttonValue(draftId: string): string {
  return JSON.stringify({ draftId });
}

export function parseActionValue(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value) as { draftId?: string };
    return parsed.draftId;
  } catch {
    return undefined;
  }
}

export function draftBlocks(draft: InvoiceDraft): KnownBlock[] {
  const lines = draft.lineItems
    .map((item) => {
      const qty =
        item.pricingModel === "PER_UNIT" ? ` × ${item.quantity}` : "";
      return `• ${item.description} — ${money(item.amount, draft.currency)}${qty}`;
    })
    .join("\n");

  const total = money(lineItemsTotal(draft.lineItems), draft.currency);
  const tax =
    config.airwallex.defaultTaxPercent !== undefined
      ? `\n_Estimated tax ${config.airwallex.defaultTaxPercent}% will be applied by Airwallex._`
      : "";
  const client = draft.client;
  const emailNote = client?.email
    ? `Slack email: ${client.email}`
    : "No email on this Slack profile — the link will only be posted here.";
  const clientField = client
    ? `<@${client.userId}>`
    : "_unknown_";

  return [
    {
      type: "header",
      text: { type: "plain_text", text: "Invoice draft", emoji: true },
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Client*\n${clientField}` },
        { type: "mrkdwn", text: `*Total*\n${total}` },
      ],
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: `*Line items*\n${lines}` },
    },
    ...(draft.memo
      ? [
          {
            type: "section" as const,
            text: { type: "mrkdwn" as const, text: `*Memo*\n${draft.memo}` },
          },
        ]
      : []),
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `${emailNote}${tax}\nOnly <@${draft.requesterId}> can approve. Airwallex is not called until then.`,
        },
      ],
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          action_id: APPROVE_ACTION_ID,
          text: { type: "plain_text", text: "Approve" },
          style: "primary",
          value: buttonValue(draft.draftId),
        },
        {
          type: "button",
          action_id: CANCEL_ACTION_ID,
          text: { type: "plain_text", text: "Cancel" },
          style: "danger",
          value: buttonValue(draft.draftId),
        },
      ],
    },
  ];
}

export function cancelledBlocks(): KnownBlock[] {
  return [
    {
      type: "section",
      text: { type: "mrkdwn", text: "Invoice draft cancelled. Nothing was sent to Airwallex." },
    },
  ];
}

export function submittingBlocks(): KnownBlock[] {
  return [
    {
      type: "section",
      text: { type: "mrkdwn", text: "Sending invoice to Airwallex…" },
    },
  ];
}

export function successBlocks(options: {
  clientUserId: string;
  hostedUrl?: string;
  pdfUrl?: string;
  invoiceNumber?: string;
  emailStatus: string;
}): KnownBlock[] {
  const link = options.hostedUrl
    ? `<${options.hostedUrl}|Pay invoice>`
    : "_No hosted_url returned — check the Airwallex dashboard._";
  const pdf = options.pdfUrl ? `\n<${options.pdfUrl}|Download PDF>` : "";
  const number = options.invoiceNumber ? ` (${options.invoiceNumber})` : "";
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `Invoice sent to <@${options.clientUserId}>${number}\n${link}${pdf}\n${options.emailStatus}`,
      },
    },
  ];
}

export function errorBlocks(message: string): KnownBlock[] {
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `Could not send the invoice:\n\`\`\`${message}\`\`\`\nClick Approve to retry if this was a transient error.`,
      },
    },
  ];
}
