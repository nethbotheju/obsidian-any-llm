import {
  APICallError,
  createProviderRegistry,
  RetryError,
  streamText,
  type FilePart,
  type LanguageModel,
  type ModelMessage,
  type TextPart,
} from "ai";

export interface ModelResolver {
  languageModel(modelId: string): LanguageModel;
}
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { requestUrl } from "obsidian";
import type { ChatAttachment, ChatMessage, PluginSettings, ProviderConfig } from "./types";
import { CATALOG_BY_ID } from "./catalog";

// ponytail: native fetch streams when CORS allows; falls back to Obsidian's
// requestUrl (bypasses CORS, buffered so no live streaming) on network error.
export async function aiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (typeof fetch === "function") {
    try {
      return await fetch(input as RequestInfo, init);
    } catch (error) {
      if (init?.signal?.aborted) throw error;
      // CORS/network failure -> buffered fallback below
    }
  }
  return requestUrlFetch(input, init);
}

async function requestUrlFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const method =
    init?.method ??
    (typeof input !== "string" && !(input instanceof URL) ? input.method : "GET");

  const headers: Record<string, string> = {};
  const headerSource =
    init?.headers ??
    (typeof input !== "string" && !(input instanceof URL) ? input.headers : undefined);
  if (headerSource) {
    if (headerSource instanceof Headers) headerSource.forEach((v, k) => (headers[k] = v));
    else if (Array.isArray(headerSource)) headerSource.forEach(([k, v]) => (headers[k] = v));
    else Object.assign(headers, headerSource);
  }

  const contentType = headers["content-type"] ?? headers["Content-Type"];
  const rawBody = init?.body;
  let body: string | ArrayBuffer | undefined;
  if (typeof rawBody === "string") body = rawBody;
  else if (rawBody instanceof ArrayBuffer) body = rawBody;
  else if (rawBody instanceof Uint8Array)
    body = rawBody.buffer.slice(rawBody.byteOffset, rawBody.byteOffset + rawBody.byteLength) as ArrayBuffer;
  else if (rawBody == null) body = undefined;
  else body = JSON.stringify(rawBody);

  const res = await requestUrl({ url, method, headers, body, contentType, throw: false });

  const text = typeof res.text === "string" ? res.text : "";
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text));
      controller.close();
    },
  });
  const responseHeaders = new Headers();
  for (const [k, v] of Object.entries(res.headers ?? {})) {
    if (v != null) responseHeaders.set(k, String(v));
  }
  return new Response(stream, { status: res.status, headers: responseHeaders });
}

function makeProvider(p: ProviderConfig): unknown | null {
  const fetch = aiFetch as unknown as typeof globalThis.fetch;
  const cat = CATALOG_BY_ID[p.providerId];
  const sdk = cat?.sdk ?? "openai-compatible";
  const baseURL = p.baseURL ?? cat?.baseURL;
  switch (sdk) {
    case "openai":
      return createOpenAI({ apiKey: p.apiKey, baseURL, fetch });
    case "anthropic":
      return createAnthropic({ apiKey: p.apiKey, baseURL, fetch });
    case "google":
      return createGoogleGenerativeAI({ apiKey: p.apiKey, baseURL, fetch });
    case "claude-sub":
      if (!p.token) return null;
      return createAnthropic({
        authToken: p.token.access,
        headers: { "anthropic-beta": "claude-code-20250219,oauth-2025-04-20" },
        fetch,
      });
    case "codex-sub":
      if (!p.token) return null;
      return {
        languageModel: (modelId: string) =>
          createOpenAI({
            baseURL: "https://chatgpt.com/backend-api/codex",
            apiKey: p.token!.access,
            headers: {
              "chatgpt-account-id": p.token!.accountId ?? "",
              originator: "openai-codex",
              "OpenAI-Beta": "responses=experimental",
            },
            fetch,
          }).responses(modelId),
      };
    case "openai-compatible":
    default:
      return createOpenAICompatible({ name: p.id, baseURL: baseURL ?? "", apiKey: p.apiKey, fetch });
  }
}

export function buildRegistry(settings: PluginSettings): ModelResolver {
  const providers: Record<string, unknown> = {};
  for (const p of settings.providers) {
    const made = makeProvider(p);
    if (made) providers[p.id] = made;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createProviderRegistry(providers as any) as unknown as ModelResolver;
}

export function resolveModel(registry: ModelResolver, ref: string): LanguageModel {
  return registry.languageModel(ref);
}

export interface StreamOptions {
  model: LanguageModel;
  system?: string;
  messages: ChatMessage[];
  onDelta: (full: string) => void;
  signal?: AbortSignal;
}

function findApiError(error: unknown): APICallError | undefined {
  let current: unknown = error;
  for (let i = 0; i < 10 && current; i++) {
    if (APICallError.isInstance(current)) return current;
    current =
      RetryError.isInstance(current) ? current.lastError
      : current instanceof Error ? (current as Error & { cause?: unknown }).cause
      : undefined;
  }
  return undefined;
}

const STATUS_HINTS: Record<number, string> = {
  401: "Authentication failed. Check the provider API key or sign in again.",
  403: "Authentication failed. Check the provider API key or sign in again.",
  404: "The model or endpoint was not found. Check the selected model and base URL.",
  408: "The provider timed out. Try again or choose another model.",
  429: "The provider rate limit was reached. Try again later.",
  504: "The provider timed out. Try again or choose another model.",
};

// Friendly single-line message. The full error (status, provider response body,
// stack) is logged via console.error at the call site for real debugging.
export function describeChatError(error: unknown): string {
  const apiError = findApiError(error);
  const status = apiError?.statusCode;
  const raw = (error instanceof Error && error.message) || String(error);

  if (status && STATUS_HINTS[status]) return STATUS_HINTS[status];
  if (status && status >= 500) return "The provider is unavailable. Try again in a moment.";
  if (/empty|no output|without returning/i.test(raw)) {
    return "The provider ended the request without returning a response. Try again or choose another model.";
  }
  if (/failed to fetch|network|cors|econnrefused|enotfound|etimedout/i.test(raw)) {
    return "The provider could not be reached. Check your connection and base URL.";
  }
  return raw || "Unknown error.";
}

function decodeText(data: string): string {
  const binary = atob(data);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function attachmentPart(attachment: ChatAttachment): TextPart | FilePart {
  if (attachment.modality === "text") {
    return {
      type: "text",
      text: `\n\n[Attached file: ${attachment.filename}]\n${decodeText(attachment.data)}\n[End attached file]`,
    };
  }
  return {
    type: "file",
    mediaType: attachment.mediaType,
    filename: attachment.filename,
    data: { type: "data", data: attachment.data },
  };
}

export function toModelMessages(messages: ChatMessage[]): ModelMessage[] {
  return messages
    .filter((m) => m.role !== "system")
    .map((m) => {
      if (m.role !== "user" || !m.attachments?.length) {
        return { role: m.role as "user" | "assistant", content: m.content };
      }
      const content: Array<TextPart | FilePart> = [];
      if (m.content) content.push({ type: "text", text: m.content });
      content.push(...m.attachments.map(attachmentPart));
      return { role: "user", content };
    });
}

export async function streamChat(opts: StreamOptions): Promise<string> {
  const messages = toModelMessages(opts.messages);

  let streamError: unknown;
  const result = streamText({
    model: opts.model,
    system: opts.system,
    messages,
    abortSignal: opts.signal,
    onError: ({ error }) => {
      streamError ??= error;
    },
    // Codex subscription backend requires store:false + reasoning.encrypted_content;
    // other providers ignore the openai namespace.
    providerOptions: { openai: { store: false, include: ["reasoning.encrypted_content"] } },
  });

  let full = "";
  for await (const delta of result.textStream) {
    full += delta;
    opts.onDelta(full);
  }
  if (streamError !== undefined) throw streamError;
  if (!full.trim()) throw new Error("The model returned an empty response.");
  return full;
}
