import { useEffect, useRef, useState } from "react";
import { Icon } from "./common";

export function Header({
  title,
  historyOpen,
  onToggleHistory,
  onNew,
  onRename,
  streaming,
}: {
  title: string;
  historyOpen: boolean;
  onToggleHistory: () => void;
  onNew: () => void;
  onRename: (title: string) => void;
  streaming: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setDraft(title), [title]);
  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const commit = () => {
    setEditing(false);
    const t = draft.trim();
    if (t && t !== title) onRename(t);
  };

  return (
    <div className="ai-chat-header">
      <button
        className={`ai-chat-icon-btn ${historyOpen ? "is-active" : ""}`}
        onClick={onToggleHistory}
        title="History"
      >
        <Icon name="panel-left" />
      </button>

      {editing ? (
        <input
          ref={inputRef}
          className="ai-chat-title-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") {
              setEditing(false);
              setDraft(title);
            }
          }}
        />
      ) : (
        <button className="ai-chat-title" onClick={() => setEditing(true)} title="Rename conversation">
          {title}
        </button>
      )}

      <button className="ai-chat-icon-btn" onClick={onNew} title="New chat" disabled={streaming}>
        <Icon name="plus" />
      </button>
    </div>
  );
}
