import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Notice } from "obsidian";
import type { LanguageModel } from "ai";
import { copyText, Icon, useServices } from "./common";
import { Header } from "./Header";
import { HistoryPanel } from "./HistoryPanel";
import { MessageList, type RenderItem } from "./MessageList";
import { Composer } from "./Composer";
import { EmptyState } from "./EmptyState";
import { MessageState } from "./Message";
import { ErrorBoundary } from "./ErrorBoundary";
import { describeChatError, streamChat } from "../llm";
import { deleteConversation, listConversations, saveConversation } from "../store";
import type { ChatMessage, Conversation } from "../types";
import { serializeFiles } from "../attachments";
import { collectRefContents } from "../refs";
import { newId, nowISO, titleFrom } from "../util";

function newConversation(model: string, systemPrompt: string): Conversation {
  const ts = nowISO();
  return {
    id: newId(),
    title: "New chat",
    createdAt: ts,
    updatedAt: ts,
    model: model || "",
    systemPrompt,
    messages: [],
  };
}

export function ChatApp() {
  const { app, plugin } = useServices();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [active, setActive] = useState<Conversation | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    (async () => {
      const list = await listConversations(app, plugin.manifest.id);
      setConversations(list);
      setActive(list[0] ?? newConversation(plugin.settings.defaultModel, plugin.settings.defaultSystemPrompt));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persist = useCallback(
    async (conv: Conversation) => {
      await saveConversation(app, plugin.manifest.id, conv);
      setConversations((prev) => {
        const exists = prev.some((c) => c.id === conv.id);
        const next = exists ? prev.map((c) => (c.id === conv.id ? conv : c)) : [conv, ...prev];
        return [...next].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      });
    },
    [app, plugin],
  );

  const streamAssistant = useCallback(
    async (conv: Conversation) => {
      const controller = new AbortController();
      abortRef.current = controller;
      setStreaming(true);
      setStreamText("");
      setError(null);

      try {
        await plugin.ensureFreshTokens();
        let model: LanguageModel;
        try {
          model = plugin.registry.languageModel(conv.model);
        } catch {
          throw new Error("The selected model is no longer available. Pick another model in Settings.");
        }

        const userMsgs = conv.messages.filter((m) => m.role === "user");
        const lastText = userMsgs.length ? userMsgs[userMsgs.length - 1].content : "";
        const olderText = userMsgs.slice(0, -1).map((m) => m.content).join("\n");
        const latest = await collectRefContents(app, lastText);
        if (latest.errors.length) throw new Error(latest.errors.join(" "));
        const older = await collectRefContents(app, olderText);
        if (older.errors.length) new Notice(older.errors.join(" "));
        const fileContents = new Map(latest.contents);
        for (const [k, v] of older.contents) fileContents.set(k, v);

        let lastFlush = 0;
        const full = await streamChat({
          model,
          system: conv.systemPrompt,
          messages: conv.messages,
          fileContents,
          signal: controller.signal,
          onDelta: (t) => {
            // ponytail: throttle Obsidian markdown re-render to ~10fps. The
            // final text is always shown via the complete message when done.
            const now = Date.now();
            if (now - lastFlush < 100) return;
            lastFlush = now;
            setStreamText(t);
          },
        });
        const next: Conversation = {
          ...conv,
          messages: [...conv.messages, { role: "assistant", content: full, model: conv.model }],
          updatedAt: nowISO(),
        };
        setActive(next);
        try {
          await persist(next);
        } catch (err) {
          console.error("ai-chat: could not save response", err);
          new Notice(`Could not save conversation: ${err instanceof Error ? err.message : String(err)}`);
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(describeChatError(err));
        console.error("ai-chat: generation failed", { model: conv.model, error: err });
      } finally {
        setStreaming(false);
        setStreamText("");
        abortRef.current = null;
      }
    },
    [app, persist, plugin],
  );

  const send = useCallback(
    async (text: string, files: File[]): Promise<boolean> => {
      if (!active || (!text.trim() && files.length === 0) || streaming) return false;
      let attachments;
      try {
        attachments = await serializeFiles(files, plugin.getModelInfo(active.model));
      } catch (err) {
        new Notice(err instanceof Error ? err.message : String(err));
        return false;
      }
      const userMsg: ChatMessage = {
        role: "user",
        content: text,
        ...(attachments.length > 0 ? { attachments } : {}),
      };
      const conv: Conversation = {
        ...active,
        title: active.messages.length === 0 ? titleFrom(text || attachments[0]?.filename || "New chat") : active.title,
        messages: [...active.messages, userMsg],
        updatedAt: nowISO(),
      };
      setActive(conv);
      try {
        await persist(conv);
      } catch (err) {
        new Notice(`Could not save conversation: ${err instanceof Error ? err.message : String(err)}`);
        return false;
      }
      void streamAssistant(conv);
      return true;
    },
    [active, persist, plugin, streaming, streamAssistant],
  );

  const regenerate = useCallback(() => {
    if (streaming || !active) return;
    let msgs = [...active.messages];
    while (msgs.length && msgs[msgs.length - 1].role === "assistant") msgs.pop();
    if (msgs.length === 0) return;
    const conv: Conversation = { ...active, messages: msgs, updatedAt: nowISO() };
    setActive(conv);
    void streamAssistant(conv);
  }, [streaming, active, streamAssistant]);

  const stop = useCallback(() => abortRef.current?.abort(), []);

  const copyError = useCallback(async () => {
    if (error && (await copyText(error))) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    }
  }, [error]);

  const startNew = useCallback(() => {
    if (streaming) return;
    setError(null);
    setActive(newConversation(active?.model || plugin.settings.defaultModel, active?.systemPrompt || plugin.settings.defaultSystemPrompt));
  }, [streaming, active, plugin.settings.defaultModel, plugin.settings.defaultSystemPrompt]);

  const switchConversation = useCallback(
    (id: string) => {
      if (streaming) return;
      setHistoryOpen(false);
      setError(null);
      const conv = conversations.find((c) => c.id === id);
      if (conv) setActive(conv);
    },
    [streaming, conversations],
  );

  const removeConversation = useCallback(
    async (id: string) => {
      await deleteConversation(app, plugin.manifest.id, id);
      const remaining = conversations.filter((c) => c.id !== id);
      setConversations(remaining);
      if (active?.id === id) {
        setError(null);
        setActive(remaining[0] ?? newConversation(plugin.settings.defaultModel, plugin.settings.defaultSystemPrompt));
      }
    },
    [app, plugin.manifest.id, conversations, active, plugin.settings.defaultModel, plugin.settings.defaultSystemPrompt],
  );

  const patchActive = useCallback(
    (patch: Partial<Conversation>) => {
      setActive((prev) => {
        if (!prev) return prev;
        const next = { ...prev, ...patch, updatedAt: nowISO() };
        void persist(next);
        return next;
      });
    },
    [persist],
  );

  const items = useMemo<RenderItem[]>(() => {
    if (!active) return [];
    const base: RenderItem[] = active.messages.map((m, i) => ({
      key: i,
      msg: m,
      state: "complete" as MessageState,
    }));
    if (streaming) {
      base.push({
        key: "live",
        msg: { role: "assistant", content: streamText, model: active.model },
        state: (streamText ? "streaming" : "waiting") as MessageState,
      });
    }
    return base;
  }, [active, streaming, streamText]);

  return (
    <div className="ai-chat-root">
      {historyOpen && (
        <HistoryPanel
          conversations={conversations}
          activeId={active?.id ?? ""}
          onPick={switchConversation}
          onDelete={removeConversation}
          onNew={() => {
            startNew();
            setHistoryOpen(false);
          }}
          onClose={() => setHistoryOpen(false)}
        />
      )}

      <Header
        title={active?.title ?? "New chat"}
        historyOpen={historyOpen}
        onToggleHistory={() => setHistoryOpen((v) => !v)}
        onNew={startNew}
        onRename={(t) => patchActive({ title: t })}
        streaming={streaming}
      />

      {items.length === 0 ? (
        <EmptyState />
      ) : (
        <ErrorBoundary
          key={active?.id}
          fallback={(reset) => (
            <div className="ai-chat-error-banner" role="alert" style={{ margin: "0 14px 8px" }}>
              <Icon name="alert-triangle" className="ai-chat-error-banner-icon" />
              <span className="ai-chat-error-banner-msg">This conversation couldn&apos;t be rendered.</span>
              <button
                type="button"
                className="ai-chat-error-banner-btn"
                onClick={() => {
                  reset();
                  regenerate();
                }}
                title="Retry"
              >
                <Icon name="refresh-cw" />
              </button>
            </div>
          )}
        >
          <MessageList items={items} convId={active?.id ?? ""} streaming={streaming} />
        </ErrorBoundary>
      )}

      {error && (
        <div className="ai-chat-error-banner" role="alert">
          <Icon name="alert-triangle" className="ai-chat-error-banner-icon" />
          <span className="ai-chat-error-banner-msg">{error}</span>
          <button type="button" className="ai-chat-error-banner-btn" onClick={() => void copyError()} title="Copy error">
            <Icon name={copied ? "check" : "copy"} />
          </button>
          <button type="button" className="ai-chat-error-banner-btn" onClick={() => void regenerate()} title="Retry">
            <Icon name="refresh-cw" />
          </button>
          <button type="button" className="ai-chat-error-banner-btn" onClick={() => setError(null)} title="Dismiss">
            <Icon name="x" />
          </button>
        </div>
      )}

      <Composer
        providers={plugin.settings.providers}
        modelsFor={(p) => plugin.getModels(p)}
        model={active?.model ?? ""}
        modelInfo={active ? plugin.getModelInfo(active.model) : undefined}
        onModelChange={(ref) => patchActive({ model: ref })}
        disabled={!active?.model}
        streaming={streaming}
        onSend={send}
        onStop={stop}
      />
    </div>
  );
}
