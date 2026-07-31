import { addIcon, Notice, Plugin } from "obsidian";
import { ChatView, VIEW_TYPE_CHAT } from "./ChatView";
import { ChatSettingTab } from "./settings-tab";
import { DEFAULT_SETTINGS } from "./store";
import { buildRegistry } from "./llm";
import { CATALOG_BY_ID, type ModelInfo } from "./catalog";
import { readCache, readLogoCache, syncLogos, syncProviders, type LogoCache, type ModelCache } from "./sync";
import { OAUTH_SPECS, isTokenFresh, refreshAccessToken } from "./auth/oauth";
import type { PluginSettings, ProviderConfig, StoredToken } from "./types";

const LOGO_ICON_PREFIX = "models-dev-";

export default class AIChatPlugin extends Plugin {
  settings: PluginSettings = DEFAULT_SETTINGS;
  registry = buildRegistry(DEFAULT_SETTINGS);
  modelCache: ModelCache = {};
  logoCache: LogoCache = {};

  async onload() {
    await this.loadSettings();
    this.modelCache = await readCache(this.app, this.manifest.id);
    this.logoCache = await readLogoCache(this.app, this.manifest.id);
    this.registerLogos();
    this.rebuildRegistry();

    this.registerView(VIEW_TYPE_CHAT, (leaf) => new ChatView(leaf, this));

    this.addRibbonIcon("message-square", "Open AI Chat", () => this.activateView());
    this.addCommand({
      id: "open-chat",
      name: "Open AI Chat",
      callback: () => this.activateView(),
    });

    this.addSettingTab(new ChatSettingTab(this.app, this));

    // Fetch any provider logos still missing so icons show without a manual Sync.
    void this.refreshLogos();
  }

  private registerLogos(): void {
    for (const [id, entry] of Object.entries(this.logoCache)) {
      addIcon(`${LOGO_ICON_PREFIX}${id}`, entry.svg);
    }
  }

  private logoIds(): string[] {
    const ids = this.settings.providers
      .map((p) => CATALOG_BY_ID[p.providerId]?.modelsDevId)
      .filter((id): id is string => !!id);
    return [...new Set(ids)];
  }

  private async refreshLogos(): Promise<void> {
    const ids = this.logoIds();
    if (ids.length === 0) return;
    const before = Object.keys(this.logoCache).length;
    this.logoCache = await syncLogos(this.app, this.manifest.id, this.logoCache, ids);
    if (Object.keys(this.logoCache).length !== before) this.registerLogos();
  }

  // Returns the Obsidian icon name to use for a provider.
  // Prefers the cached models.dev logo; falls back to a lucide icon when no
  // logo has been fetched yet.
  providerIcon(providerId: string): string {
    const cat = CATALOG_BY_ID[providerId];
    const mid = cat?.modelsDevId;
    if (mid && this.logoCache[mid]) return `${LOGO_ICON_PREFIX}${mid}`;
    return "bot";
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
    const unique = this.logoIds();
    if (unique.length === 0) {
      new Notice("Add a provider first, then sync.");
      return;
    }
    this.modelCache = await syncProviders(this.app, this.manifest.id, this.modelCache, unique);
    this.logoCache = await syncLogos(this.app, this.manifest.id, this.logoCache, unique);
    this.registerLogos();
  }

  async syncOne(modelsDevId: string): Promise<void> {
    this.modelCache = await syncProviders(this.app, this.manifest.id, this.modelCache, [modelsDevId]);
    this.logoCache = await syncLogos(this.app, this.manifest.id, this.logoCache, [modelsDevId]);
    this.registerLogos();
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
    this.rebuildRegistry();
  }

  // Refresh any subscription token that is about to expire, then rebuild the
  // registry so providers carry a fresh access token. Call before sending.
  async ensureFreshTokens(): Promise<void> {
    let changed = false;
    for (const p of this.settings.providers) {
      const cat = CATALOG_BY_ID[p.providerId];
      if (cat?.oauthKind && p.token && !isTokenFresh(p.token)) {
        const spec = OAUTH_SPECS[cat.oauthKind];
        try {
          p.token = await refreshAccessToken(spec, p.token.refresh);
          changed = true;
        } catch (e) {
          new Notice(`Session expired for ${cat.name}. Please sign in again. (${e instanceof Error ? e.message : String(e)})`);
          p.token = undefined;
          changed = true;
        }
      }
    }
    if (changed) await this.saveSettings();
  }

  isSignedIn(p: ProviderConfig): boolean {
    return !!p.token;
  }

  setToken(p: ProviderConfig, token: StoredToken): { ok: boolean } {
    p.token = token;
    void this.saveSettings();
    return { ok: true };
  }

  signOut(p: ProviderConfig): void {
    p.token = undefined;
    void this.saveSettings();
  }
}