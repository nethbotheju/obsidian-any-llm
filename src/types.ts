export type ProviderType = "openai" | "anthropic" | "google" | "openai-compatible";

export interface ProviderConfig {
  id: string;
  type: ProviderType;
  name?: string;
  apiKey?: string;
  baseURL?: string;
  models: string[];
}

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  model?: string;
  error?: boolean;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  model: string;
  systemPrompt?: string;
  messages: ChatMessage[];
}

export interface PluginSettings {
  providers: ProviderConfig[];
  defaultModel: string;
  defaultSystemPrompt: string;
}

export function modelRef(providerId: string, modelId: string): string {
  return `${providerId}:${modelId}`;
}

export function parseModelRef(ref: string): { providerId: string; modelId: string } {
  const idx = ref.indexOf(":");
  if (idx === -1) return { providerId: ref, modelId: "" };
  return { providerId: ref.slice(0, idx), modelId: ref.slice(idx + 1) };
}
