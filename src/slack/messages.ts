import type { AllMiddlewareArgs, SlackEventMiddlewareArgs } from "@slack/bolt";
import { getDraft } from "../store/drafts.js";
import { handleMentionError, runInvoiceCycle } from "./mention.js";

type MessageArgs = SlackEventMiddlewareArgs<"message"> & AllMiddlewareArgs;

export function registerMessageHandler(
  app: import("@slack/bolt").App,
  botUserId: string,
): void {
  app.message(async ({ event, client }: MessageArgs) => {
    if (event.subtype) return;
    if (!("text" in event) || !event.text || !event.user || !event.ts) return;
    if (event.user === botUserId) return;
    if (event.text.includes(`<@${botUserId}>`)) return;

    const channel = event.channel;
    const threadTs = event.thread_ts;
    if (!threadTs) return;

    const draft = getDraft(channel, threadTs);
    if (!draft || draft.state !== "awaiting_clarification") return;
    if (event.ts === draft.mentionTs) return;

    try {
      await runInvoiceCycle({
        client,
        channel,
        threadTs,
        mentionTs: draft.mentionTs,
        mentionText: event.text,
        requesterId: draft.requesterId,
        botUserId,
        inExistingThread: true,
        existingClient: draft.client,
      });
    } catch (error) {
      await handleMentionError(client, channel, threadTs, error);
    }
  });
}
