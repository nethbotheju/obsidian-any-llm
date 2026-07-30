import { App, normalizePath } from "obsidian";
import type { Conversation, PluginSettings, ProviderConfig } from "./types";

export const DEFAULT_SETTINGS: PluginSettings = {
  providers: [],
  defaultModel: "",
  defaultSystemPrompt: "You are a helpful assistant.",
};

export function conversationsDir(pluginId: string): string {
  return normalizePath(`.obsidian/plugins/${pluginId}/conversations`);
}

function convPath(pluginId: string, id: string): string {
  return normalizePath(`${conversationsDir(pluginId)}/${id}.json`);
}

async function ensureDir(app: App, dir: string): Promise<void> {
  if (!(await app.vault.adapter.exists(dir))) {
    await app.vault.adapter.mkdir(dir);
  }
}

export async function listConversations(app: App, pluginId: string): Promise<Conversation[]> {
  const dir = conversationsDir(pluginId);
  if (!(await app.vault.adapter.exists(dir))) return [];
  const listing = await app.vault.adapter.list(dir);
  const out: Conversation[] = [];
  for (const file of listing.files) {
    if (!file.endsWith(".json")) continue;
    try {
      const conv = JSON.parse(await app.vault.adapter.read(file)) as Conversation;
      if (conv && conv.id) out.push(conv);
    } catch {
      // skip corrupt files
    }
  }
  out.sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  return out;
}

export async function loadConversation(app: App, pluginId: string, id: string): Promise<Conversation | null> {
  const path = convPath(pluginId, id);
  if (!(await app.vault.adapter.exists(path))) return null;
  try {
    return JSON.parse(await app.vault.adapter.read(path)) as Conversation;
  } catch {
    return null;
  }
}

export async function saveConversation(app: App, pluginId: string, conv: Conversation): Promise<void> {
  await ensureDir(app, conversationsDir(pluginId));
  await app.vault.adapter.write(convPath(pluginId, conv.id), JSON.stringify(conv, null, 2));
}

export async function deleteConversation(app: App, pluginId: string, id: string): Promise<void> {
  const path = convPath(pluginId, id);
  if (await app.vault.adapter.exists(path)) {
    await app.vault.adapter.remove(path);
  }
}
