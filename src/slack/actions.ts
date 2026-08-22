import { findOrCreateCustomer } from "../airwallex/customers.js";
import {
  createAndFinalizeInvoice,
  lineItemsTotal,
} from "../airwallex/invoices.js";
import { config } from "../config.js";
import { sendInvoiceEmail } from "../email/mailer.js";
import {
  deleteDraft,
  getDraftById,
  saveDraft,
} from "../store/drafts.js";
import {
  APPROVE_ACTION_ID,
  CANCEL_ACTION_ID,
  cancelledBlocks,
  draftBlocks,
  errorBlocks,
  parseActionValue,
  submittingBlocks,
  successBlocks,
} from "./blocks.js";

function actionChannel(body: unknown): string | undefined {
  if (
    typeof body === "object" &&
    body !== null &&
    "channel" in body &&
    typeof (body as { channel?: { id?: string } }).channel?.id === "string"
  ) {
    return (body as { channel: { id: string } }).channel.id;
  }
  return undefined;
}

function actionMessageTs(body: unknown): string | undefined {
  if (
    typeof body === "object" &&
    body !== null &&
    "message" in body &&
    typeof (body as { message?: { ts?: string } }).message?.ts === "string"
  ) {
    return (body as { message: { ts: string } }).message.ts;
  }
  return undefined;
}

function actionValue(action: unknown): string | undefined {
  if (
    typeof action === "object" &&
    action !== null &&
    "value" in action &&
    typeof (action as { value?: string }).value === "string"
  ) {
    return (action as { value: string }).value;
  }
  return undefined;
}

export function registerActionHandlers(app: import("@slack/bolt").App): void {
  app.action(APPROVE_ACTION_ID, async ({ ack, body, action, client }) => {
    await ack();
    const channel = actionChannel(body);
    const messageTs = actionMessageTs(body);
    const userId = body.user.id;
    const draftId = parseActionValue(actionValue(action));
    if (!channel || !messageTs || !draftId) return;

    const draft = getDraftById(draftId);
    if (!draft) {
      await client.chat.postEphemeral({
        channel,
        user: userId,
        text: "This draft has expired. Mention me again to start a new one.",
      });
      return;
    }

    if (userId !== draft.requesterId) {
      await client.chat.postEphemeral({
        channel,
        user: userId,
        text: `Only <@${draft.requesterId}> can approve this draft.`,
      });
      return;
    }

    if (draft.state === "submitting") {
      await client.chat.postEphemeral({
        channel,
        user: userId,
        text: "This invoice is already being sent.",
      });
      return;
    }

    saveDraft({ ...draft, state: "submitting", draftMessageTs: messageTs });
    await client.chat.update({
      channel,
      ts: messageTs,
      text: "Sending invoice to Airwallex…",
      blocks: submittingBlocks(),
    });

    try {
      if (!draft.client) {
        throw new Error("Draft is missing a client. Tag the client and mention me again.");
      }

      const billingCustomerId = await findOrCreateCustomer(
        draft.client,
        draft.requestIds.customer,
      );
      const invoice = await createAndFinalizeInvoice(
        billingCustomerId,
        draft,
        draft.requestIds,
      );

      let emailStatus = "Email not sent (EMAIL_ENABLED=false).";
      if (config.email.enabled && draft.client.email && invoice.hosted_url) {
        try {
          await sendInvoiceEmail({
            to: draft.client.email,
            clientName: draft.client.displayName,
            hostedUrl: invoice.hosted_url,
            pdfUrl: invoice.pdf_url,
            amount: lineItemsTotal(draft.lineItems),
            currency: draft.currency,
            description: draft.lineItems[0]?.description || "Invoice",
          });
          emailStatus = `Email sent to ${draft.client.email}.`;
        } catch (error) {
          console.error("email send failed", error);
          emailStatus = "Email failed to send. The Slack link above is valid.";
        }
      } else if (config.email.enabled && !draft.client.email) {
        emailStatus = "No Slack email on file; link posted here only.";
      } else {
        await sendInvoiceEmail({
          to: draft.client.email || "",
          clientName: draft.client.displayName,
          hostedUrl: invoice.hosted_url || "",
          amount: lineItemsTotal(draft.lineItems),
          currency: draft.currency,
          description: draft.lineItems[0]?.description || "Invoice",
        });
      }

      deleteDraft(draft.channel, draft.threadTs);
      await client.chat.update({
        channel,
        ts: messageTs,
        text: "Invoice sent.",
        blocks: successBlocks({
          clientUserId: draft.client.userId,
          hostedUrl: invoice.hosted_url,
          pdfUrl: invoice.pdf_url,
          invoiceNumber: invoice.number,
          emailStatus,
        }),
      });
    } catch (error) {
      console.error("approve failed", error);
      saveDraft({ ...draft, state: "pending_approval", draftMessageTs: messageTs });
      const message = error instanceof Error ? error.message : String(error);
      await client.chat.update({
        channel,
        ts: messageTs,
        text: "Could not send the invoice.",
        blocks: [...errorBlocks(message), ...draftBlocks(draft).slice(-1)],
      });
    }
  });

  app.action(CANCEL_ACTION_ID, async ({ ack, body, action, client }) => {
    await ack();
    const channel = actionChannel(body);
    const messageTs = actionMessageTs(body);
    const userId = body.user.id;
    const draftId = parseActionValue(actionValue(action));
    if (!channel || !messageTs || !draftId) return;

    const draft = getDraftById(draftId);
    if (!draft) {
      await client.chat.update({
        channel,
        ts: messageTs,
        text: "Invoice draft cancelled.",
        blocks: cancelledBlocks(),
      });
      return;
    }

    if (userId !== draft.requesterId) {
      await client.chat.postEphemeral({
        channel,
        user: userId,
        text: `Only <@${draft.requesterId}> can cancel this draft.`,
      });
      return;
    }

    deleteDraft(draft.channel, draft.threadTs);
    await client.chat.update({
      channel,
      ts: messageTs,
      text: "Invoice draft cancelled.",
      blocks: cancelledBlocks(),
    });
  });
}
