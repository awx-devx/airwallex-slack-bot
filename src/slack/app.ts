import { App } from "@slack/bolt";
import { config } from "../config.js";
import { getDraft } from "../store/drafts.js";
import { registerActionHandlers } from "./actions.js";
import { handleMentionError, runInvoiceCycle } from "./mention.js";
import { registerMessageHandler } from "./messages.js";

export async function startSlackApp(): Promise<App> {
  const app = new App({
    token: config.slack.botToken,
    signingSecret: config.slack.signingSecret,
    socketMode: true,
    appToken: config.slack.appToken,
  });

  const auth = await app.client.auth.test();
  const botUserId = auth.user_id;
  if (!botUserId) {
    throw new Error("auth.test did not return a bot user_id");
  }

  app.event("app_mention", async ({ event, client }) => {
    if (!event.user) return;
    const threadTs = event.thread_ts || event.ts;
    const inExistingThread = Boolean(event.thread_ts);
    const existing = getDraft(event.channel, threadTs);

    try {
      await runInvoiceCycle({
        client,
        channel: event.channel,
        threadTs,
        mentionTs: event.ts,
        mentionText: event.text,
        requesterId: event.user,
        botUserId,
        inExistingThread,
        existingClient: existing?.client,
      });
    } catch (error) {
      await handleMentionError(client, event.channel, threadTs, error);
    }
  });

  registerMessageHandler(app, botUserId);
  registerActionHandlers(app);

  await app.start();
  console.info(`Invoice bot is running as ${auth.user} (${botUserId})`);
  return app;
}
