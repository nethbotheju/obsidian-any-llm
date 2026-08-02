import { useEffect, useRef } from "react";
import { Message, type MessageState } from "./Message";
import type { ChatMessage } from "../types";

export interface RenderItem {
  key: string | number;
  msg: ChatMessage;
  state: MessageState;
}

export function MessageList({
  items,
  convId,
  streaming,
}: {
  items: RenderItem[];
  convId: string;
  streaming: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  // instant jump on conversation switch
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    nearBottom.current = true;
  }, [convId]);

  // follow stream only if already near the bottom
  useEffect(() => {
    if (!nearBottom.current) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [items, streaming]);

  return (
    <div className="ai-chat-messages" ref={scrollRef} onScroll={onScroll}>
      {items.map((it) => (
        <Message key={it.key} msg={it.msg} state={it.state} />
      ))}
    </div>
  );
}
