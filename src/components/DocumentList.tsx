import { useRef } from "react";
import { cn } from "../lib/utils";
import { Button } from "./ui";

export interface DocumentSummary {
  id: string;
  name: string;
  source: string;
}

interface Props {
  documents: DocumentSummary[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDuplicate: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onExport: (id: string) => void;
  onExportMidi: (id: string) => void;
  onImport: (source: string) => void;
  /** Optional: show a collapse button in the header when provided. */
  onCollapse?: () => void;
}

export function DocumentList({
  documents,
  activeId,
  onSelect,
  onCreate,
  onDuplicate,
  onRename,
  onDelete,
  onExport,
  onExportMidi,
  onImport,
  onCollapse,
}: Props) {
  const fileInput = useRef<HTMLInputElement>(null);

  function handleImport(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === "string" ? reader.result : "";
      if (text) onImport(text);
    };
    reader.readAsText(file);
  }

  return (
    <aside className="flex h-full min-h-0 flex-1 flex-col rounded-2xl border border-stone-200 bg-white">
      <header className="flex items-center justify-between gap-1 border-b border-stone-200 px-3 py-2">
        <h3 className="text-[10px] font-extrabold tracking-wide text-stone-500 uppercase">
          Documents
        </h3>
        <div className="flex items-center gap-1">
          <Button size="xs" onClick={onCreate} title="New document">
            + New
          </Button>
          <Button
            size="xs"
            onClick={() => fileInput.current?.click()}
            title="Import .drumtab file"
          >
            ↑ Import
          </Button>
          {onCollapse ? (
            <button
              type="button"
              onClick={onCollapse}
              title="Collapse documents panel"
              className="ml-0.5 flex size-5 items-center justify-center rounded text-stone-400 hover:bg-stone-100 hover:text-stone-700"
            >
              ‹
            </button>
          ) : null}
          <input
            ref={fileInput}
            type="file"
            accept=".drumtab,text/plain"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleImport(file);
              e.target.value = "";
            }}
          />
        </div>
      </header>
      <ul className="flex-1 overflow-y-auto p-1">
        {documents.map((doc) => (
          <DocumentItem
            key={doc.id}
            doc={doc}
            active={doc.id === activeId}
            onSelect={() => onSelect(doc.id)}
            onRename={(name) => onRename(doc.id, name)}
            onDuplicate={() => onDuplicate(doc.id)}
            onDelete={() => onDelete(doc.id)}
            onExport={() => onExport(doc.id)}
            onExportMidi={() => onExportMidi(doc.id)}
          />
        ))}
      </ul>
    </aside>
  );
}

function DocumentItem({
  doc,
  active,
  onSelect,
  onRename,
  onDuplicate,
  onDelete,
  onExport,
  onExportMidi,
}: {
  doc: DocumentSummary;
  active: boolean;
  onSelect: () => void;
  onRename: (name: string) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onExport: () => void;
  onExportMidi: () => void;
}) {
  const titleFromSource =
    doc.source.match(/^\s*title:\s*(.+)$/m)?.[1].trim() ?? "";
  const displayName = doc.name || titleFromSource || "Untitled";

  function promptRename() {
    const next = window.prompt("Rename document", displayName);
    if (next !== null && next.trim() !== displayName)
      onRename(next.trim());
  }

  return (
    <li
      className={cn(
        "group mb-1 flex items-center gap-1 rounded-lg px-2 py-1.5 text-[12px]",
        active
          ? "bg-amber-100 text-stone-900"
          : "text-stone-700 hover:bg-stone-100",
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        className="min-w-0 flex-1 truncate text-left font-semibold"
        title={displayName}
      >
        {displayName}
      </button>
      <div className="flex flex-shrink-0 gap-0.5 opacity-0 group-hover:opacity-100">
        <IconButton title="Rename" onClick={promptRename}>
          ✎
        </IconButton>
        <IconButton title="Duplicate" onClick={onDuplicate}>
          ⎘
        </IconButton>
        <IconButton title="Export .drumtab" onClick={onExport}>
          ↓
        </IconButton>
        <IconButton title="Export .mid" onClick={onExportMidi}>
          ♪
        </IconButton>
        <IconButton
          title="Delete"
          onClick={() => {
            if (window.confirm(`Delete "${displayName}"?`)) onDelete();
          }}
          danger
        >
          ✕
        </IconButton>
      </div>
    </li>
  );
}

function IconButton({
  title,
  onClick,
  danger,
  children,
}: {
  title: string;
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "rounded px-1 text-[11px] leading-tight",
        danger ? "hover:bg-red-500 hover:text-white" : "hover:bg-stone-200",
      )}
    >
      {children}
    </button>
  );
}
