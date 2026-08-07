import { useState } from "react";
import { Icon, Markdown, copyText, useServices } from "./common";
import { attachmentDataUrl, formatAttachmentSize } from "../attachments";
import { resolveRef, splitRefs } from "../refs";
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

function RefChip({ path }: { path: string }) {
  const { app } = useServices();
  const file = resolveRef(app, path);
  if (!file) return <>{`@${path}`}</>;
  return (
    <button
      type="button"
      className="ai-chat-ref"
      onClick={() => void app.workspace.getLeaf(false).openFile(file)}
      title={`Open ${path}`}
    >
      @{path}
    </button>
  );
}

function UserContent({ msg }: { msg: ChatMessage }) {
  const runs = splitRefs(msg.content);
  return (
    <div className="ai-chat-bubble-user">
      {msg.attachments?.map((attachment) => <AttachmentView key={attachment.id} attachment={attachment} />)}
      {runs.length > 0 && (
        <div className="ai-chat-user-text">
          {runs.map((r, i) =>
            r.kind === "text" ? (
              <span key={i}>{r.text}</span>
            ) : (
              <RefChip key={i} path={r.path} />
            ),
          )}
        </div>
      )}
    </div>
  );
}

export function Message({
  msg,
  state,
}: {
  msg: ChatMessage;
  state: MessageState;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (await copyText(msg.content)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    }
  };

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

  return (
    <div className="ai-chat-turn ai-chat-turn-assistant ai-chat-turn-copyable">
      <Markdown content={msg.content} />
      <button type="button" className="ai-chat-copy" onClick={() => void copy()} title="Copy">
        <Icon name={copied ? "check" : "copy"} />
      </button>
    </div>
  );
}
