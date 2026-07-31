import { App, normalizePath, requestUrl } from "obsidian";
import type { ModelInfo } from "./catalog";

const MODELS_DEV_API = "https://models.dev/api.json";
const MODELS_DEV_LOGO = (id: string) => `https://models.dev/logos/${id}.svg`;

interface ApiModel {
  id: string;
  name: string;
  modalities?: { input?: string[]; output?: string[] };
  limit?: { context?: number; output?: number; input?: number };
  reasoning?: boolean;
  tool_call?: boolean;
  attachment?: boolean;
}

interface ApiProvider {
  id: string;
  name: string;
  models: Record<string, ApiModel>;
}

export interface CacheEntry {
  syncedAt: string;
  models: ModelInfo[];
}

export type ModelCache = Record<string, CacheEntry>;

export function cachePath(manifestId: string): string {
  return normalizePath(`.obsidian/plugins/${manifestId}/models-cache.json`);
}

export async function readCache(app: App, manifestId: string): Promise<ModelCache> {
  const path = cachePath(manifestId);
  if (!(await app.vault.adapter.exists(path))) return {};
  try {
    return JSON.parse(await app.vault.adapter.read(path)) as ModelCache;
  } catch {
    return {};
  }
}

export async function writeCache(app: App, manifestId: string, cache: ModelCache): Promise<void> {
  await app.vault.adapter.write(cachePath(manifestId), JSON.stringify(cache, null, 2));
}

export interface LogoEntry {
  svg: string;
  syncedAt: string;
}

export type LogoCache = Record<string, LogoEntry>;

export function logoCachePath(manifestId: string): string {
  return normalizePath(`.obsidian/plugins/${manifestId}/logos-cache.json`);
}

export async function readLogoCache(app: App, manifestId: string): Promise<LogoCache> {
  const path = logoCachePath(manifestId);
  if (!(await app.vault.adapter.exists(path))) return {};
  try {
    return JSON.parse(await app.vault.adapter.read(path)) as LogoCache;
  } catch {
    return {};
  }
}

export async function writeLogoCache(app: App, manifestId: string, cache: LogoCache): Promise<void> {
  await app.vault.adapter.write(logoCachePath(manifestId), JSON.stringify(cache, null, 2));
}

function cleanSvg(raw: string): string {
  const start = raw.indexOf("<svg");
  if (start < 0) return "";
  let svg = raw.slice(start);
  svg = svg.replace(/<svg([^>]*)>/, (_m, attrs: string) => {
    const stripped = attrs.replace(/\s(?:width|height)\s*=\s*(?:"[^"]*"|'[^']*')/g, "");
    return `<svg${stripped}>`;
  });
  return svg;
}

export async function syncLogos(
  app: App,
  manifestId: string,
  cache: LogoCache,
  ids: string[],
): Promise<LogoCache> {
  const missing = ids.filter((id) => id && !cache[id]);
  if (missing.length === 0) return cache;
  const next: LogoCache = { ...cache };
  const now = new Date().toISOString();
  await Promise.all(
    missing.map(async (id) => {
      try {
        const res = await requestUrl({ url: MODELS_DEV_LOGO(encodeURIComponent(id)), method: "GET", throw: false });
        if (res.status >= 400) return;
        const svg = cleanSvg(res.text as string);
        if (svg.startsWith("<svg")) next[id] = { svg, syncedAt: now };
      } catch {
        // leave absent -> caller falls back to a lucide icon
      }
    }),
  );
  if (Object.keys(next).length !== Object.keys(cache).length) await writeLogoCache(app, manifestId, next);
  return next;
}

function toModelInfo(id: string, m: ApiModel): ModelInfo {
  return {
    id,
    name: m.name || id,
    modalities: {
      input: m.modalities?.input ?? ["text"],
      output: m.modalities?.output ?? ["text"],
    },
    limit: {
      context: m.limit?.context ?? 0,
      output: m.limit?.output ?? 0,
      input: m.limit?.input ?? 0,
    },
    reasoning: !!m.reasoning,
    toolCall: !!m.tool_call,
    attachment: m.attachment,
  };
}

async function fetchApi(): Promise<Record<string, ApiProvider>> {
  const res = await requestUrl({ url: MODELS_DEV_API, method: "GET", throw: false });
  if (res.status >= 400) throw new Error(`models.dev request failed: ${res.status}`);
  const data = res.json ?? JSON.parse(res.text as string);
  return data as Record<string, ApiProvider>;
}

export async function syncProviders(
  app: App,
  manifestId: string,
  cache: ModelCache,
  modelsDevIds: string[],
): Promise<ModelCache> {
  const api = await fetchApi();
  const next: ModelCache = { ...cache };
  const now = new Date().toISOString();
  for (const id of modelsDevIds) {
    const provider = api[id];
    if (!provider?.models) {
      next[id] = { syncedAt: now, models: [] };
      continue;
    }
    const models = Object.entries(provider.models)
      .filter(([, m]) => !!m.modalities?.output?.includes("text"))
      .map(([id, m]) => toModelInfo(id, m));
    next[id] = { syncedAt: now, models };
  }
  await writeCache(app, manifestId, next);
  return next;
}