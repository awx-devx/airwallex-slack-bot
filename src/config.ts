import { config as loadEnv } from "dotenv";
import { z } from "zod";

loadEnv();

const optionalNumber = (value: string | undefined): number | undefined => {
  if (value === undefined || value.trim() === "") return undefined;
  const n = Number(value);
  if (Number.isNaN(n)) {
    throw new Error(`Expected a number, got ${value}`);
  }
  return n;
};

const rawSchema = z.object({
  SLACK_BOT_TOKEN: z.string().min(1),
  SLACK_APP_TOKEN: z.string().min(1),
  SLACK_SIGNING_SECRET: z.string().min(1),
  AIRWALLEX_CLIENT_ID: z.string().min(1),
  AIRWALLEX_API_KEY: z.string().min(1),
  AIRWALLEX_BASE_URL: z
    .string()
    .url()
    .refine(
      (url) =>
        url === "https://api.sandbox.airwallex.com" ||
        url === "https://api.airwallex.com" ||
        url.startsWith("https://api.sandbox.airwallex.com") ||
        url.startsWith("https://api.airwallex.com"),
      "AIRWALLEX_BASE_URL must be the sandbox or production Airwallex host",
    ),
  AIRWALLEX_LEGAL_ENTITY_ID: z.string().min(1),
  AIRWALLEX_LINKED_PAYMENT_ACCOUNT_ID: z.string().min(1),
  AIRWALLEX_DEFAULT_CURRENCY: z
    .string()
    .regex(/^[A-Za-z]{3}$/, "AIRWALLEX_DEFAULT_CURRENCY must be ISO-4217"),
  AIRWALLEX_DEFAULT_TAX_PERCENT: z.string().optional(),
  AIRWALLEX_DAYS_UNTIL_DUE: z.string().optional(),
  AIRWALLEX_LOGIN_AS: z.string().optional(),
  AIRWALLEX_SELLER_NAME: z.string().optional(),
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_MODEL: z.string().optional(),
  EMAIL_ENABLED: z.enum(["true", "false"]).optional(),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  CUSTOMER_MAP_PATH: z.string().optional(),
  LOG_LEVEL: z.string().optional(),
});

export type AppConfig = {
  slack: {
    botToken: string;
    appToken: string;
    signingSecret: string;
  };
  airwallex: {
    baseUrl: string;
    clientId: string;
    apiKey: string;
    legalEntityId: string;
    linkedPaymentAccountId: string;
    defaultCurrency: string;
    defaultTaxPercent?: number;
    daysUntilDue: number;
    loginAs?: string;
    sellerName?: string;
  };
  openai: {
    apiKey: string;
    model: string;
  };
  email: {
    enabled: boolean;
    resendApiKey?: string;
    from?: string;
  };
  customerMapPath: string;
  logLevel: string;
};

function parseConfig(): AppConfig {
  const parsed = rawSchema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment:\n${details}`);
  }

  const env = parsed.data;
  const emailEnabled = env.EMAIL_ENABLED === "true";
  if (emailEnabled && (!env.RESEND_API_KEY || !env.EMAIL_FROM)) {
    throw new Error(
      "EMAIL_ENABLED=true requires RESEND_API_KEY and EMAIL_FROM",
    );
  }

  const tax = optionalNumber(env.AIRWALLEX_DEFAULT_TAX_PERCENT);
  if (tax !== undefined && (tax < 0 || tax > 100)) {
    throw new Error("AIRWALLEX_DEFAULT_TAX_PERCENT must be between 0 and 100");
  }

  const daysUntilDue = optionalNumber(env.AIRWALLEX_DAYS_UNTIL_DUE) ?? 14;
  if (daysUntilDue < 0) {
    throw new Error("AIRWALLEX_DAYS_UNTIL_DUE must be >= 0");
  }

  return {
    slack: {
      botToken: env.SLACK_BOT_TOKEN,
      appToken: env.SLACK_APP_TOKEN,
      signingSecret: env.SLACK_SIGNING_SECRET,
    },
    airwallex: {
      baseUrl: env.AIRWALLEX_BASE_URL.replace(/\/$/, ""),
      clientId: env.AIRWALLEX_CLIENT_ID,
      apiKey: env.AIRWALLEX_API_KEY,
      legalEntityId: env.AIRWALLEX_LEGAL_ENTITY_ID,
      linkedPaymentAccountId: env.AIRWALLEX_LINKED_PAYMENT_ACCOUNT_ID,
      defaultCurrency: env.AIRWALLEX_DEFAULT_CURRENCY.toUpperCase(),
      defaultTaxPercent: tax,
      daysUntilDue,
      loginAs: env.AIRWALLEX_LOGIN_AS,
      sellerName: env.AIRWALLEX_SELLER_NAME,
    },
    openai: {
      apiKey: env.OPENAI_API_KEY,
      model: env.OPENAI_MODEL || "gpt-4o-mini",
    },
    email: {
      enabled: emailEnabled,
      resendApiKey: env.RESEND_API_KEY,
      from: env.EMAIL_FROM,
    },
    customerMapPath: env.CUSTOMER_MAP_PATH || "./data/customer-map.json",
    logLevel: (env.LOG_LEVEL || "info").toLowerCase(),
  };
}

export const config = parseConfig();
