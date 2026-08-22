import type { WebClient } from "@slack/web-api";
import type { SlackUserProfile, TranscriptMessage } from "../types.js";

const USER_MENTION = /<@([UW][A-Z0-9]+)>/g;
const profileCache = new Map<string, SlackUserProfile>();

export function mentionedUserIds(text: string): string[] {
  return [...new Set([...text.matchAll(USER_MENTION)].map((match) => match[1]))];
}

export function resolveClientUserId(options: {
  mentionText: string;
  requesterId: string;
  botUserId: string;
}): string[] {
  return mentionedUserIds(options.mentionText).filter(
    (id) => id !== options.requesterId && id !== options.botUserId,
  );
}

export async function getUserProfile(
  client: WebClient,
  userId: string,
): Promise<SlackUserProfile> {
  const cached = profileCache.get(userId);
  if (cached) return cached;

  const info = await client.users.info({ user: userId });
  const user = info.user;
  const profile = user?.profile;
  const displayName =
    profile?.real_name ||
    user?.real_name ||
    profile?.display_name ||
    user?.name ||
    userId;
  const result: SlackUserProfile = {
    userId,
    displayName,
    email: profile?.email || undefined,
  };
  profileCache.set(userId, result);
  return result;
}

export async function replaceMentions(
  client: WebClient,
  text: string,
): Promise<string> {
  const ids = mentionedUserIds(text);
  let next = text;
  for (const id of ids) {
    const profile = await getUserProfile(client, id);
    next = next.replaceAll(`<@${id}>`, `@${profile.displayName} (${id})`);
  }
  return next;
}

type SlackMessage = {
  ts?: string;
  user?: string;
  bot_id?: string;
  text?: string;
  subtype?: string;
};

async function allReplies(
  client: WebClient,
  channel: string,
  threadTs: string,
): Promise<SlackMessage[]> {
  const messages: SlackMessage[] = [];
  let cursor: string | undefined;
  do {
    const page = await client.conversations.replies({
      channel,
      ts: threadTs,
      cursor,
      limit: 200,
    });
    messages.push(...((page.messages ?? []) as SlackMessage[]));
    cursor = page.response_metadata?.next_cursor || undefined;
  } while (cursor);
  return messages;
}

export async function loadTranscript(
  client: WebClient,
  options: {
    channel: string;
    threadTs: string;
    mentionTs: string;
    inExistingThread: boolean;
    botUserId: string;
  },
): Promise<TranscriptMessage[]> {
  let raw: SlackMessage[];
  if (options.inExistingThread) {
    raw = await allReplies(client, options.channel, options.threadTs);
  } else {
    const history = await client.conversations.history({
      channel: options.channel,
      latest: options.mentionTs,
      inclusive: true,
      limit: 50,
    });
    raw = ([...(history.messages ?? [])] as SlackMessage[]).reverse();
    const later = await allReplies(client, options.channel, options.threadTs);
    const seen = new Set(raw.map((message) => message.ts));
    for (const message of later) {
      if (message.ts && !seen.has(message.ts)) raw.push(message);
    }
  }

  const transcript: TranscriptMessage[] = [];
  for (const message of raw) {
    if (!message.text || message.subtype === "message_changed") continue;
    const userId = message.user || message.bot_id || "unknown";
    const isBot = Boolean(message.bot_id) || userId === options.botUserId;
    const profile = message.user
      ? await getUserProfile(client, message.user)
      : { userId, displayName: "Invoice Bot" };
    transcript.push({
      userId,
      displayName: isBot ? "Invoice Bot" : profile.displayName,
      role: isBot ? "bot" : "human",
      text: await replaceMentions(client, message.text),
    });
  }
  return transcript;
}

export function isNotInChannelError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "data" in error &&
    Boolean(
      (error as { data?: { error?: string } }).data?.error === "not_in_channel",
    )
  );
}
