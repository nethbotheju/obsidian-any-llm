import { useEffect, useRef, useState } from "react";
import { Notice } from "obsidian";
import { Icon } from "./common";
import { ModelPicker } from "./ModelPicker";
import type { ProviderConfig } from "../types";
import type { ModelInfo } from "../catalog";
import {
  attachmentAccept,
  attachmentError,
  classifyFile,
  formatAttachmentSize,
  supportedAttachmentModalities,
  type PendingAttachment,
} from "../attachments";

export function Composer({
  providers,
  modelsFor,
  model,
  modelInfo,
  onModelChange,
  disabled,
  streaming,
  onSend,
  onStop,
}: {
  providers: ProviderConfig[];
  modelsFor: (p: ProviderConfig) => ModelInfo[];
  model: string;
  modelInfo?: ModelInfo;
  onModelChange: (ref: string) => void;
  disabled: boolean;
  streaming: boolean;
  onSend: (text: string, files: File[]) => Promise<boolean>;
  onStop: () => void;
}) {
  const [value, setValue] = useState("");
  const [pending, setPending] = useState<PendingAttachment[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const supported = supportedAttachmentModalities(modelInfo);
  const canAttach = !disabled && supported.length > 0;

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

  const addFiles = (files: File[]) => {
    if (!canAttach) return;
    const next = [...pending];
    for (const file of files) {
      const error = attachmentError(file, modelInfo);
      if (error) {
        new Notice(error);
        continue;
      }
      if (next.length >= 5) {
        new Notice("You can attach up to 5 files.");
        break;
      }
      if (next.some((item) => item.file.name === file.name && item.file.size === file.size)) continue;
      next.push({ file, modality: classifyFile(file)! });
    }
    setPending(next);
  };

  const submit = async () => {
    const text = value.trim();
    if ((!text && pending.length === 0) || disabled || submitting || streaming) return;
    setSubmitting(true);
    try {
      const ok = await onSend(text, pending.map((item) => item.file));
      if (ok) {
        setValue("");
        setPending([]);
        if (ref.current) ref.current.style.height = "auto";
      }
    } finally {
      setSubmitting(false);
    }
  };

  const canSend = !disabled && !submitting && (value.trim().length > 0 || pending.length > 0);

  return (
    <div
      className="ai-chat-composer-wrap"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) e.preventDefault();
      }}
      onDrop={(e) => {
        if (!e.dataTransfer.files.length) return;
        e.preventDefault();
        addFiles(Array.from(e.dataTransfer.files));
      }}
    >
      <div className="ai-chat-composer">
        {pending.length > 0 && (
          <div className="ai-chat-pending-attachments" aria-label="Attachments">
            {pending.map((item, index) => (
              <div className="ai-chat-pending-attachment" key={`${item.file.name}-${index}`}>
                <Icon name={item.modality === "image" ? "image" : "paperclip"} />
                <span title={item.file.name}>{item.file.name}</span>
                <small>{formatAttachmentSize(item.file.size)}</small>
                <button
                  type="button"
                  className="ai-chat-attachment-remove"
                  onClick={() => setPending((current) => current.filter((_, i) => i !== index))}
                  aria-label={`Remove ${item.file.name}`}
                  title="Remove"
                >
                  <Icon name="x" />
                </button>
              </div>
            ))}
          </div>
        )}
        <textarea
          ref={ref}
          className="ai-chat-input"
          rows={1}
          placeholder={disabled ? "Configure a provider & model in Settings…" : "Ask anything…"}
          value={value}
          disabled={disabled || submitting}
          onPaste={(e) => {
            const files = Array.from(e.clipboardData.files);
            if (files.length > 0) {
              e.preventDefault();
              addFiles(files);
            }
          }}
          onChange={(e) => {
            setValue(e.target.value);
            grow();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void submit();
            }
          }}
        />
        <div className="ai-chat-composer-row">
          {canAttach && (
            <>
              <input
                ref={fileRef}
                type="file"
                multiple
                accept={attachmentAccept(modelInfo)}
                hidden
                onChange={(e) => {
                  addFiles(Array.from(e.target.files ?? []));
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                className="ai-chat-attach"
                onClick={() => fileRef.current?.click()}
                title={`Attach ${supported.join(", ")}`}
                aria-label={`Attach ${supported.join(", ")}`}
                disabled={submitting || streaming}
              >
                <Icon name="plus" />
              </button>
            </>
          )}
          <ModelPicker providers={providers} modelsFor={modelsFor} value={model} onChange={onModelChange} />
          {streaming ? (
            <button className="ai-chat-send is-stop" onClick={onStop} title="Stop">
              <Icon name="square" />
            </button>
          ) : (
            <button className="ai-chat-send" onClick={() => void submit()} disabled={!canSend} title="Send">
              <Icon name="arrow-up" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
