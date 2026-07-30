import { ItemView, WorkspaceLeaf } from "obsidian";
import { createRoot, type Root } from "react-dom/client";
import type AIChatPlugin from "./main";
import { ChatApp } from "./react/ChatApp";
import { ServicesContext, type Services } from "./react/common";

export const VIEW_TYPE_CHAT = "obsidian-ai-chat-view";

export class ChatView extends ItemView {
  private root: Root | null = null;

  constructor(leaf: WorkspaceLeaf, private plugin: AIChatPlugin) {
    super(leaf);
  }

  getViewType() {
    return VIEW_TYPE_CHAT;
  }

  getDisplayText() {
    return "AI Chat";
  }

  getIcon() {
    return "message-square";
  }

  async onOpen() {
    const services: Services = { app: this.app, plugin: this.plugin };
    this.contentEl.empty();
    this.contentEl.addClass("obsidian-ai-chat-view-content");
    this.root = createRoot(this.contentEl);
    this.root.render(
      <ServicesContext.Provider value={services}>
        <ChatApp />
      </ServicesContext.Provider>,
    );
  }

  async onClose() {
    this.root?.unmount();
    this.root = null;
  }
}
