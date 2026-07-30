import { Notice, Plugin } from "obsidian";
import { ChatView, VIEW_TYPE_CHAT } from "./ChatView";
import { ChatSettingTab } from "./settings-tab";
import { DEFAULT_SETTINGS } from "./store";
import { buildRegistry } from "./llm";
import { CATALOG_BY_ID, type ModelInfo } from "./catalog";
import { readCache, syncProviders, type ModelCache } from "./sync";
import type { PluginSettings, ProviderConfig } from "./types";

export default class AIChatPlugin extends Plugin {
  settings: PluginSettings = DEFAULT_SETTINGS;
  registry = buildRegistry(DEFAULT_SETTINGS);
  modelCache: ModelCache = {};

  async onload() {
    await this.loadSettings();
    this.modelCache = await readCache(this.app, this.manifest.id);
    this.rebuildRegistry();

    this.registerView(VIEW_TYPE_CHAT, (leaf) => new ChatView(leaf, this));

    this.addRibbonIcon("message-square", "Open AI Chat", () => this.activateView());
    this.addCommand({
      id: "open-chat",
      name: "Open AI Chat",
      callback: () => this.activateView(),
    });

    this.addSettingTab(new ChatSettingTab(this.app, this));
  }

  async activateView() {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(VIEW_TYPE_CHAT)[0];
    if (!leaf) {
      leaf = workspace.getRightLeaf(false) ?? workspace.getLeaf(false);
      await leaf.setViewState({ type: VIEW_TYPE_CHAT, active: true });
    }
    workspace.revealLeaf(leaf);
  }

  rebuildRegistry() {
    this.registry = buildRegistry(this.settings);
  }

  getModels(p: ProviderConfig): ModelInfo[] {
    const cat = CATALOG_BY_ID[p.providerId];
    if (cat?.builtinModels) return cat.builtinModels;
    if (cat?.custom || p.customModels) {
      return (p.customModels ?? []).map((id) => ({
        id,
        name: id,
        modalities: { input: ["text"], output: ["text"] },
        limit: { context: 0, output: 0, input: 0 },
        reasoning: false,
        toolCall: false,
      }));
    }
    return this.modelCache[cat?.modelsDevId ?? p.providerId]?.models ?? [];
  }

  async syncAll(): Promise<void> {
    const ids = this.settings.providers
      .map((p) => CATALOG_BY_ID[p.providerId]?.modelsDevId)
      .filter((id): id is string => !!id);
    const unique = [...new Set(ids)];
    if (unique.length === 0) {
      new Notice("Add a provider first, then sync.");
      return;
    }
    this.modelCache = await syncProviders(this.app, this.manifest.id, this.modelCache, unique);
  }

  async syncOne(modelsDevId: string): Promise<void> {
    this.modelCache = await syncProviders(this.app, this.manifest.id, this.modelCache, [modelsDevId]);
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
    this.rebuildRegistry();
  }
}