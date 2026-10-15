import { App, ButtonComponent, Modal, Notice, PluginSettingTab, Setting, setIcon } from "obsidian";
import type AIChatPlugin from "./main";
import { CATALOG, CATALOG_BY_ID, providerUsable, type CatalogProvider } from "./catalog";
import { OAUTH_SPECS, loginWithOAuth, type AuthRequest } from "./auth/oauth";
import type { ProviderConfig } from "./types";

function fmtContext(n: number): string {
  if (!n) return "";
  const k = n / 1000;
  return n >= 1000 ? `${k % 1 === 0 ? k : k.toFixed(0)}K` : String(n);
}

export class ChatSettingTab extends PluginSettingTab {
  private modelsForPick: { ref: string; label: string }[] = [];
  private activeTab: "providers" | "defaults" = "providers";
  private expandedProviders = new Set<string>();
  private expandedModelLists = new Set<string>();

  constructor(app: App, private plugin: AIChatPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    const tabs = [
      { id: "providers", label: "Providers" },
      { id: "defaults", label: "Defaults" },
    ] as const;
    const tabList = containerEl.createDiv({
      cls: "ai-chat-settings-tabs",
      attr: { role: "tablist", "aria-label": "AnyLLM settings" },
    });
    const panel = containerEl.createDiv({
      cls: "ai-chat-settings-panel",
      attr: { id: "ai-chat-settings-panel", role: "tabpanel" },
    });
    panel.tabIndex = 0;

    const renderPanel = () => {
      for (const button of buttons) {
        const selected = button.id === `ai-chat-settings-tab-${this.activeTab}`;
        button.setAttribute("aria-selected", String(selected));
        button.tabIndex = selected ? 0 : -1;
      }
      panel.setAttribute("aria-labelledby", `ai-chat-settings-tab-${this.activeTab}`);
      panel.empty();
      if (this.activeTab === "providers") this.renderProviders(panel);
      else this.renderDefaults(panel);
    };

    const buttons = tabs.map((tab, index) => {
      const button = tabList.createEl("button", {
        text: tab.label,
        cls: "ai-chat-settings-tab",
        attr: {
          id: `ai-chat-settings-tab-${tab.id}`,
          type: "button",
          role: "tab",
          "aria-controls": panel.id,
        },
      });
      button.addEventListener("click", () => {
        if (this.activeTab === tab.id) return;
        this.activeTab = tab.id;
        renderPanel();
      });
      button.addEventListener("keydown", (event) => {
        let next: number;
        if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
        else if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
        else if (event.key === "Home") next = 0;
        else if (event.key === "End") next = tabs.length - 1;
        else return;
        event.preventDefault();
        buttons[next].click();
        buttons[next].focus();
      });
      return button;
    });
    renderPanel();
  }

  private renderProviders(containerEl: HTMLElement): void {
    containerEl.createEl("h3", { text: "Models" });
    new Setting(containerEl)
      .setName("Sync models")
      .setDesc("Fetch model metadata for all configured providers from models.dev.")
      .addButton((b) =>
        b.setButtonText("Sync all models").onClick(async () => {
          b.setButtonText("Syncing…").setDisabled(true);
          try {
            await this.plugin.syncAll();
            new Notice("Models synced");
          } catch (e) {
            new Notice(`Sync failed: ${e instanceof Error ? e.message : String(e)}`);
          } finally {
            b.setButtonText("Sync all models").setDisabled(false);
            this.display();
          }
        }),
      );

    containerEl.createEl("h3", { text: "Providers" });
    new Setting(containerEl).setName("Add provider").addDropdown((d) => {
      d.addOption("", "— select —");
      for (const c of CATALOG) {
        d.addOption(c.providerId, c.custom ? `${c.name} (manual)` : c.name);
      }
      d.onChange(async (v) => {
        if (!v) return;
        const cat = CATALOG_BY_ID[v];
        const cfg: ProviderConfig = {
          id: "provider-" + Math.random().toString(36).slice(2, 8),
          providerId: v,
          apiKey: "",
          baseURL: cat?.baseURL ?? "",
        };
        this.plugin.settings.providers.push(cfg);
        this.expandedProviders.add(cfg.id);
        await this.plugin.saveSettings();
        d.setValue("");
        this.display();
        if (cat?.modelsDevId && !cat.custom) {
          try {
            await this.plugin.syncOne(cat.modelsDevId);
            this.display();
          } catch (e) {
            new Notice(`Sync failed: ${e instanceof Error ? e.message : String(e)}`);
          }
        }
      });
    });

    if (this.plugin.settings.providers.length === 0) {
      containerEl.createEl("p", {
        text: "No providers configured. Choose a provider above to get started.",
        cls: "setting-item-description",
      });
    }
    for (const provider of this.plugin.settings.providers) this.renderProvider(containerEl, provider);
  }

  private renderDefaults(containerEl: HTMLElement): void {
    this.recomputeModelOptions();
    containerEl.createEl("h3", { text: "Defaults" });
    new Setting(containerEl)
      .setName("Default model")
      .setDesc("Used for new conversations.")
      .addDropdown((d) => {
        d.addOption("", this.modelsForPick.length === 0 ? "No models — configure a provider" : "Select a default model");
        for (const m of this.modelsForPick) d.addOption(m.ref, m.label);
        d.setValue(this.plugin.settings.defaultModel);
        d.onChange(async (v) => {
          this.plugin.settings.defaultModel = v;
          await this.plugin.saveSettings();
        });
      });
    new Setting(containerEl).setName("Default system prompt").addTextArea((t) =>
      t
        .setValue(this.plugin.settings.defaultSystemPrompt)
        .onChange(async (v) => {
          this.plugin.settings.defaultSystemPrompt = v;
          await this.plugin.saveSettings();
        }),
    );
  }

  private recomputeModelOptions(): void {
    const out: { ref: string; label: string }[] = [];
    for (const p of this.plugin.settings.providers) {
      if (!providerUsable(p)) continue;
      const models = this.plugin.getModels(p);
      const catName = p.name || CATALOG_BY_ID[p.providerId]?.name || p.providerId;
      for (const m of models) {
        out.push({ ref: `${p.id}:${m.id}`, label: `${catName} · ${m.name}` });
      }
    }
    this.modelsForPick = out;
  }

  private renderProvider(parentEl: HTMLElement, p: ProviderConfig) {
    const cat = CATALOG_BY_ID[p.providerId];
    const sdk = cat?.sdk ?? "openai-compatible";
    const title = p.name || cat?.name || p.providerId;

    const section = parentEl.createDiv({ cls: "ai-chat-provider" });
    const header = section.createDiv({ cls: "ai-chat-provider-header" });
    const toggle = header.createEl("button", {
      cls: "ai-chat-provider-toggle",
      attr: { type: "button", "aria-controls": `ai-chat-provider-${p.id}` },
    });
    const chevron = toggle.createSpan({ cls: "ai-chat-provider-chevron" });
    setIcon(chevron, "chevron-right");
    const titleEl = toggle.createSpan({ cls: "ai-chat-provider-title", text: title });
    const deleteButton = new ButtonComponent(header)
      .setIcon("trash-2")
      .setTooltip(`Delete ${title}`)
      .setClass("ai-chat-provider-delete")
      .onClick(() => this.confirmDeleteProvider(p));
    deleteButton.buttonEl.setAttribute("aria-label", `Delete ${title}`);

    const containerEl = section.createDiv({
      cls: "ai-chat-provider-body",
      attr: { id: `ai-chat-provider-${p.id}` },
    });
    const updateExpanded = () => {
      const expanded = this.expandedProviders.has(p.id);
      toggle.setAttribute("aria-expanded", String(expanded));
      containerEl.hidden = !expanded;
    };
    toggle.addEventListener("click", () => {
      if (this.expandedProviders.has(p.id)) this.expandedProviders.delete(p.id);
      else this.expandedProviders.add(p.id);
      updateExpanded();
    });
    updateExpanded();

    new Setting(containerEl).setName("Display name").addText((t) =>
      t.setValue(p.name ?? "").setPlaceholder(cat?.name ?? "").onChange(async (v) => {
        p.name = v;
        const name = v || cat?.name || p.providerId;
        titleEl.setText(name);
        deleteButton.setTooltip(`Delete ${name}`);
        deleteButton.buttonEl.setAttribute("aria-label", `Delete ${name}`);
        await this.plugin.saveSettings();
      }),
    );

    if (cat?.authType === "oauth") {
      this.renderAuth(containerEl, p, cat);
    } else if (cat?.docUrl) {
      new Setting(containerEl)
        .setName("API key")
        .setDesc(`Get a key at ${cat.docUrl}`)
        .addText((t) => {
          t.inputEl.type = "password";
          t.setValue(p.apiKey ?? "").onChange(async (v) => {
            p.apiKey = v;
            await this.plugin.saveSettings();
          });
        });
    } else {
      new Setting(containerEl).setName("API key").addText((t) => {
        t.inputEl.type = "password";
        t.setValue(p.apiKey ?? "").onChange(async (v) => {
          p.apiKey = v;
          await this.plugin.saveSettings();
        });
      });
    }

    if (sdk === "openai-compatible" || p.customModels || cat?.custom) {
      new Setting(containerEl)
        .setName("Base URL")
        .setDesc("OpenAI-compatible endpoint root (e.g. http://localhost:11434/v1).")
        .addText((t) =>
          t.setValue(p.baseURL ?? "").onChange(async (v) => {
            p.baseURL = v;
            await this.plugin.saveSettings();
          }),
        );
    }

    if (cat?.custom || p.customModels) {
      new Setting(containerEl)
        .setName("Models")
        .setDesc("One model id per line. Uses your Base URL.")
        .addTextArea((t) =>
          t.setValue((p.customModels ?? []).join("\n")).onChange(async (v) => {
            p.customModels = v.split("\n").map((s) => s.trim()).filter(Boolean);
            await this.plugin.saveSettings();
          }),
        );
    } else {
      this.renderModelList(containerEl, p, cat?.modelsDevId);
    }
  }

  private confirmDeleteProvider(p: ProviderConfig): void {
    const modal = new Modal(this.app);
    modal.titleEl.setText("Delete provider?");
    modal.contentEl.createEl("p", {
      text: `Remove ${p.name || CATALOG_BY_ID[p.providerId]?.name || p.providerId} and its configuration? Existing conversations will not be deleted.`,
    });
    new Setting(modal.contentEl)
      .addButton((b) => b.setButtonText("Cancel").onClick(() => modal.close()))
      .addButton((b) => b.setButtonText("Delete provider").setWarning().onClick(async () => {
        const index = this.plugin.settings.providers.findIndex((provider) => provider.id === p.id);
        if (index < 0) return;
        this.plugin.settings.providers.splice(index, 1);
        this.expandedProviders.delete(p.id);
        this.expandedModelLists.delete(p.id);
        if (this.plugin.settings.defaultModel.startsWith(p.id + ":")) {
          this.plugin.settings.defaultModel = "";
        }
        await this.plugin.saveSettings();
        modal.close();
        this.display();
      }));
    modal.open();
  }

  private renderModelList(containerEl: HTMLElement, p: ProviderConfig, modelsDevId?: string) {
    const models = this.plugin.getModels(p);
    const entry = modelsDevId ? this.plugin.modelCache[modelsDevId] : undefined;

    const setting = new Setting(containerEl)
      .setName("Models")
      .setDesc(
        models.length > 0
          ? `${models.length} models${entry ? ` · synced ${entry.syncedAt.slice(0, 10)}` : ""}`
          : "No models yet — press Refresh.",
      );
    setting.settingEl.classList.add("ai-chat-model-setting");
    if (modelsDevId) {
      setting.addButton((b) =>
        b.setButtonText("Refresh").onClick(async () => {
          const btn = b;
          btn.setButtonText("…").setDisabled(true);
          try {
            await this.plugin.syncOne(modelsDevId);
          } catch (e) {
            new Notice(`Sync failed: ${e instanceof Error ? e.message : String(e)}`);
          } finally {
            btn.setButtonText("Refresh").setDisabled(false);
            this.display();
          }
        }),
      );
    }

    if (models.length === 0) return;
    const list = setting.settingEl.createDiv({
      cls: "ai-chat-model-list",
      attr: { id: `ai-chat-provider-models-${p.id}` },
    });
    setting.addButton((b) => {
      b.buttonEl.setAttribute("aria-controls", list.id);
      const updateExpanded = () => {
        const expanded = this.expandedModelLists.has(p.id);
        list.hidden = !expanded;
        b.setButtonText(expanded ? "Hide models" : "Show models");
        b.buttonEl.setAttribute("aria-expanded", String(expanded));
      };
      b.onClick(() => {
        if (this.expandedModelLists.has(p.id)) this.expandedModelLists.delete(p.id);
        else this.expandedModelLists.add(p.id);
        updateExpanded();
      });
      updateExpanded();
    });
    for (const m of models.slice(0, 50)) {
      const row = list.createEl("div", { cls: "ai-chat-model-row" });
      row.createEl("span", { text: m.name, cls: "ai-chat-model-row-name" });
      const badges = row.createEl("span", { cls: "ai-chat-model-badges" });
      if (m.limit.context) badges.createEl("span", { text: `${fmtContext(m.limit.context)}`, cls: "ai-chat-badge" });
      if (m.reasoning) badges.createEl("span", { text: "reason", cls: "ai-chat-badge" });
      if (m.toolCall) badges.createEl("span", { text: "tools", cls: "ai-chat-badge" });
      if (m.attachment) badges.createEl("span", { text: "files", cls: "ai-chat-badge" });
      for (const modality of m.modalities.input.filter((value) => value !== "text")) {
        badges.createEl("span", { text: modality, cls: "ai-chat-badge" });
      }
    }
    if (models.length > 50) {
      list.createEl("div", { text: `+${models.length - 50} more`, cls: "setting-item-description" });
    }
  }

  private renderAuth(containerEl: HTMLElement, p: ProviderConfig, cat: CatalogProvider) {
    const spec = cat.oauthKind ? OAUTH_SPECS[cat.oauthKind] : undefined;
    if (!spec) return;
    const signedIn = this.plugin.isSignedIn(p);
    const left = signedIn ? this.tokenDesc(p) : "Not signed in.";

    const setting = new Setting(containerEl)
      .setName("Sign in")
      .setDesc(left);
    setting.addButton((b) => {
      b.setButtonText(signedIn ? "Sign in again" : `Sign in with ${spec.name}`);
      if (!signedIn) b.setCta();
      b.onClick(async () => {
        const btn = b;
        btn.setButtonText("Opening browser…").setDisabled(true);
        try {
          const token = await loginWithOAuth(spec, (auth) => this.promptForRedirect(spec.name, auth));
          this.plugin.setToken(p, token);
          new Notice(`Signed in to ${spec.name}`);
          if (cat.modelsDevId) {
            try {
              await this.plugin.syncOne(cat.modelsDevId);
            } catch {
              /* models sync can be retried manually */
            }
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          if (!/cancelled/i.test(msg)) new Notice(`Sign-in failed: ${msg}`);
        } finally {
          this.display();
        }
      });
    });
    if (signedIn) {
      setting.addButton((b) => {
        b.setButtonText("Sign out").setWarning();
        b.onClick(async () => {
          this.plugin.signOut(p);
          this.display();
        });
      });
    }
  }

  private tokenDesc(p: ProviderConfig): string {
    if (!p.token) return "Not signed in.";
    const remaining = p.token.expires - Date.now();
    const ttl = remaining > 0 ? `${Math.round(remaining / 60000)} min left` : "expired";
    return `Signed in · token ${ttl}.`;
  }

  private promptForRedirect(name: string, auth: AuthRequest): Promise<string | null> {
    return new Promise((resolve) => {
      const modal = new Modal(this.app);
      modal.titleEl.setText(`Sign in to ${name}`);
      modal.contentEl.empty();
      modal.contentEl.createEl("p", {
        text: "1. Open the login page in your browser. 2. Complete sign-in. 3. Your browser redirects to a localhost URL that will not load — that's expected. 4. Copy that full URL from the address bar and paste it below.",
      });
      const urlRow = modal.contentEl.createDiv({ cls: "ai-chat-oauth-url" });
      urlRow.createEl("span", { cls: "setting-item-description", text: "Login URL:" });
      const urlCtrl = urlRow.createEl("input", { type: "text" });
      urlCtrl.value = auth.url;
      urlCtrl.readOnly = true;
      urlCtrl.style.width = "100%";
      const btns = urlRow.createDiv();
      const openBtn = btns.createEl("button", { text: "Open" });
      const copyBtn = btns.createEl("button", { text: "Copy" });
      openBtn.onclick = () => window.open(auth.url, "_blank");
      copyBtn.onclick = async () => {
        await navigator.clipboard.writeText(auth.url);
        copyBtn.setText("Copied");
        setTimeout(() => copyBtn.setText("Copy"), 1200);
      };

      const area = modal.contentEl.createEl("textarea");
      area.placeholder = auth.url.startsWith("http://localhost:1455")
        ? "http://localhost:1455/auth/callback?code=…&state=…"
        : "http://localhost:53692/callback?code=…&state=…";
      area.style.width = "100%";
      area.style.height = "80px";
      const actions = modal.contentEl.createDiv({ cls: "ai-chat-oauth-actions" });
      const cancelBtn = actions.createEl("button", { text: "Cancel" });
      const okBtn = actions.createEl("button", { text: "Verify" });
      okBtn.classList.add("mod-cta");
      let settled = false;
      const done = (v: string | null) => {
        if (settled) return;
        settled = true;
        resolve(v);
        modal.close();
      };
      cancelBtn.onclick = () => done(null);
      const finish = () => done(area.value.trim() || null);
      okBtn.onclick = finish;
      area.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) finish();
      });
      modal.onClose = () => done(null);
      modal.open();
      setTimeout(() => area.focus(), 50);
    });
  }
}