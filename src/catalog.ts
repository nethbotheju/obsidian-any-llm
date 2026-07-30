export type ProviderType = "openai" | "anthropic" | "google" | "openai-compatible" | "claude-sub" | "codex-sub";

export type AuthType = "apikey" | "oauth";

export interface ModelInfo {
  id: string;
  name: string;
  modalities: { input: string[]; output: string[] };
  limit: { context: number; output: number; input: number };
  reasoning: boolean;
  toolCall: boolean;
  attachment?: boolean;
}

export interface CatalogProvider {
  providerId: string;
  name: string;
  authType: AuthType;
  sdk: ProviderType;
  baseURL?: string;
  docUrl?: string;
  modelsDevId?: string;
  custom?: boolean;
  oauthKind?: "chatgpt" | "claude";
}

export const CATALOG: CatalogProvider[] = [
  { providerId: "openai", name: "OpenAI", authType: "apikey", sdk: "openai", modelsDevId: "openai", docUrl: "https://platform.openai.com/api-keys" },
  { providerId: "anthropic", name: "Anthropic (Claude)", authType: "apikey", sdk: "anthropic", modelsDevId: "anthropic", docUrl: "https://console.anthropic.com/settings/keys" },
  { providerId: "google", name: "Google (Gemini)", authType: "apikey", sdk: "google", modelsDevId: "google", docUrl: "https://aistudio.google.com/apikey" },
  { providerId: "deepseek", name: "DeepSeek", authType: "apikey", sdk: "openai-compatible", baseURL: "https://api.deepseek.com", modelsDevId: "deepseek", docUrl: "https://platform.deepseek.com/api_keys" },
  { providerId: "groq", name: "Groq", authType: "apikey", sdk: "openai-compatible", baseURL: "https://api.groq.com/openai", modelsDevId: "groq", docUrl: "https://console.groq.com/keys" },
  { providerId: "mistral", name: "Mistral", authType: "apikey", sdk: "openai-compatible", baseURL: "https://api.mistral.ai/v1", modelsDevId: "mistral", docUrl: "https://console.mistral.ai/api-keys" },
  { providerId: "xai", name: "xAI (Grok)", authType: "apikey", sdk: "openai-compatible", baseURL: "https://api.x.ai/v1", modelsDevId: "xai", docUrl: "https://console.x.ai" },
  { providerId: "openrouter", name: "OpenRouter", authType: "apikey", sdk: "openai-compatible", baseURL: "https://openrouter.ai/api/v1", modelsDevId: "openrouter", docUrl: "https://openrouter.ai/keys" },
  { providerId: "togetherai", name: "Together AI", authType: "apikey", sdk: "openai-compatible", baseURL: "https://api.together.xyz/v1", modelsDevId: "togetherai", docUrl: "https://api.together.xyz/settings/api-keys" },
  { providerId: "fireworks-ai", name: "Fireworks AI", authType: "apikey", sdk: "openai-compatible", baseURL: "https://api.fireworks.ai/inference/v1", modelsDevId: "fireworks-ai", docUrl: "https://fireworks.ai/api-keys" },
  { providerId: "cerebras", name: "Cerebras", authType: "apikey", sdk: "openai-compatible", baseURL: "https://api.cerebras.ai/v1", modelsDevId: "cerebras", docUrl: "https://cloud.cerebras.ai" },
  { providerId: "perplexity", name: "Perplexity", authType: "apikey", sdk: "openai-compatible", baseURL: "https://api.perplexity.ai", modelsDevId: "perplexity", docUrl: "https://www.perplexity.ai/settings/api" },
  { providerId: "opencode-go", name: "OpenCode Go", authType: "apikey", sdk: "openai-compatible", baseURL: "https://opencode.ai/zen/go/v1", modelsDevId: "opencode-go", docUrl: "https://opencode.ai" },
  { providerId: "chatgpt-sub", name: "ChatGPT (Plus/Pro)", authType: "oauth", sdk: "codex-sub", oauthKind: "chatgpt", modelsDevId: "openai" },
  { providerId: "claude-sub", name: "Claude (Pro/Max)", authType: "oauth", sdk: "claude-sub", oauthKind: "claude", modelsDevId: "anthropic" },
  { providerId: "ollama", name: "Ollama (local)", authType: "apikey", sdk: "openai-compatible", baseURL: "http://localhost:11434/v1", custom: true, docUrl: "https://ollama.com" },
  { providerId: "custom", name: "Custom (OpenAI-compatible)", authType: "apikey", sdk: "openai-compatible", custom: true },
];

export const CATALOG_BY_ID: Record<string, CatalogProvider> = Object.fromEntries(
  CATALOG.map((c) => [c.providerId, c]),
);

export function isChatModel(output: string[] | undefined): boolean {
  return !!output && output.includes("text");
}

export interface UsableProvider {
  providerId: string;
  apiKey?: string;
  token?: { access: string };
}

// A provider only shows models / is selectable once it has credentials
// (an API key for apikey providers, or a signed-in token for oauth ones).
export function providerUsable(p: UsableProvider): boolean {
  const cat = CATALOG_BY_ID[p.providerId];
  if (!cat) return false;
  return cat.authType === "oauth" ? !!p.token : !!p.apiKey;
}