import { createProviderRegistry, streamText, type LanguageModel } from "ai";

export interface ModelResolver {
  languageModel(modelId: string): LanguageModel;
}
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { requestUrl } from "obsidian";
import type { ChatMessage, PluginSettings, ProviderConfig } from "./types";
import { CATALOG_BY_ID } from "./catalog";

// ponytail: native fetch streams when CORS allows; falls back to Obsidian's
// requestUrl (bypasses CORS, buffered so no live streaming) on network error.
export async function aiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (typeof fetch === "function") {
    try {
      return await fetch(input as RequestInfo, init);
    } catch {
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

function makeProvider(p: ProviderConfig) {
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
    case "openai-compatible":
    default:
      return createOpenAICompatible({ name: p.id, baseURL: baseURL ?? "", apiKey: p.apiKey, fetch });
  }
}

export function buildRegistry(settings: PluginSettings): ModelResolver {
  const providers: Record<string, ReturnType<typeof makeProvider>> = {};
  for (const p of settings.providers) {
    providers[p.id] = makeProvider(p);
  }
  return createProviderRegistry(providers) as unknown as ModelResolver;
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

export async function streamChat(opts: StreamOptions): Promise<string> {
  const messages = opts.messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

  const result = streamText({
    model: opts.model,
    system: opts.system,
    messages,
    abortSignal: opts.signal,
  });

  let full = "";
  for await (const delta of result.textStream) {
    full += delta;
    opts.onDelta(full);
  }
  return full;
}
