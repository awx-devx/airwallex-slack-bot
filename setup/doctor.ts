/**
 * Preflight check for the Airwallex Slack invoicing bot.
 *
 * The bot needs ten secrets. Two of them, the legal entity id and the linked
 * payment account id, are documented as "find them in the Airwallex web app".
 * You do not have to. Both come back from GET /api/v1/account, and this script
 * prints them for you.
 *
 * It also catches the failure the upstream README lists under troubleshooting:
 * an le_ or acct_ id copied from a different org than AIRWALLEX_BASE_URL points
 * at. That one only shows up later, as a 4xx when somebody clicks Approve.
 *
 * No dependencies. Runs on Node 20+ with tsx, which the project already has.
 */

type Status = "ok" | "warn" | "missing";

let failures = 0;
let warnings = 0;

const line = (s = "") => console.log(s);
const mark = (s: Status) => (s === "ok" ? "  ok  " : s === "warn" ? " warn " : " MISS ");

function report(status: Status, key: string, detail: string) {
  if (status === "missing") failures++;
  if (status === "warn") warnings++;
  console.log(`${mark(status)} ${key.padEnd(38)} ${detail}`);
}

function env(key: string): string | undefined {
  const v = process.env[key];
  return v && v.trim() !== "" ? v.trim() : undefined;
}

/** Present, and looks like what it should look like. */
function checkFormat(key: string, prefix: string, where: string) {
  const v = env(key);
  if (!v) return report("missing", key, `not set. ${where}`);
  if (!v.startsWith(prefix))
    return report("warn", key, `set, but does not start with "${prefix}". ${where}`);
  report("ok", key, `${v.slice(0, prefix.length + 6)}…`);
}

function checkPresent(key: string, where: string) {
  const v = env(key);
  if (!v) return report("missing", key, `not set. ${where}`);
  report("ok", key, "set");
}

// ── Slack ───────────────────────────────────────────────────────────────────

async function checkSlack() {
  line("Slack");
  checkFormat("SLACK_BOT_TOKEN", "xoxb-", "OAuth & Permissions → Bot User OAuth Token");
  checkFormat("SLACK_APP_TOKEN", "xapp-", "Basic Information → App-Level Tokens, scope connections:write");
  checkPresent("SLACK_SIGNING_SECRET", "Basic Information → Signing Secret");

  const token = env("SLACK_BOT_TOKEN");
  if (!token) return;
  try {
    const res = await fetch("https://slack.com/api/auth.test", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    const j = (await res.json()) as { ok: boolean; team?: string; user?: string; error?: string };
    if (j.ok) report("ok", "slack auth.test", `${j.user} in ${j.team}`);
    else report("missing", "slack auth.test", `rejected: ${j.error}`);
  } catch {
    report("warn", "slack auth.test", "could not reach Slack");
  }
}

// ── Airwallex ───────────────────────────────────────────────────────────────

async function checkAirwallex() {
  line();
  line("Airwallex");

  const base = env("AIRWALLEX_BASE_URL") || "https://api.sandbox.airwallex.com";
  const isProd = base.includes("api.airwallex.com");
  report(
    isProd ? "warn" : "ok",
    "AIRWALLEX_BASE_URL",
    isProd ? `${base}  PRODUCTION. Approving creates real invoices.` : base,
  );

  checkPresent("AIRWALLEX_CLIENT_ID", "Airwallex web app → Developer → API keys");
  checkPresent("AIRWALLEX_API_KEY", "Same page as the Client ID");
  checkPresent("AIRWALLEX_DEFAULT_CURRENCY", "ISO-4217, e.g. USD");

  const clientId = env("AIRWALLEX_CLIENT_ID");
  const apiKey = env("AIRWALLEX_API_KEY");
  if (!clientId || !apiKey) {
    line();
    line("   Set the Client ID and API key, then run this again and it will");
    line("   print your legal entity id and linked payment account id.");
    return;
  }

  let token: string;
  try {
    const res = await fetch(`${base}/api/v1/authentication/login`, {
      method: "POST",
      headers: { "x-client-id": clientId, "x-api-key": apiKey, "Content-Type": "application/json" },
    });
    if (!res.ok) {
      report("missing", "airwallex auth", `login failed (${res.status}). Check the key and the base URL match the same org.`);
      return;
    }
    token = ((await res.json()) as { token: string }).token;
    report("ok", "airwallex auth", "token issued");
  } catch {
    report("missing", "airwallex auth", `could not reach ${base}`);
    return;
  }

  // Both ids the README tells you to hunt for come from this one call.
  let account: { id?: string; account_details?: { legal_entity_id?: string } };
  try {
    const res = await fetch(`${base}/api/v1/account`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    account = (await res.json()) as typeof account;
  } catch {
    report("warn", "GET /api/v1/account", "could not read account details");
    return;
  }

  const realLe = account.account_details?.legal_entity_id;
  const realAcct = account.id;

  compareId("AIRWALLEX_LEGAL_ENTITY_ID", realLe, "le_");
  compareId("AIRWALLEX_LINKED_PAYMENT_ACCOUNT_ID", realAcct, "acct_");
}

/**
 * The upstream troubleshooting table warns that an id from a different org than
 * AIRWALLEX_BASE_URL fails at Approve time. Comparing against the live account
 * turns that into a message now.
 */
function compareId(key: string, actual: string | undefined, prefix: string) {
  const set = env(key);

  if (!actual) {
    if (set) report("ok", key, set);
    else report("missing", key, "not set, and the API did not return one either");
    return;
  }

  if (!set || set === prefix) {
    report("missing", key, `not set. Use: ${actual}`);
    return;
  }
  if (set !== actual) {
    report("missing", key, `set to ${set}, but this account is ${actual}`);
    return;
  }
  report("ok", key, actual);
}

// ── LLM ─────────────────────────────────────────────────────────────────────

function checkLlm() {
  line();
  line("Extraction model");
  const provider = (env("LLM_PROVIDER") || "openai").toLowerCase();
  report("ok", "LLM_PROVIDER", provider);

  if (provider === "anthropic") {
    checkPresent("ANTHROPIC_API_KEY", "console.anthropic.com");
    const model = env("ANTHROPIC_MODEL");
    if (model && !/^claude-sonnet-5-5$/.test(model)) {
      report("warn", "ANTHROPIC_MODEL", `${model} is not the current default. claude-sonnet-5-5 is current.`);
    }
  } else if (provider === "openai") {
    checkPresent("OPENAI_API_KEY", "platform.openai.com");
  } else {
    report("missing", "LLM_PROVIDER", `"${provider}" is not openai or anthropic`);
  }
}

// ── Run ─────────────────────────────────────────────────────────────────────

async function main() {
  line();
  line("Airwallex Slack invoicing bot — preflight");
  line("─".repeat(64));
  await checkSlack();
  await checkAirwallex();
  checkLlm();
  line("─".repeat(64));

  if (failures > 0) {
    line();
    line(`${failures} thing${failures === 1 ? "" : "s"} to fix before the bot will start.`);
    line("Add them in the Secrets panel, the lock icon in the left sidebar.");
    line();
    process.exit(1);
  }

  line();
  line(warnings > 0 ? `Ready, with ${warnings} warning${warnings === 1 ? "" : "s"} above.` : "Ready.");
  line("Starting the bot. Watch for: Invoice bot is running as ...");
  line("If that line never appears, the bot did not start. Run `npm run dev`");
  line("and leave it running, because Socket Mode needs a live process.");
  line("Then invite the bot to a channel and mention it in a thread that has");
  line("a project description and a price.");
  line();
}

main();
