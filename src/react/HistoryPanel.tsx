import { Icon } from "./common";
import { formatRelative } from "../util";
import type { Conversation } from "../types";

export function HistoryPanel({
  conversations,
  activeId,
  onPick,
  onDelete,
  onNew,
  onClose,
}: {
  conversations: Conversation[];
  activeId: string;
  onPick: (id: string) => void;
  onDelete: (id: string) => void;
  onNew: () => void;
  onClose: () => void;
}) {
  return (
    <div className="ai-chat-history-backdrop" onClick={onClose}>
      <div className="ai-chat-history" onClick={(e) => e.stopPropagation()}>
        <button className="ai-chat-history-new" onClick={onNew}>
          <Icon name="plus" />
          <span>New chat</span>
        </button>
        <div className="ai-chat-history-list">
          {conversations.length === 0 && (
            <div className="ai-chat-history-empty">No conversations yet</div>
          )}
          {conversations.map((c) => (
            <div
              key={c.id}
              className={`ai-chat-history-item ${c.id === activeId ? "is-active" : ""}`}
              onClick={() => onPick(c.id)}
            >
              <div className="ai-chat-history-text">
                <div className="ai-chat-history-title">{c.title}</div>
                <div className="ai-chat-history-time">{formatRelative(c.updatedAt)}</div>
              </div>
              <button
                className="ai-chat-history-del"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(c.id);
                }}
                title="Delete"
              >
                <Icon name="trash-2" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
