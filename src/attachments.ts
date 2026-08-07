import type { ModelInfo } from "./catalog";
import type { AttachmentModality, ChatAttachment } from "./types";
import { newId } from "./util";

export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
export const MAX_MESSAGE_ATTACHMENT_BYTES = 50 * 1024 * 1024;
export const MAX_ATTACHMENTS = 5;

const modalities: AttachmentModality[] = ["text", "image", "audio", "video", "pdf"];
export const textExtensions = new Set([
  "c", "cc", "cfg", "conf", "cpp", "css", "csv", "go", "h", "hpp", "html", "ini", "java",
  "js", "json", "jsx", "log", "md", "mdx", "py", "rb", "rs", "scss", "sh", "sql", "toml",
  "ts", "tsx", "txt", "xml", "yaml", "yml",
]);

export interface PendingAttachment {
  file: File;
  modality: AttachmentModality;
}

export function classifyFile(file: Pick<File, "name" | "type">): AttachmentModality | null {
  const type = file.type.toLowerCase();
  if (type === "application/pdf") return "pdf";
  if (type.startsWith("image/")) return "image";
  if (type.startsWith("audio/")) return "audio";
  if (type.startsWith("video/")) return "video";
  if (type.startsWith("text/") || type === "application/json" || type === "application/xml") return "text";
  const extension = file.name.toLowerCase().split(".").pop() ?? "";
  return textExtensions.has(extension) ? "text" : null;
}

export function supportedAttachmentModalities(model: ModelInfo | undefined): AttachmentModality[] {
  if (!model?.attachment) return [];
  return modalities.filter((modality) => model.modalities.input.includes(modality));
}

export function attachmentAccept(model: ModelInfo | undefined): string {
  return supportedAttachmentModalities(model)
    .flatMap((modality) => {
      switch (modality) {
        case "text": return ["text/*", ".md", ".mdx", ".json", ".yaml", ".yml", ".csv"];
        case "image": return ["image/*"];
        case "audio": return ["audio/*"];
        case "video": return ["video/*"];
        case "pdf": return ["application/pdf"];
      }
    })
    .join(",");
}

export function attachmentError(file: File, model: ModelInfo | undefined): string | null {
  if (file.size > MAX_ATTACHMENT_BYTES) return `${file.name} is larger than 20 MB.`;
  const modality = classifyFile(file);
  if (!modality) return `${file.name} is not a supported file type.`;
  if (!supportedAttachmentModalities(model).includes(modality)) {
    return `${file.name} is not supported by the selected model.`;
  }
  return null;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function mediaTypeFor(file: File, modality: AttachmentModality): string {
  if (file.type) return file.type;
  if (modality === "pdf") return "application/pdf";
  if (modality === "image") return "image/*";
  if (modality === "audio") return "audio/*";
  if (modality === "video") return "video/*";
  return "text/plain";
}

export async function serializeFiles(files: File[], model: ModelInfo | undefined): Promise<ChatAttachment[]> {
  if (files.length > MAX_ATTACHMENTS) throw new Error(`You can attach up to ${MAX_ATTACHMENTS} files.`);
  let total = 0;
  const out: ChatAttachment[] = [];
  for (const file of files) {
    const error = attachmentError(file, model);
    if (error) throw new Error(error);
    const modality = classifyFile(file)!;
    total += file.size;
    if (total > MAX_MESSAGE_ATTACHMENT_BYTES) throw new Error("Attachments exceed the 50 MB message limit.");
    out.push({
      id: newId(),
      filename: file.name,
      mediaType: mediaTypeFor(file, modality),
      modality,
      size: file.size,
      data: toBase64(new Uint8Array(await file.arrayBuffer())),
    });
  }
  return out;
}

export function formatAttachmentSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function attachmentDataUrl(attachment: ChatAttachment): string {
  return `data:${attachment.mediaType};base64,${attachment.data}`;
}
