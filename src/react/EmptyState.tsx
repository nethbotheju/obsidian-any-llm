import { Icon } from "./common";

export function EmptyState() {
  return (
    <div className="ai-chat-empty">
      <div className="ai-chat-empty-mark">
        <Icon name="sparkles" />
      </div>
      <div className="ai-chat-empty-title">How can I help?</div>
      <div className="ai-chat-empty-sub">Ask anything. Pick a model in the input below.</div>
    </div>
  );
}
