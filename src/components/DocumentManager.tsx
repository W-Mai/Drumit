import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "../lib/utils";
import { Button, SelectMenu, useDialog } from "./ui";
import { useI18n } from "../i18n/useI18n";
import { FloatingMenu } from "./FloatingMenu";
import { generateThumbnail, getThumbnail } from "../lib/thumbnailCache";

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
  open: boolean;
  onClose: () => void;
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
  samples?: SampleEntry[];
  onLoadSample?: (sampleId: string) => void;
}

type ViewMode = "grid" | "list";
const VIEW_KEY = "drumit.docMgrView";
const THUMB_WIDTH = 280;

function loadInitialView(): ViewMode {
  if (typeof window === "undefined") return "grid";
  const v = window.localStorage.getItem(VIEW_KEY);
  return v === "list" ? "list" : "grid";
}

export function DocumentManager({
  open,
  onClose,
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
}: Props) {
  const { t } = useI18n();
  const dialog = useDialog();
  const [view, setView] = useState<ViewMode>(loadInitialView);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(VIEW_KEY, view);
    }
  }, [view]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  function handleImport(file: File) {
    const isMidi = /\.mid(i)?$/i.test(file.name);
    const reader = new FileReader();
    reader.onload = async () => {
      if (isMidi) {
        const buf = reader.result as ArrayBuffer;
        const { importScoreFromMidi } = await import("../notation/midiImport");
        const { serializeScore } = await import("../notation/serialize");
        try {
          const { score } = importScoreFromMidi(new Uint8Array(buf));
          onImport(serializeScore(score));
        } catch (err) {
          void dialog.alert({
            title: t("import.failed_title"),
            message: err instanceof Error ? err.message : String(err),
            tone: "danger",
          });
        }
        return;
      }
      const text = typeof reader.result === "string" ? reader.result : "";
      if (text) onImport(text);
    };
    if (isMidi) reader.readAsArrayBuffer(file);
    else reader.readAsText(file);
  }

  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label={t("doclist.manager_title")}
          className="bg-overlay-backdrop fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
          onClick={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <motion.div
            className="
              flex w-full flex-col overflow-hidden bg-white shadow-xl
              h-[85dvh] rounded-t-2xl
              sm:h-[min(720px,85vh)] sm:w-full sm:max-w-4xl sm:rounded-2xl
              pb-[env(safe-area-inset-bottom)]
            "
            initial={{ y: 24, scale: 0.96, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 24, scale: 0.96, opacity: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
          >
            <Toolbar
              view={view}
              setView={setView}
              onClose={onClose}
              onCreate={onCreate}
              onImportClick={() => fileInput.current?.click()}
              samples={samples}
              onLoadSample={onLoadSample}
            />
            <input
              ref={fileInput}
              type="file"
              accept=".drumtab,.mid,.midi,text/plain,audio/midi"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleImport(file);
                e.target.value = "";
              }}
            />
            <div className="flex-1 overflow-y-auto">
              {view === "grid" ? (
                <GridView
                  documents={documents}
                  activeId={activeId}
                  onSelect={(id) => {
                    onSelect(id);
                    onClose();
                  }}
                  onDuplicate={onDuplicate}
                  onRename={onRename}
                  onDelete={onDelete}
                  onExport={onExport}
                  onExportMidi={onExportMidi}
                  open={open}
                />
              ) : (
                <ListView
                  documents={documents}
                  activeId={activeId}
                  onSelect={(id) => {
                    onSelect(id);
                    onClose();
                  }}
                  onDuplicate={onDuplicate}
                  onRename={onRename}
                  onDelete={onDelete}
                  onExport={onExport}
                  onExportMidi={onExportMidi}
                  open={open}
                />
              )}
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}

function Toolbar({
  view,
  setView,
  onClose,
  onCreate,
  onImportClick,
  samples,
  onLoadSample,
}: {
  view: ViewMode;
  setView: (v: ViewMode) => void;
  onClose: () => void;
  onCreate: () => void;
  onImportClick: () => void;
  samples?: SampleEntry[];
  onLoadSample?: (id: string) => void;
}) {
  const { t } = useI18n();
  return (
    <header className="flex flex-wrap items-center gap-2 border-b border-stone-200 px-3 py-2">
      <button
        type="button"
        onClick={onClose}
        aria-label={t("about.close")}
        className="motion-press flex size-7 items-center justify-center rounded-full border border-stone-200 text-stone-500 hover:bg-stone-100 hover:text-stone-900 sm:hidden"
      >
        <span className="text-[14px] leading-none">×</span>
      </button>
      <h2 className="flex-1 truncate text-sm font-bold tracking-tight">
        {t("doclist.manager_title")}
      </h2>
      <div className="flex overflow-hidden rounded-full border border-stone-200">
        <ViewToggleButton
          active={view === "grid"}
          onClick={() => setView("grid")}
          title={t("doclist.view_grid")}
        >
          <GridGlyph />
        </ViewToggleButton>
        <ViewToggleButton
          active={view === "list"}
          onClick={() => setView("list")}
          title={t("doclist.view_list")}
        >
          <ListGlyph />
        </ViewToggleButton>
      </div>
      <Button size="xs" onClick={onCreate} title={t("doclist.new_document")}>
        {t("doclist.btn_new")}
      </Button>
      <Button
        size="xs"
        onClick={onImportClick}
        title={t("doclist.import_file")}
      >
        {t("doclist.btn_import")}
      </Button>
      {samples && onLoadSample ? (
        <SelectMenu
          size="xs"
          value=""
          placeholder={t("doclist.sample_placeholder")}
          title={t("doclist.load_example")}
          options={samples.map((s) => ({ value: s.id, label: s.label }))}
          onChange={(id) => {
            if (id) onLoadSample(id);
          }}
          className="h-6 rounded-full"
        />
      ) : null}
      <button
        type="button"
        onClick={onClose}
        aria-label={t("about.close")}
        className="motion-press hidden size-7 items-center justify-center rounded-full border border-stone-200 text-stone-500 hover:bg-stone-100 hover:text-stone-900 sm:flex"
      >
        <span className="text-[14px] leading-none">×</span>
      </button>
    </header>
  );
}

function ViewToggleButton({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-pressed={active}
      className={cn(
        "motion-press flex size-7 items-center justify-center transition-colors",
        active
          ? "bg-stone-900 text-stone-50"
          : "text-stone-500 hover:bg-stone-100 hover:text-stone-900",
      )}
    >
      {children}
    </button>
  );
}

function GridGlyph() {
  return (
    <svg viewBox="0 0 12 12" className="size-3.5" fill="currentColor" aria-hidden>
      <rect x="1" y="1" width="4" height="4" rx="0.8" />
      <rect x="7" y="1" width="4" height="4" rx="0.8" />
      <rect x="1" y="7" width="4" height="4" rx="0.8" />
      <rect x="7" y="7" width="4" height="4" rx="0.8" />
    </svg>
  );
}

function ListGlyph() {
  return (
    <svg viewBox="0 0 12 12" className="size-3.5" fill="currentColor" aria-hidden>
      <rect x="1" y="2" width="10" height="1.6" rx="0.8" />
      <rect x="1" y="5.2" width="10" height="1.6" rx="0.8" />
      <rect x="1" y="8.4" width="10" height="1.6" rx="0.8" />
    </svg>
  );
}

interface ItemHandlers {
  documents: DocumentSummary[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onDuplicate: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onExport: (id: string) => void;
  onExportMidi: (id: string) => void;
  open: boolean;
}

function GridView({
  documents,
  activeId,
  onSelect,
  onDuplicate,
  onRename,
  onDelete,
  onExport,
  onExportMidi,
  open,
}: ItemHandlers) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3 p-3">
      {documents.map((doc) => (
        <GridCard
          key={doc.id}
          doc={doc}
          active={doc.id === activeId}
          onSelect={() => onSelect(doc.id)}
          onDuplicate={() => onDuplicate(doc.id)}
          onRename={(name) => onRename(doc.id, name)}
          onDelete={() => onDelete(doc.id)}
          onExport={() => onExport(doc.id)}
          onExportMidi={() => onExportMidi(doc.id)}
          prime={open}
        />
      ))}
    </div>
  );
}

function ListView({
  documents,
  activeId,
  onSelect,
  onDuplicate,
  onRename,
  onDelete,
  onExport,
  onExportMidi,
  open,
}: ItemHandlers) {
  return (
    <ul className="flex flex-col divide-y divide-stone-100">
      {documents.map((doc) => (
        <ListRow
          key={doc.id}
          doc={doc}
          active={doc.id === activeId}
          onSelect={() => onSelect(doc.id)}
          onDuplicate={() => onDuplicate(doc.id)}
          onRename={(name) => onRename(doc.id, name)}
          onDelete={() => onDelete(doc.id)}
          onExport={() => onExport(doc.id)}
          onExportMidi={() => onExportMidi(doc.id)}
          prime={open}
        />
      ))}
    </ul>
  );
}

// Lightweight source parsing: avoids a full parseDrumtab call just for
// the metadata strip under a card. The title / tempo / bar count are
// inferred by regex — acceptable for display-only meta.
function useDocMeta(source: string) {
  return useMemo(() => {
    const title = source.match(/^\s*title:\s*(.+)$/m)?.[1].trim() ?? "";
    const tempo = source.match(/^\s*tempo:\s*(\d+)/m)?.[1];
    // Count bar delimiters outside of headers. Each bar is bounded by |…|
    // — count openings on non-header lines.
    const barCount = source
      .split("\n")
      .filter((l) => /^\s*\|/.test(l))
      .reduce((acc, l) => acc + (l.match(/\|/g)?.length ?? 0) - 1, 0);
    return { title, tempo, bars: Math.max(0, barCount) };
  }, [source]);
}

function useThumbnail(docId: string, source: string, prime: boolean) {
  // Read-through cache: the sync lookup goes straight through each
  // render, so no setState-in-effect noise and no stale flash when the
  // source changes. The effect only kicks in when a miss needs to
  // trigger an async generation.
  const cached = getThumbnail(docId, source, THUMB_WIDTH);
  const [generatedTick, setGeneratedTick] = useState(0);
  useEffect(() => {
    if (cached) return;
    if (!prime) return;
    let cancelled = false;
    generateThumbnail(docId, source, THUMB_WIDTH).then((next) => {
      if (!cancelled && next) setGeneratedTick((n) => n + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [cached, docId, source, prime]);
  // Reading generatedTick keeps React from short-circuiting the
  // re-render after the async generation finishes.
  void generatedTick;
  return cached;
}

function GridCard({
  doc,
  active,
  onSelect,
  onDuplicate,
  onRename,
  onDelete,
  onExport,
  onExportMidi,
  prime,
}: {
  doc: DocumentSummary;
  active: boolean;
  onSelect: () => void;
  onDuplicate: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
  onExport: () => void;
  onExportMidi: () => void;
  prime: boolean;
}) {
  const { t } = useI18n();
  const meta = useDocMeta(doc.source);
  const svg = useThumbnail(doc.id, doc.source, prime);
  const displayName = doc.name || meta.title || t("editor.untitled");
  return (
    <div
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-xl border bg-white text-left transition",
        active
          ? "border-amber-500 shadow-md shadow-amber-500/20"
          : "border-stone-200 hover:border-stone-400 hover:shadow-md",
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        title={displayName}
        className="flex flex-col text-left"
      >
        <div className="aspect-[3/2] w-full overflow-hidden bg-stone-50">
          {svg ? (
            <div
              className="[&>svg]:h-full [&>svg]:w-full"
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          ) : (
            <ThumbnailPlaceholder />
          )}
        </div>
        <div className="flex flex-col gap-0.5 px-3 py-2">
          <span className="truncate text-[12px] font-bold text-stone-900">
            {displayName}
          </span>
          <span className="truncate text-[10px] text-stone-500 tabular-nums">
            {t("doclist.bars_count", { count: meta.bars })}
            {meta.tempo ? ` · ${meta.tempo} bpm` : ""}
          </span>
        </div>
      </button>
      <ItemActions
        displayName={displayName}
        onRename={onRename}
        onDuplicate={onDuplicate}
        onDelete={onDelete}
        onExport={onExport}
        onExportMidi={onExportMidi}
        floating
      />
    </div>
  );
}

function ListRow({
  doc,
  active,
  onSelect,
  onDuplicate,
  onRename,
  onDelete,
  onExport,
  onExportMidi,
  prime,
}: {
  doc: DocumentSummary;
  active: boolean;
  onSelect: () => void;
  onDuplicate: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
  onExport: () => void;
  onExportMidi: () => void;
  prime: boolean;
}) {
  const { t } = useI18n();
  const meta = useDocMeta(doc.source);
  const svg = useThumbnail(doc.id, doc.source, prime);
  const displayName = doc.name || meta.title || t("editor.untitled");
  return (
    <li
      className={cn(
        "group flex items-center gap-3 px-3 py-2 transition-colors",
        active
          ? "bg-amber-50 dark:bg-amber-500/20"
          : "hover:bg-stone-50",
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        title={displayName}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <div className="flex h-10 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md border border-stone-200 bg-stone-50">
          {svg ? (
            <div
              className="[&>svg]:h-full [&>svg]:w-full"
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          ) : (
            <ThumbnailPlaceholder compact />
          )}
        </div>
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-[13px] font-semibold text-stone-900">
            {displayName}
          </span>
          <span className="truncate text-[11px] text-stone-500 tabular-nums">
            {t("doclist.bars_count", { count: meta.bars })}
            {meta.tempo ? ` · ${meta.tempo} bpm` : ""}
          </span>
        </div>
      </button>
      <ItemActions
        displayName={displayName}
        onRename={onRename}
        onDuplicate={onDuplicate}
        onDelete={onDelete}
        onExport={onExport}
        onExportMidi={onExportMidi}
      />
    </li>
  );
}

function ThumbnailPlaceholder({ compact = false }: { compact?: boolean }) {
  const lines = compact ? 3 : 5;
  return (
    <svg
      viewBox="0 0 60 40"
      className="h-full w-full"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden
    >
      {Array.from({ length: lines }, (_, i) => (
        <line
          key={i}
          x1="6"
          x2="54"
          y1={10 + i * 5}
          y2={10 + i * 5}
          stroke="currentColor"
          strokeWidth="0.8"
          className="text-stone-200"
        />
      ))}
    </svg>
  );
}

function ItemActions({
  displayName,
  onRename,
  onDuplicate,
  onDelete,
  onExport,
  onExportMidi,
  floating,
}: {
  displayName: string;
  onRename: (name: string) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onExport: () => void;
  onExportMidi: () => void;
  floating?: boolean;
}) {
  const dialog = useDialog();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);

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
    <>
      <button
        ref={setAnchor}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-label={t("doclist.manage")}
        title={t("doclist.manage")}
        className={cn(
          "motion-press flex size-7 shrink-0 items-center justify-center rounded-full bg-white/90 text-stone-600 shadow-sm backdrop-blur transition-opacity hover:bg-white hover:text-stone-900",
          floating
            ? "absolute top-2 right-2 border border-stone-200 opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100"
            : "",
        )}
      >
        <span className="text-[14px] leading-none">⋯</span>
      </button>
      <FloatingMenu
        anchor={anchor}
        open={open}
        onClose={() => setOpen(false)}
        placement="bottom"
      >
        <div className="flex min-w-[180px] flex-col gap-0.5 p-1 text-[12px]">
          <MenuItem onClick={() => void promptRename().then(() => setOpen(false))}>
            ✎ {t("doclist.rename")}
          </MenuItem>
          <MenuItem
            onClick={() => {
              onDuplicate();
              setOpen(false);
            }}
          >
            ⎘ {t("doclist.duplicate")}
          </MenuItem>
          <MenuItem
            onClick={() => {
              onExport();
              setOpen(false);
            }}
          >
            ↓ {t("doclist.export")} .drumtab
          </MenuItem>
          <MenuItem
            onClick={() => {
              onExportMidi();
              setOpen(false);
            }}
          >
            ♪ {t("doclist.export")} .mid
          </MenuItem>
          <div className="my-0.5 border-t border-stone-100" />
          <MenuItem
            danger
            onClick={() => void promptDelete().then(() => setOpen(false))}
          >
            ✕ {t("doclist.delete_confirm")}
          </MenuItem>
        </div>
      </FloatingMenu>
    </>
  );
}

function MenuItem({
  onClick,
  children,
  danger,
}: {
  onClick: () => void;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        "rounded-md px-2 py-1.5 text-left font-semibold",
        danger
          ? "text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-500/20"
          : "text-stone-700 hover:bg-stone-100",
      )}
    >
      {children}
    </button>
  );
}
