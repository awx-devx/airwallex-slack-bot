import { config } from "../config.js";
import type { InvoiceEmail } from "../types.js";

export async function sendInvoiceEmail(payload: InvoiceEmail): Promise<void> {
  if (!config.email.enabled) {
    console.info("email skipped: disabled");
    return;
  }

  const from = config.email.from;
  const apiKey = config.email.resendApiKey;
  if (!from || !apiKey) {
    throw new Error("Email is enabled but RESEND_API_KEY or EMAIL_FROM is missing");
  }

  const seller = config.airwallex.sellerName || "your vendor";
  const subject = `Invoice from ${seller}: ${payload.description}`;
  const text = [
    `Hi ${payload.clientName},`,
    "",
    `Please pay ${payload.amount} ${payload.currency} for ${payload.description}.`,
    "",
    `Invoice: ${payload.hostedUrl}`,
    payload.pdfUrl ? `PDF: ${payload.pdfUrl}` : "",
    "",
    "This link is valid for 35 days after the payment due date.",
  ]
    .filter(Boolean)
    .join("\n");

  const html = `<p>Hi ${escapeHtml(payload.clientName)},</p>
<p>Please pay <strong>${escapeHtml(String(payload.amount))} ${escapeHtml(payload.currency)}</strong> for ${escapeHtml(payload.description)}.</p>
<p><a href="${escapeHtml(payload.hostedUrl)}">Pay invoice</a></p>
${payload.pdfUrl ? `<p><a href="${escapeHtml(payload.pdfUrl)}">Download PDF</a></p>` : ""}
<p>This link is valid for 35 days after the payment due date.</p>`;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [payload.to],
      subject,
      text,
      html,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Resend ${response.status}: ${body}`);
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
