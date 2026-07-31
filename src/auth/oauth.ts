import { requestUrl } from "obsidian";
import type { StoredToken } from "../types";

export interface OAuthSpec {
  name: string;
  authorizeUrl: string;
  tokenUrl: string;
  clientId: string;
  redirectUri: string;
  scope: string;
  jsonBody?: boolean; // Claude uses JSON, OpenAI uses form-encoded
  expiresBufferMs?: number;
  extraAuthParams?: Record<string, string>;
  extractAccountId?: (jwt: string) => string | null;
}

export const OAUTH_SPECS: Record<string, OAuthSpec> = {
  chatgpt: {
    name: "ChatGPT",
    authorizeUrl: "https://auth.openai.com/oauth/authorize",
    tokenUrl: "https://auth.openai.com/oauth/token",
    clientId: "app_EMoamEEZ73f0CkXaXp7hrann",
    redirectUri: "http://localhost:1455/auth/callback",
    scope: "openid profile email offline_access",
    extraAuthParams: {
      id_token_add_organizations: "true",
      codex_cli_simplified_flow: "true",
      originator: "openai-codex", // ponytail: verify against a known Codex originator allowlist; change if OpenAI rejects
    },
    extractAccountId: extractOpenAIAccountId,
  },
  claude: {
    name: "Claude",
    authorizeUrl: "https://claude.ai/oauth/authorize",
    tokenUrl: "https://platform.claude.com/v1/oauth/token",
    clientId: "9d1c250a-e61b-44d9-88ed-5944d1962f5e",
    redirectUri: "http://localhost:53692/callback",
    scope:
      "org:create_api_key user:profile user:inference user:sessions:claude_code user:mcp_servers user:file_upload",
    jsonBody: true,
    expiresBufferMs: 5 * 60 * 1000,
  },
};

function base64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  let out = "";
  for (const b of arr) out += b.toString(16).padStart(2, "0");
  return out;
}

async function generatePKCE(): Promise<{ verifier: string; challenge: string }> {
  const verifierBytes = new Uint8Array(32);
  crypto.getRandomValues(verifierBytes);
  const verifier = base64url(verifierBytes);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  const challenge = base64url(new Uint8Array(digest));
  return { verifier, challenge };
}

function extractOpenAIAccountId(jwt: string): string | null {
  try {
    const payload = JSON.parse(atob(jwt.split(".")[1] ?? ""));
    const id = payload?.["https://api.openai.com/auth"]?.chatgpt_account_id;
    return typeof id === "string" && id.length > 0 ? id : null;
  } catch {
    return null;
  }
}

export interface AuthRequest {
  verifier: string;
  state: string;
  url: string;
}

export async function buildAuthUrl(spec: OAuthSpec): Promise<AuthRequest> {
  const { verifier, challenge } = await generatePKCE();
  const state = randomHex(16);
  const url = new URL(spec.authorizeUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", spec.clientId);
  url.searchParams.set("redirect_uri", spec.redirectUri);
  url.searchParams.set("scope", spec.scope);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", state);
  if (spec.extraAuthParams) for (const [k, v] of Object.entries(spec.extraAuthParams)) url.searchParams.set(k, v);
  return { verifier, state, url: url.toString() };
}

export function parseRedirectInput(input: string, expectedState: string): { code: string; state: string } | null {
  const value = input.trim();
  if (!value) return null;
  let params: URLSearchParams | null = null;
  try {
    const url = new URL(value);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (code) return { code, state: state ?? "" };
    params = null;
  } catch {
    // not a URL; try code= form
  }
  if (value.includes("code=")) {
    params = new URLSearchParams(value);
  }
  if (params) {
    const code = params.get("code");
    const state = params.get("state");
    if (code) return { code, state: state ?? "" };
  }
  // bare code (no spaces, no = or #) — real auth codes are single tokens
  if (value && !value.includes("=") && !value.includes("#") && !/\s/.test(value)) {
    return { code: value, state: "" };
  }
  return null;
}

async function postToken(
  spec: OAuthSpec,
  body: Record<string, string>,
): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
  const isJson = !!spec.jsonBody;
  const res = await requestUrl({
    url: spec.tokenUrl,
    method: "POST",
    headers: isJson
      ? { "Content-Type": "application/json", Accept: "application/json" }
      : { "Content-Type": "application/x-www-form-urlencoded" },
    body: isJson ? JSON.stringify(body) : new URLSearchParams(body).toString(),
    throw: false,
  });
  if (res.status >= 400) {
    const txt = typeof res.text === "string" ? res.text : JSON.stringify(res.json ?? "");
    throw new Error(`${spec.name} token request failed (${res.status}): ${txt}`);
  }
  const json = res.json ?? (typeof res.text === "string" ? JSON.parse(res.text) : null);
  if (!json?.access_token || !json.refresh_token || typeof json.expires_in !== "number") {
    throw new Error(`${spec.name} token response missing fields: ${JSON.stringify(json).slice(0, 300)}`);
  }
  return json;
}

function toToken(spec: OAuthSpec, raw: { access_token: string; refresh_token: string; expires_in: number }): StoredToken {
  const token: StoredToken = {
    access: raw.access_token,
    refresh: raw.refresh_token,
    expires: Date.now() + raw.expires_in * 1000 - (spec.expiresBufferMs ?? 0),
  };
  if (spec.extractAccountId) {
    const accountId = spec.extractAccountId(raw.access_token);
    if (accountId) token.accountId = accountId;
    else throw new Error(`${spec.name}: access token missing account id`);
  }
  return token;
}

export async function exchangeCode(
  spec: OAuthSpec,
  auth: AuthRequest,
  code: string,
  state: string,
): Promise<StoredToken> {
  const body: Record<string, string> = {
    grant_type: "authorization_code",
    client_id: spec.clientId,
    code,
    code_verifier: auth.verifier,
    redirect_uri: spec.redirectUri,
  };
  if (spec.jsonBody) body.state = state;
  return toToken(spec, await postToken(spec, body));
}

export async function refreshAccessToken(spec: OAuthSpec, refreshToken: string): Promise<StoredToken> {
  const body: Record<string, string> = {
    grant_type: "refresh_token",
    client_id: spec.clientId,
    refresh_token: refreshToken,
  };
  return toToken(spec, await postToken(spec, body));
}

export function isTokenFresh(token: StoredToken | undefined, bufferMs = 60_000): boolean {
  return !!token && token.expires - Date.now() > bufferMs;
}

// Orchestrates login: builds the auth URL, asks the caller to obtain the
// pasted redirect URL (via a modal), then exchanges the code for a token.
export async function loginWithOAuth(
  spec: OAuthSpec,
  prompt: (auth: AuthRequest) => Promise<string | null>,
): Promise<StoredToken> {
  const auth = await buildAuthUrl(spec);
  const pasted = await prompt(auth);
  if (!pasted) throw new Error("Login cancelled");
  const parsed = parseRedirectInput(pasted, auth.state);
  if (!parsed?.code) throw new Error("Could not read the authorization code. Paste the full URL your browser redirected to.");
  if (parsed.state && parsed.state !== auth.state) throw new Error("Login state mismatch — please try again.");
  return exchangeCode(spec, auth, parsed.code, parsed.state || auth.state);
}