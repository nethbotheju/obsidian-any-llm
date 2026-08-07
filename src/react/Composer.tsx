import { useEffect, useRef, useState, type ReactNode } from "react";
import { Notice } from "obsidian";
import type { TFile } from "obsidian";
import { Icon, useServices } from "./common";
import { ModelPicker } from "./ModelPicker";
import { FilePicker } from "./FilePicker";
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
import { findRefs, isReferenceable, parseObsidianFileUri, referenceableFiles, resolveLinkPath, resolveRef } from "../refs";

const BINARY_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  svg: "image/svg+xml",
  pdf: "application/pdf",
};

// `@` triggers only at the start of the input or right after whitespace, so
// `email@x.com` and `foo@bar` never open the picker.
function detectTrigger(text: string, caret: number): { anchor: number; query: string } | null {
  let i = caret - 1;
  while (i >= 0) {
    const ch = text[i];
    if (ch === "@") {
      if (text[i + 1] === "[") return null; // caret inside an existing @[ref]
      return i === 0 || /\s/.test(text[i - 1])
        ? { anchor: i, query: text.slice(i + 1, caret) }
        : null;
    }
    if (/\s/.test(ch)) return null;
    i--;
  }
  return null;
}

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
  const { app } = useServices();
  const [value, setValue] = useState("");
  const [pending, setPending] = useState<PendingAttachment[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [picker, setPicker] = useState({ open: false, anchor: 0, query: "", selected: 0 });
  const ref = useRef<HTMLTextAreaElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const supported = supportedAttachmentModalities(modelInfo);
  const canAttach = !disabled && supported.length > 0;

  useEffect(() => {
    const t = setTimeout(() => ref.current?.focus(), 60);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!picker.open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setPicker((p) => ({ ...p, open: false }));
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [picker.open]);

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

  // ponytail: refilter each render; getFiles() is Obsidian's in-memory list so
  // this is cheap. Memoize if a vault > ~20k files measures slow.
  const refFiles = picker.open ? referenceableFiles(app) : [];
  const filtered = picker.open
    ? refFiles
        .filter((f) => f.path.toLowerCase().includes(picker.query.trim().toLowerCase()))
        .slice(0, 200)
    : [];
  const selected = filtered.length ? Math.min(picker.selected, filtered.length - 1) : 0;

  // mirror overlay: renders the same text with resolved references in the
  // accent color. The textarea sits on top with transparent text + visible
  // caret; scroll is synced so wraps stay aligned.
  const mirrorNodes: ReactNode[] = (() => {
    const out: ReactNode[] = [];
    const refs = findRefs(value);
    let cursor = 0;
    for (const r of refs) {
      if (r.start > cursor) out.push(value.slice(cursor, r.start));
      const slice = value.slice(r.start, r.end);
      out.push(resolveRef(app, r.path) ? <span className="ai-chat-input-ref" key={r.start}>{slice}</span> : slice);
      cursor = r.end;
    }
    if (cursor < value.length) out.push(value.slice(cursor));
    return out;
  })();

  const syncPicker = (text: string, caret: number) => {
    const trig = detectTrigger(text, caret);
    setPicker((p) => {
      if (!trig) return p.open ? { ...p, open: false } : p;
      return p.open
        ? { ...p, anchor: trig.anchor, query: trig.query, selected: 0 }
        : { open: true, anchor: trig.anchor, query: trig.query, selected: 0 };
    });
  };

  const syncFromEl = () => {
    const el = ref.current;
    if (el) syncPicker(el.value, el.selectionStart ?? el.value.length);
  };

  const insertRef = (file: TFile) => {
    const el = ref.current;
    const caret = el?.selectionStart ?? value.length;
    const refText = /\s/.test(file.path) ? `@[${file.path}]` : `@${file.path}`;
    // picker.anchor only points at the `@query` span when the picker is open;
    // on closed-picker drag-drops there's nothing to replace, so insert at caret.
    const start = picker.open ? picker.anchor : caret;
    const before = value.slice(0, start);
    const after = value.slice(caret);
    const next = before + refText + " " + after;
    setValue(next);
    setPicker({ open: false, anchor: 0, query: "", selected: 0 });
    const pos = before.length + refText.length + 1;
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(pos, pos);
      grow();
    });
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

  const attachTFile = async (file: TFile) => {
    const mime = BINARY_MIME[file.extension.toLowerCase()];
    if (!mime) {
      new Notice(`Can't attach ${file.name} from the vault.`);
      return;
    }
    const buf = await app.vault.readBinary(file);
    addFiles([new File([new Blob([buf])], file.name, { type: mime })]);
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
        setPicker({ open: false, anchor: 0, query: "", selected: 0 });
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
      ref={wrapRef}
      onDragOver={(e) => {
        const types = e.dataTransfer.types;
        if (types.includes("Files") || types.includes("text/plain")) e.preventDefault();
      }}
      onDrop={(e) => {
        e.preventDefault();
        // Internal file-explorer drags carry an obsidian://open?…&file=<linkpath>
        // URI in text/plain (no extension for notes); OS/Finder drags fill
        // dataTransfer.files. Resolve either to a TFile, else attach raw files.
        const payload = e.dataTransfer.getData("text/plain");
        const linkpath = payload.startsWith("obsidian://") ? parseObsidianFileUri(payload) : payload || null;
        const tf = linkpath ? (app.vault.getFileByPath(linkpath) ?? resolveLinkPath(app, linkpath)) : null;
        if (tf) {
          if (isReferenceable(tf)) insertRef(tf);
          else void attachTFile(tf);
          return;
        }
        if (e.dataTransfer.files?.length) addFiles(Array.from(e.dataTransfer.files));
      }}
    >
      {picker.open && (
        <div className="ai-chat-filepicker-anchor">
          <FilePicker
            files={filtered}
            selected={selected}
            onSelect={insertRef}
            onHover={(i) => setPicker((p) => ({ ...p, selected: i }))}
          />
        </div>
      )}
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
        <div className="ai-chat-input-wrap">
          <div ref={mirrorRef} className="ai-chat-input ai-chat-input-mirror" aria-hidden="true">
            {mirrorNodes}
          </div>
          <textarea
            ref={ref}
            className="ai-chat-input ai-chat-input-real"
            rows={1}
          placeholder={disabled ? "Configure a provider & model in Settings…" : "Ask anything… (type @ to reference a note)"}
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
            syncPicker(e.target.value, e.target.selectionStart ?? e.target.value.length);
          }}
          onSelect={syncFromEl}
          onScroll={(e) => {
            if (mirrorRef.current) mirrorRef.current.scrollTop = e.currentTarget.scrollTop;
          }}
          onKeyDown={(e) => {
            if (e.key === "Backspace") {
              const el = ref.current;
              if (el && el.selectionStart === el.selectionEnd) {
                const caret = el.selectionStart;
                let target: { start: number; end: number } | null = null;
                for (const r of findRefs(value)) {
                  if (r.end === caret && resolveRef(app, r.path)) {
                    target = r;
                    break;
                  }
                }
                if (target) {
                  const start = target.start;
                  e.preventDefault();
                  const next = value.slice(0, start) + value.slice(target.end);
                  setValue(next);
                  syncPicker(next, start);
                  requestAnimationFrame(() => {
                    el.setSelectionRange(start, start);
                    grow();
                    if (mirrorRef.current) mirrorRef.current.scrollTop = el.scrollTop;
                  });
                  return;
                }
              }
            }
            if (picker.open) {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setPicker((p) => ({ ...p, selected: Math.min(p.selected + 1, filtered.length - 1) }));
                return;
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setPicker((p) => ({ ...p, selected: Math.max(p.selected - 1, 0) }));
                return;
              }
              if (e.key === "Enter") {
                e.preventDefault();
                const f = filtered[selected];
                if (f) insertRef(f);
                return;
              }
              if (e.key === "Escape") {
                e.preventDefault();
                setPicker((p) => ({ ...p, open: false }));
                return;
              }
            }
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void submit();
            }
          }}
        />
        </div>
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
