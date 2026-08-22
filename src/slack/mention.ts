import type { WebClient } from "@slack/web-api";
import { extractInvoiceDraft } from "../extract/index.js";
import { upsertDraft } from "../store/drafts.js";
import type { SlackUserProfile } from "../types.js";
import { draftBlocks } from "./blocks.js";
import {
  getUserProfile,
  isNotInChannelError,
  loadTranscript,
  resolveClientUserId,
} from "./thread.js";

export type CycleContext = {
  client: WebClient;
  channel: string;
  threadTs: string;
  mentionTs: string;
  mentionText: string;
  requesterId: string;
  botUserId: string;
  inExistingThread: boolean;
  existingClient?: SlackUserProfile | null;
};

async function postInThread(
  client: WebClient,
  channel: string,
  threadTs: string,
  text: string,
  blocks?: ReturnType<typeof draftBlocks>,
): Promise<string | undefined> {
  const result = await client.chat.postMessage({
    channel,
    thread_ts: threadTs,
    text,
    blocks,
  });
  return result.ts;
}

export async function runInvoiceCycle(ctx: CycleContext): Promise<void> {
  const requester = await getUserProfile(ctx.client, ctx.requesterId);
  const candidates = resolveClientUserId({
    mentionText: ctx.mentionText,
    requesterId: ctx.requesterId,
    botUserId: ctx.botUserId,
  });

  if (candidates.length === 0 && !ctx.existingClient) {
    upsertDraft({
      channel: ctx.channel,
      threadTs: ctx.threadTs,
      mentionTs: ctx.mentionTs,
      requesterId: ctx.requesterId,
      client: null,
      lineItems: [],
      currency: "",
      state: "awaiting_clarification",
    });
    await postInThread(
      ctx.client,
      ctx.channel,
      ctx.threadTs,
      "Who should I invoice? Tag the client in this thread.",
    );
    return;
  }
  if (candidates.length > 1) {
    upsertDraft({
      channel: ctx.channel,
      threadTs: ctx.threadTs,
      mentionTs: ctx.mentionTs,
      requesterId: ctx.requesterId,
      client: ctx.existingClient ?? null,
      lineItems: [],
      currency: "",
      state: "awaiting_clarification",
    });
    const tags = candidates.map((id) => `<@${id}>`).join(" ");
    await postInThread(
      ctx.client,
      ctx.channel,
      ctx.threadTs,
      `I see several people tagged (${tags}). Who is the client? Reply with one tag.`,
    );
    return;
  }

  const clientUser: SlackUserProfile = candidates[0]
    ? await getUserProfile(ctx.client, candidates[0])
    : ctx.existingClient!;
  const transcript = await loadTranscript(ctx.client, {
    channel: ctx.channel,
    threadTs: ctx.threadTs,
    mentionTs: ctx.mentionTs,
    inExistingThread: ctx.inExistingThread,
    botUserId: ctx.botUserId,
  });

  let extracted;
  try {
    extracted = await extractInvoiceDraft({
      transcript,
      requester,
      client: clientUser,
    });
  } catch (error) {
    console.error("extraction failed", error);
    await postInThread(
      ctx.client,
      ctx.channel,
      ctx.threadTs,
      "I couldn’t read this thread. Try again or add the amount and description explicitly.",
    );
    return;
  }

  if (!extracted.ready || !extracted.currency) {
    upsertDraft({
      channel: ctx.channel,
      threadTs: ctx.threadTs,
      mentionTs: ctx.mentionTs,
      requesterId: ctx.requesterId,
      client: clientUser,
      lineItems: extracted.lineItems,
      currency: extracted.currency || "",
      memo: extracted.memo,
      state: "awaiting_clarification",
    });
    await postInThread(
      ctx.client,
      ctx.channel,
      ctx.threadTs,
      extracted.question || "I need a bit more information.",
    );
    return;
  }

  const draft = upsertDraft({
    channel: ctx.channel,
    threadTs: ctx.threadTs,
    mentionTs: ctx.mentionTs,
    requesterId: ctx.requesterId,
    client: clientUser,
    lineItems: extracted.lineItems,
    currency: extracted.currency,
    memo: extracted.memo,
    state: "pending_approval",
  });

  const ts = await postInThread(
    ctx.client,
    ctx.channel,
    ctx.threadTs,
    "Invoice draft ready for approval.",
    draftBlocks(draft),
  );
  if (ts) {
    upsertDraft({ ...draft, draftMessageTs: ts, state: "pending_approval" });
  }
}

export async function handleMentionError(
  client: WebClient,
  channel: string,
  threadTs: string,
  error: unknown,
): Promise<void> {
  if (isNotInChannelError(error)) {
    await client.chat.postMessage({
      channel,
      thread_ts: threadTs,
      text: "I need to be in this channel to read the conversation. Please `/invite` me and mention me again.",
    });
    return;
  }
  console.error("invoice cycle failed", error);
  await client.chat.postMessage({
    channel,
    thread_ts: threadTs,
    text: "Something went wrong while preparing the draft. Try mentioning me again.",
  });
}
