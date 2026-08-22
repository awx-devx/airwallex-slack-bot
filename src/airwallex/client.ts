import { config } from "../config.js";

type TokenCache = {
  token: string;
  expiresAt: number;
};

let tokenCache: TokenCache | undefined;

export class AirwallexError extends Error {
  readonly status: number;
  readonly body: string;

  constructor(status: number, body: string) {
    super(`Airwallex ${status}: ${body}`);
    this.name = "AirwallexError";
    this.status = status;
    this.body = body;
  }
}

function parseExpiresAt(value: string): number {
  const normalized = value.replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
  const ms = Date.parse(normalized);
  if (Number.isNaN(ms)) {
    return Date.now() + 25 * 60 * 1000;
  }
  return ms;
}

async function login(): Promise<TokenCache> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-client-id": config.airwallex.clientId,
    "x-api-key": config.airwallex.apiKey,
  };
  if (config.airwallex.loginAs) {
    headers["x-login-as"] = config.airwallex.loginAs;
  }

  const response = await fetch(
    `${config.airwallex.baseUrl}/api/v1/authentication/login`,
    { method: "POST", headers },
  );
  const body = await response.text();
  if (!response.ok) {
    throw new AirwallexError(response.status, body);
  }

  const data = JSON.parse(body) as { token: string; expires_at: string };
  return {
    token: data.token,
    expiresAt: parseExpiresAt(data.expires_at),
  };
}

async function getToken(): Promise<string> {
  const refreshAt = Date.now() + 60_000;
  if (tokenCache && tokenCache.expiresAt > refreshAt) {
    return tokenCache.token;
  }
  tokenCache = await login();
  return tokenCache.token;
}

export async function airwallexRequest<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const token = await getToken();
  const response = await fetch(`${config.airwallex.baseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new AirwallexError(response.status, text);
  }
  return text ? (JSON.parse(text) as T) : ({} as T);
}
