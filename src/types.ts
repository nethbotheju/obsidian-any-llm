export interface StoredToken {
  access: string;
  refresh: string;
  expires: number;
  accountId?: string;
}

export interface ProviderConfig {
  id: string;
  providerId: string;
  name?: string;
  apiKey?: string;
  baseURL?: string;
  customModels?: string[];
  token?: StoredToken;
}

export type AttachmentModality = "text" | "image" | "audio" | "video" | "pdf";

export interface ChatAttachment {
  id: string;
  filename: string;
  mediaType: string;
  modality: AttachmentModality;
  size: number;
  data: string;
}

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  attachments?: ChatAttachment[];
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