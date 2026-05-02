import { useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "../lib/utils";
import { Button, SelectMenu, useDialog } from "./ui";
import { useI18n } from "../i18n/useI18n";

export interface DocumentSummary {
  id: string;
  name: string;
  source: string;
}

export interface SampleEntry {
  id: string;
  label: string;
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
  /** Available bundled samples; shown as a "Load example…" dropdown. */
  samples?: SampleEntry[];
  onLoadSample?: (sampleId: string) => void;
  /** When provided, a collapse pill floats on the top-right of the panel. */
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
  samples,
  onLoadSample,
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
      <header className="flex flex-col gap-1.5 border-b border-stone-200 px-3 py-2">
        <div className="flex items-center justify-between">
          <h3 className="text-[10px] font-extrabold tracking-wide text-stone-500 uppercase">
            Documents
          </h3>
          {onCollapse ? (
            <button
              type="button"
              onClick={onCollapse}
              title="Hide documents"
              aria-label="Hide documents"
              className="flex size-5 items-center justify-center rounded text-stone-500 hover:bg-stone-100 hover:text-stone-900"
            >
              <span className="text-[12px] font-bold leading-none">⇤</span>
            </button>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-1">
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
          {samples && onLoadSample ? (
            <SelectMenu
              size="xs"
              value=""
              placeholder="♪ Example…"
              title="Load a bundled example"
              options={samples.map((s) => ({
                value: s.id,
                label: s.label,
              }))}
              onChange={(id) => {
                if (id) onLoadSample(id);
              }}
              className="h-6 rounded-full"
            />
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
        <AnimatePresence initial={false}>
          {documents.map((doc) => (
            <motion.div
              key={doc.id}
              layout
              initial={{ opacity: 0, height: 0, scale: 0.95 }}
              animate={{ opacity: 1, height: "auto", scale: 1 }}
              exit={{ opacity: 0, height: 0, scale: 0.95 }}
              transition={{ duration: 0.18, ease: [0.2, 0, 0, 1] }}
            >
              <DocumentItem
                doc={doc}
                active={doc.id === activeId}
                onSelect={() => onSelect(doc.id)}
                onRename={(name) => onRename(doc.id, name)}
                onDuplicate={() => onDuplicate(doc.id)}
                onDelete={() => onDelete(doc.id)}
                onExport={() => onExport(doc.id)}
                onExportMidi={() => onExportMidi(doc.id)}
              />
            </motion.div>
          ))}
        </AnimatePresence>
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
  const dialog = useDialog();
  const { t } = useI18n();
  const titleFromSource =
    doc.source.match(/^\s*title:\s*(.+)$/m)?.[1].trim() ?? "";
  const displayName = doc.name || titleFromSource || "Untitled";

  async function promptRename() {
    const next = await dialog.prompt({
      title: t("doclist.rename_title"),
      message: t("doclist.rename_message"),
      defaultValue: displayName,
      placeholder: t("doclist.new_placeholder"),
    });
    if (next !== null && next.trim() !== displayName) onRename(next.trim());
  }

  async function promptDelete() {
    const ok = await dialog.confirm({
      title: t("doclist.delete_title"),
      message: t("doclist.delete_message", { name: displayName }),
      confirmLabel: t("doclist.delete_confirm"),
      tone: "danger",
    });
    if (ok) onDelete();
  }

  return (
    <li
      className={cn(
        "group mb-1 flex items-center gap-1 rounded-lg px-2 text-[12px]",
        // Taller touch target on mobile (44px class) while staying compact on desktop.
        "py-2.5 sm:py-1.5",
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
      {/* On touch devices (no hover) we keep the actions always visible so
          they're actually reachable. On pointer:fine they stay hover-only
          to keep the list calm. */}
      <div className="flex flex-shrink-0 gap-0.5 opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100">
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
        <IconButton title="Delete" onClick={() => void promptDelete()} danger>
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
