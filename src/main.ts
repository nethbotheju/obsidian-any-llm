import { addIcon, Notice, Plugin } from "obsidian";
import { ChatView, VIEW_TYPE_CHAT } from "./ChatView";
import { ChatSettingTab } from "./settings-tab";
import { DEFAULT_SETTINGS } from "./store";
import { buildRegistry } from "./llm";
import { CATALOG_BY_ID, providerUsable, type ModelInfo } from "./catalog";
import { readCache, readLogoCache, syncLogos, syncProviders, type LogoCache, type ModelCache } from "./sync";
import { OAUTH_SPECS, isTokenFresh, refreshAccessToken } from "./auth/oauth";
import { modelRef, parseModelRef, type PluginSettings, type ProviderConfig, type StoredToken } from "./types";

const LOGO_ICON_PREFIX = "models-dev-";

export default class AIChatPlugin extends Plugin {
  settings: PluginSettings = DEFAULT_SETTINGS;
  registry = buildRegistry(DEFAULT_SETTINGS);
  modelCache: ModelCache = {};
  logoCache: LogoCache = {};
  private revision = 0;
  private listeners = new Set<() => void>();
  private notifyTimer: ReturnType<typeof setTimeout> | null = null;

  async onload() {
    await this.loadSettings();
    this.modelCache = await readCache(this.app, this.manifest.id);
    this.logoCache = await readLogoCache(this.app, this.manifest.id);
    this.registerLogos();
    this.rebuildRegistry();

    this.registerView(VIEW_TYPE_CHAT, (leaf) => new ChatView(leaf, this));

    this.addRibbonIcon("message-square", "Open AnyLLM", () => this.activateView());
    this.addCommand({
      id: "open-chat",
      name: "Open AnyLLM",
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
    if (Object.keys(this.logoCache).length !== before) {
      this.registerLogos();
      this.notifyChanged();
    }
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

  // The chat view renders from mutable plugin state (settings, registry, model
  // cache). Views subscribe here and re-render whenever that state changes.
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getRevision = (): number => this.revision;

  // Coalesce bursts: saveSettings fires on every settings keystroke, and
  // re-rendering the whole chat per keystroke is wasteful.
  private notifyChanged(): void {
    if (this.notifyTimer !== null) clearTimeout(this.notifyTimer);
    this.notifyTimer = setTimeout(() => {
      this.notifyTimer = null;
      this.revision++;
      for (const listener of this.listeners) listener();
    }, 150);
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

  getModelInfo(ref: string): ModelInfo | undefined {
    const { providerId, modelId } = parseModelRef(ref);
    const provider = this.settings.providers.find((p) => p.id === providerId);
    return provider ? this.getModels(provider).find((m) => m.id === modelId) : undefined;
  }

  // True when ref still resolves to a model the picker would offer. Credentials
  // are only checked for OAuth providers: API key fields are edited keystroke
  // by keystroke and are transiently empty, which shouldn't reset the chat.
  isModelAvailable(ref: string): boolean {
    const { providerId, modelId } = parseModelRef(ref);
    if (!providerId || !modelId) return false;
    const provider = this.settings.providers.find((p) => p.id === providerId);
    if (!provider) return false;
    if (CATALOG_BY_ID[provider.providerId]?.authType === "oauth" && !provider.token) return false;
    return this.getModels(provider).some((m) => m.id === modelId);
  }

  // First model the picker would offer, or "" when nothing is available.
  firstAvailableModel(): string {
    for (const p of this.settings.providers) {
      if (!providerUsable(p)) continue;
      const model = this.getModels(p)[0];
      if (model) return modelRef(p.id, model.id);
    }
    return "";
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
    this.notifyChanged();
  }

  async syncOne(modelsDevId: string): Promise<void> {
    this.modelCache = await syncProviders(this.app, this.manifest.id, this.modelCache, [modelsDevId]);
    this.logoCache = await syncLogos(this.app, this.manifest.id, this.logoCache, [modelsDevId]);
    this.registerLogos();
    this.notifyChanged();
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
    this.rebuildRegistry();
    this.notifyChanged();
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