import type { TFile } from "obsidian";

type Row =
  | { kind: "folder"; key: string; name: string }
  | { kind: "file"; key: string; file: TFile; index: number };

export function FilePicker({
  files,
  selected,
  onSelect,
  onHover,
}: {
  files: TFile[];
  selected: number;
  onSelect: (file: TFile) => void;
  onHover: (index: number) => void;
}) {
  const rows: Row[] = [];
  let idx = 0;
  let lastFolder = "";
  for (const f of files) {
    const folder = f.parent?.path ?? "/";
    if (folder !== lastFolder) {
      if (folder !== "/") rows.push({ kind: "folder", key: `f:${folder}`, name: folder });
      lastFolder = folder;
    }
    rows.push({ kind: "file", key: f.path, file: f, index: idx++ });
  }

  return (
    <div className="ai-chat-filepicker" role="listbox">
      {files.length === 0 && <div className="ai-chat-filepicker-empty">No matching files</div>}
      {rows.map((row) =>
        row.kind === "folder" ? (
          <div className="ai-chat-filepicker-folder" key={row.key}>
            {row.name}
          </div>
        ) : (
          <div
            key={row.key}
            className={`ai-chat-filepicker-item${row.index === selected ? " is-selected" : ""}`}
            onMouseDown={(e) => {
              e.preventDefault();
              onSelect(row.file);
            }}
            onMouseEnter={() => onHover(row.index)}
            title={row.file.path}
          >
            <span className="ai-chat-filepicker-name">{row.file.name}</span>
          </div>
        ),
      )}
    </div>
  );
}
