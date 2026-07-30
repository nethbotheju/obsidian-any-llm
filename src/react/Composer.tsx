import { useEffect, useRef, useState } from "react";
import { Icon } from "./common";
import { ModelPicker } from "./ModelPicker";
import type { ProviderConfig } from "../types";

export function Composer({
  providers,
  model,
  onModelChange,
  disabled,
  streaming,
  onSend,
  onStop,
}: {
  providers: ProviderConfig[];
  model: string;
  onModelChange: (ref: string) => void;
  disabled: boolean;
  streaming: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
}) {
  const [value, setValue] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const t = setTimeout(() => ref.current?.focus(), 60);
    return () => clearTimeout(t);
  }, []);

  const grow = () => {
    const el = ref.current;
    if (!el) return;
    if (!el.value.trim()) {
      el.style.height = "auto";
      return;
    }
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  };

  const submit = () => {
    const text = value.trim();
    if (!text || disabled) return;
    onSend(text);
    setValue("");
    requestAnimationFrame(() => {
      if (ref.current) ref.current.style.height = "auto";
    });
  };

  const canSend = !disabled && value.trim().length > 0;

  return (
    <div className="ai-chat-composer-wrap">
      <div className="ai-chat-composer">
        <textarea
          ref={ref}
          className="ai-chat-input"
          rows={1}
          placeholder={disabled ? "Configure a provider & model in Settings…" : "Ask anything…"}
          value={value}
          disabled={disabled}
          onChange={(e) => {
            setValue(e.target.value);
            grow();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <div className="ai-chat-composer-row">
          <ModelPicker providers={providers} value={model} onChange={onModelChange} />
          {streaming ? (
            <button className="ai-chat-send is-stop" onClick={onStop} title="Stop">
              <Icon name="square" />
            </button>
          ) : (
            <button className="ai-chat-send" onClick={submit} disabled={!canSend} title="Send">
              <Icon name="arrow-up" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
