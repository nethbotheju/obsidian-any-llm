import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Notice } from "obsidian";
import type { LanguageModel } from "ai";
import { useServices } from "./common";
import { Header } from "./Header";
import { HistoryPanel } from "./HistoryPanel";
import { MessageList, type RenderItem } from "./MessageList";
import { Composer } from "./Composer";
import { EmptyState } from "./EmptyState";
import { MessageState } from "./Message";
import { streamChat } from "../llm";
import { deleteConversation, listConversations, saveConversation } from "../store";
import type { ChatMessage, Conversation } from "../types";
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
      let model: LanguageModel;
      try {
        model = plugin.registry.languageModel(conv.model);
      } catch {
        new Notice("Invalid model. Pick one in Settings.");
        return;
      }
      setStreaming(true);
      setStreamText("");
      const controller = new AbortController();
      abortRef.current = controller;
      let accumulated = "";

      try {
        const full = await streamChat({
          model,
          system: conv.systemPrompt,
          messages: conv.messages,
          signal: controller.signal,
          onDelta: (t) => {
            accumulated = t;
            setStreamText(t);
          },
        });
        const next: Conversation = {
          ...conv,
          messages: [...conv.messages, { role: "assistant", content: full || accumulated, model: conv.model }],
          updatedAt: nowISO(),
        };
        setActive(next);
        await persist(next);
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        const next: Conversation = {
          ...conv,
          messages: [...conv.messages, { role: "assistant", content: reason, model: conv.model, error: true }],
          updatedAt: nowISO(),
        };
        setActive(next);
        await persist(next);
        if (!accumulated) new Notice(reason);
      } finally {
        setStreaming(false);
        setStreamText("");
        abortRef.current = null;
      }
    },
    [persist, plugin],
  );

  const send = useCallback(
    (text: string) => {
      if (!active || !text.trim() || streaming) return;
      const userMsg: ChatMessage = { role: "user", content: text };
      const conv: Conversation = {
        ...active,
        title: active.messages.length === 0 ? titleFrom(text) : active.title,
        messages: [...active.messages, userMsg],
        updatedAt: nowISO(),
      };
      setActive(conv);
      void streamAssistant(conv);
    },
    [active, streaming, streamAssistant],
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

  const startNew = useCallback(() => {
    if (streaming) return;
    setActive(newConversation(active?.model || plugin.settings.defaultModel, active?.systemPrompt || plugin.settings.defaultSystemPrompt));
  }, [streaming, active, plugin.settings.defaultModel, plugin.settings.defaultSystemPrompt]);

  const switchConversation = useCallback(
    (id: string) => {
      if (streaming) return;
      setHistoryOpen(false);
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
        <MessageList items={items} convId={active?.id ?? ""} streaming={streaming} onRetry={regenerate} />
      )}

      <Composer
        providers={plugin.settings.providers}
        modelsFor={(p) => plugin.getModels(p)}
        model={active?.model ?? ""}
        onModelChange={(ref) => patchActive({ model: ref })}
        disabled={!active?.model}
        streaming={streaming}
        onSend={send}
        onStop={stop}
      />
    </div>
  );
}
