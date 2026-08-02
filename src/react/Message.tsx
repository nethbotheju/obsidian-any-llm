import { useState } from "react";
import { Icon, Markdown, copyText } from "./common";
import { attachmentDataUrl, formatAttachmentSize } from "../attachments";
import type { ChatAttachment, ChatMessage } from "../types";

export type MessageState = "complete" | "streaming" | "waiting";

function AttachmentView({ attachment }: { attachment: ChatAttachment }) {
  const url = attachmentDataUrl(attachment);
  const download = () => {
    const link = document.createElement("a");
    link.href = url;
    link.download = attachment.filename;
    link.click();
  };

  return (
    <div className="ai-chat-message-attachment">
      {attachment.modality === "image" ? (
        <img src={url} alt={attachment.filename} className="ai-chat-message-image" />
      ) : attachment.modality === "audio" ? (
        <audio controls src={url} />
      ) : attachment.modality === "video" ? (
        <video controls src={url} className="ai-chat-message-video" />
      ) : null}
      <div className="ai-chat-message-file">
        <Icon name={attachment.modality === "pdf" ? "file-text" : "paperclip"} />
        <span title={attachment.filename}>{attachment.filename}</span>
        <small>{formatAttachmentSize(attachment.size)}</small>
        <button type="button" onClick={download} title="Download" aria-label={`Download ${attachment.filename}`}>
          <Icon name="download" />
        </button>
      </div>
    </div>
  );
}

function UserContent({ msg }: { msg: ChatMessage }) {
  return (
    <div className="ai-chat-bubble-user">
      {msg.attachments?.map((attachment) => <AttachmentView key={attachment.id} attachment={attachment} />)}
      {msg.content && <div className="ai-chat-user-text">{msg.content}</div>}
    </div>
  );
}

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
        <UserContent msg={msg} />
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
