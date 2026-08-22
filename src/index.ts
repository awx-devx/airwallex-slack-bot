import { startSlackApp } from "./slack/app.js";

startSlackApp().catch((error: unknown) => {
  console.error("Failed to start invoice bot", error);
  process.exit(1);
});
