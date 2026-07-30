import { App, Modal, Notice, PluginSettingTab, Setting } from "obsidian";
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

  constructor(app: App, private plugin: AIChatPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    this.recomputeModelOptions();

    containerEl.createEl("h3", { text: "Models" });
    new Setting(containerEl)
      .setName("Sync models")
      .setDesc("Fetch model metadata for all configured providers from models.dev.")
      .addButton((b) =>
        b
          .setButtonText("Sync all models")
          .setCta()
          .onClick(async () => {
            const btn = b;
            btn.setButtonText("Syncing…").setDisabled(true);
            try {
              await this.plugin.syncAll();
              new Notice("Models synced");
            } catch (e) {
              new Notice(`Sync failed: ${e instanceof Error ? e.message : String(e)}`);
            } finally {
              btn.setButtonText("Sync all models").setDisabled(false);
              this.display();
            }
          }),
      );

    containerEl.createEl("h3", { text: "Providers" });
    if (this.plugin.settings.providers.length === 0) {
      containerEl.createEl("p", {
        text: "No providers configured. Add one below, then Sync models.",
        cls: "setting-item-description",
      });
    }

    this.plugin.settings.providers.forEach((p, i) => this.renderProvider(p, i));

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

    containerEl.createEl("h3", { text: "Defaults" });
    new Setting(containerEl)
      .setName("Default model")
      .setDesc("Used for new conversations.")
      .addDropdown((d) => {
        if (this.modelsForPick.length === 0) d.addOption("", "No models — sync a provider");
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

  private renderProvider(p: ProviderConfig, index: number) {
    const { containerEl } = this;
    const cat = CATALOG_BY_ID[p.providerId];
    const sdk = cat?.sdk ?? "openai-compatible";
    const title = p.name || cat?.name || p.providerId;

    new Setting(containerEl).setName(`Provider ${index + 1}: ${title}`).setHeading();

    new Setting(containerEl).setName("Display name").addText((t) =>
      t.setValue(p.name ?? "").setPlaceholder(cat?.name ?? "").onChange(async (v) => {
        p.name = v;
        await this.plugin.saveSettings();
      }),
    );

    if (cat?.authType === "oauth") {
      this.renderAuth(p, cat);
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
      this.renderModelList(p, cat?.modelsDevId);
    }

    new Setting(containerEl).addButton((b) =>
      b
        .setButtonText("Delete provider")
        .setWarning()
        .onClick(async () => {
          const removed = this.plugin.settings.providers.splice(index, 1)[0];
          if (this.plugin.settings.defaultModel.startsWith(removed.id + ":")) {
            this.plugin.settings.defaultModel = "";
          }
          await this.plugin.saveSettings();
          this.display();
        }),
    );
  }

  private renderModelList(p: ProviderConfig, modelsDevId?: string) {
    const { containerEl } = this;
    const models = this.plugin.getModels(p);
    const entry = modelsDevId ? this.plugin.modelCache[modelsDevId] : undefined;

    const setting = new Setting(containerEl)
      .setName("Models")
      .setDesc(
        models.length > 0
          ? `${models.length} models${entry ? ` · synced ${entry.syncedAt.slice(0, 10)}` : ""}`
          : "No models yet — press Refresh.",
      );
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
    const list = setting.infoEl.createEl("div", { cls: "ai-chat-model-list" });
    for (const m of models.slice(0, 50)) {
      const row = list.createEl("div", { cls: "ai-chat-model-row" });
      row.createEl("span", { text: m.name, cls: "ai-chat-model-row-name" });
      const badges = row.createEl("span", { cls: "ai-chat-model-badges" });
      if (m.limit.context) badges.createEl("span", { text: `${fmtContext(m.limit.context)}`, cls: "ai-chat-badge" });
      if (m.reasoning) badges.createEl("span", { text: "reason", cls: "ai-chat-badge" });
      if (m.toolCall) badges.createEl("span", { text: "tools", cls: "ai-chat-badge" });
      if (m.attachment) badges.createEl("span", { text: "files", cls: "ai-chat-badge" });
    }
    if (models.length > 50) {
      list.createEl("div", { text: `+${models.length - 50} more`, cls: "setting-item-description" });
    }
  }

  private renderAuth(p: ProviderConfig, cat: CatalogProvider) {
    const { containerEl } = this;
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