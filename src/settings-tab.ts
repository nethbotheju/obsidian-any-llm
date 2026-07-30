import { App, PluginSettingTab, Setting } from "obsidian";
import type AIChatPlugin from "./main";
import type { ProviderConfig, ProviderType } from "./types";

const PROVIDER_TYPES: { value: ProviderType; label: string }[] = [
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic (Claude)" },
  { value: "google", label: "Google (Gemini)" },
  { value: "openai-compatible", label: "OpenAI-compatible (Ollama, OpenRouter, LM Studio, …)" },
];

export class ChatSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: AIChatPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h3", { text: "Providers" });
    if (this.plugin.settings.providers.length === 0) {
      containerEl.createEl("p", {
        text: "No providers configured. Add one below (e.g. an OpenAI-compatible endpoint for Ollama at http://localhost:11434/v1).",
        cls: "setting-item-description",
      });
    }

    this.plugin.settings.providers.forEach((p, i) => this.renderProvider(p, i));

    new Setting(containerEl).addButton((b) =>
      b
        .setButtonText("Add provider")
        .setCta()
        .onClick(async () => {
          this.plugin.settings.providers.push({
            id: "provider-" + Math.random().toString(36).slice(2, 8),
            type: "openai-compatible",
            name: "",
            baseURL: "",
            apiKey: "",
            models: [],
          });
          await this.plugin.saveSettings();
          this.display();
        }),
    );

    containerEl.createEl("h3", { text: "Defaults" });
    new Setting(containerEl)
      .setName("Default model")
      .setDesc("Format: ProviderId:ModelId (e.g. openai:gpt-4o-mini).")
      .addText((t) =>
        t
          .setValue(this.plugin.settings.defaultModel)
          .onChange(async (v) => {
            this.plugin.settings.defaultModel = v;
            await this.plugin.saveSettings();
          }),
      );
    new Setting(containerEl).setName("Default system prompt").addTextArea((t) =>
      t
        .setValue(this.plugin.settings.defaultSystemPrompt)
        .onChange(async (v) => {
          this.plugin.settings.defaultSystemPrompt = v;
          await this.plugin.saveSettings();
        }),
    );
  }

  private renderProvider(p: ProviderConfig, index: number) {
    const { containerEl } = this;
    new Setting(containerEl).setName(`Provider ${index + 1}: ${p.name || p.id}`).setHeading();

    new Setting(containerEl).setName("Name").addText((t) =>
      t.setValue(p.name ?? "").onChange(async (v) => {
        p.name = v;
        await this.plugin.saveSettings();
      }),
    );

    new Setting(containerEl).setName("Type").addDropdown((d) => {
      d.addOptions(Object.fromEntries(PROVIDER_TYPES.map((t) => [t.value, t.label])));
      d.setValue(p.type);
      d.onChange(async (v) => {
        p.type = v as ProviderType;
        await this.plugin.saveSettings();
      });
    });

    new Setting(containerEl)
      .setName("Base URL")
      .setDesc("Required for openai-compatible (e.g. http://localhost:11434/v1). Optional override for others.")
      .addText((t) =>
        t.setValue(p.baseURL ?? "").onChange(async (v) => {
          p.baseURL = v;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl).setName("API key").addText((t) => {
      t.inputEl.type = "password";
      t.setValue(p.apiKey ?? "").onChange(async (v) => {
        p.apiKey = v;
        await this.plugin.saveSettings();
      });
    });

    new Setting(containerEl)
      .setName("Models")
      .setDesc("One model id per line (e.g. gpt-4o-mini).")
      .addTextArea((t) =>
        t.setValue(p.models.join("\n")).onChange(async (v) => {
          p.models = v
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean);
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl).addButton((b) =>
      b
        .setButtonText("Delete provider")
        .setWarning()
        .onClick(async () => {
          this.plugin.settings.providers.splice(index, 1);
          await this.plugin.saveSettings();
          this.display();
        }),
    );
  }
}
