import { useState } from "react";
import { Icon, Markdown, copyText } from "./common";
import type { ChatMessage } from "../types";

export type MessageState = "complete" | "streaming" | "waiting";

export function Message({
  msg,
  state,
  onRetry,
}: {
  msg: ChatMessage;
  state: MessageState;
  onRetry: () => void;
}) {
  const [copied, setCopied] = useState(false);

  if (msg.role === "user") {
    return (
      <div className="ai-chat-turn ai-chat-turn-user">
        <div className="ai-chat-bubble-user">{msg.content}</div>
      </div>
    );
  }

  if (state === "waiting") {
    return (
      <div className="ai-chat-turn ai-chat-turn-assistant">
        <div className="ai-chat-dots">
          <span />
          <span />
          <span />
        </div>
      </div>
    );
  }

  if (msg.error) {
    return (
      <div className="ai-chat-turn ai-chat-turn-error">
        <div className="ai-chat-error">
          <Icon name="alert-triangle" />
          <span>{msg.content}</span>
        </div>
        <button className="ai-chat-retry" onClick={onRetry}>
          <Icon name="refresh-cw" />
          <span>Retry</span>
        </button>
      </div>
    );
  }

  if (state === "streaming") {
    return (
      <div className="ai-chat-turn ai-chat-turn-assistant">
        <div className="ai-chat-md ai-chat-streaming">
          {msg.content}
          <span className="ai-chat-caret" />
        </div>
      </div>
    );
  }

  const copy = async () => {
    if (await copyText(msg.content)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    }
  };

  return (
    <div className="ai-chat-turn ai-chat-turn-assistant ai-chat-turn-copyable">
      <Markdown content={msg.content} />
      <button className="ai-chat-copy" onClick={copy} title="Copy">
        <Icon name={copied ? "check" : "copy"} />
      </button>
    </div>
  );
}
