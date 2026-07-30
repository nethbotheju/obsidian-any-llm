import { Plugin } from "obsidian";
import { ChatView, VIEW_TYPE_CHAT } from "./ChatView";
import { ChatSettingTab } from "./settings-tab";
import { DEFAULT_SETTINGS } from "./store";
import { buildRegistry } from "./llm";
import type { PluginSettings } from "./types";

export default class AIChatPlugin extends Plugin {
  settings: PluginSettings = DEFAULT_SETTINGS;
  registry = buildRegistry(DEFAULT_SETTINGS);

  async onload() {
    await this.loadSettings();
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

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
    this.rebuildRegistry();
  }
}
