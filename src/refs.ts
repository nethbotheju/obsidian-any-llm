import type { App, TFile } from "obsidian";
import { formatAttachmentSize, textExtensions } from "./attachments";

export const MAX_REF_BYTES = 512 * 1024;
export const MAX_TOTAL_REF_BYTES = 2 * 1024 * 1024;

export function isReferenceable(file: TFile): boolean {
  return textExtensions.has(file.extension.toLowerCase());
}

export function referenceableFiles(app: App): TFile[] {
  return app.vault.getFiles().filter(isReferenceable);
}

export function resolveRef(app: App, path: string): TFile | null {
  const file = app.vault.getFileByPath(path);
  return file && isReferenceable(file) ? file : null;
}

export async function readRef(app: App, file: TFile): Promise<string> {
  return app.vault.cachedRead(file);
}

export interface RefToken {
  start: number;
  end: number;
  path: string;
}

// A reference is `@<bare>` or `@[<path with spaces>]`, valid only when the `@`
// sits at the start of the text or right after whitespace (so `email@x` and
// `foo@bar` never match). Bare tokens stop at whitespace and shed trailing
// punctuation. Resolution is existence-based: a token only acts as a reference
// when it maps to a real vault file (handled by callers via resolveRef).
const BARE_CHAR = /[^\s@\[\]]/;
const TRAIL_PUNCT = new Set(".,;:!?)]}\"'");

export function findRefs(text: string): RefToken[] {
  const out: RefToken[] = [];
  const n = text.length;
  let i = 0;
  while (i < n) {
    if (text[i] !== "@") {
      i++;
      continue;
    }
    const atStart = i === 0 || /\s/.test(text[i - 1]);
    if (!atStart) {
      i++;
      continue;
    }
    if (text[i + 1] === "[") {
      const close = text.indexOf("]", i + 2);
      if (close > i + 2) {
        out.push({ start: i, end: close + 1, path: text.slice(i + 2, close) });
        i = close + 1;
        continue;
      }
      i++;
      continue;
    }
    if (BARE_CHAR.test(text[i + 1] ?? "")) {
      let j = i + 1;
      while (j < n && BARE_CHAR.test(text[j])) j++;
      while (j > i + 1 && TRAIL_PUNCT.has(text[j - 1])) j--;
      out.push({ start: i, end: j, path: text.slice(i + 1, j) });
      i = j;
      continue;
    }
    i++;
  }
  return out;
}

export type RefRun = { kind: "text"; text: string } | { kind: "ref"; path: string };

export function splitRefs(text: string): RefRun[] {
  const refs = findRefs(text);
  const runs: RefRun[] = [];
  let cursor = 0;
  for (const r of refs) {
    if (r.start > cursor) runs.push({ kind: "text", text: text.slice(cursor, r.start) });
    runs.push({ kind: "ref", path: r.path });
    cursor = r.end;
  }
  if (cursor < text.length) runs.push({ kind: "text", text: text.slice(cursor) });
  return runs;
}

// Delimited block mirroring attachmentPart() in llm.ts: keeps file contents
// clearly separated from the user's instruction — no raw concatenation.
export function fileBlock(path: string, content: string): string {
  return `\n\n[File: ${path}]\n${content}\n[End file]`;
}

export interface RefResolution {
  contents: Map<string, string>;
  errors: string[];
}

// ponytail: body.length is a chars≈bytes proxy for the size cap; fine for text
// notes. Dedupes by path so repeated refs read a file once per message.
export async function collectRefContents(app: App, text: string): Promise<RefResolution> {
  const contents = new Map<string, string>();
  const errors: string[] = [];
  let total = 0;
  for (const r of findRefs(text)) {
    if (contents.has(r.path)) continue;
    const file = resolveRef(app, r.path);
    if (!file) {
      errors.push(`Couldn't find "${r.path}".`);
      continue;
    }
    let body: string;
    try {
      body = await readRef(app, file);
    } catch {
      errors.push(`Couldn't read "${r.path}".`);
      continue;
    }
    if (body.length > MAX_REF_BYTES) {
      errors.push(`"${r.path}" is too large (${formatAttachmentSize(body.length)} > ${formatAttachmentSize(MAX_REF_BYTES)}).`);
      continue;
    }
    total += body.length;
    if (total > MAX_TOTAL_REF_BYTES) {
      errors.push(`File references exceed the ${formatAttachmentSize(MAX_TOTAL_REF_BYTES)} limit.`);
      continue;
    }
    contents.set(r.path, body);
  }
  return { contents, errors };
}
