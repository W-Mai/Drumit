import { useEffect, useMemo, useRef, useState } from "react";
import { defaultSample, samples } from "./notation/samples";
import { parseDrumtab } from "./notation/parser";
import { serializeScore } from "./notation/serialize";
import { layoutScore } from "./notation/layout";
import { DrumChart } from "./notation/renderer";
import { validateScore } from "./notation/validate";
import { exportScoreToMidi } from "./notation/midiExport";
import {
  cycleBarEnding,
  deleteBar,
  insertBarAfter,
  setBarRepeatPrevious,
  toggleBarRepeatEnd,
  toggleBarRepeatStart,
  setGroupDivision,
  setLaneDivision,
  setSticking,
  splitBeatIntoGroups,
  toggleArticulation,
  toggleSlot,
} from "./notation/edit";
import { PadEditor } from "./components/PadEditor";
import { PlaybackBar } from "./components/PlaybackBar";
import { useHotkeys } from "./lib/useHotkeys";
import {
  clearWorkspace,
  loadWorkspace,
  newId,
  saveWorkspace,
  type DocumentRecord,
} from "./lib/storage";
import { DocumentList } from "./components/DocumentList";
import { HotkeyPanel } from "./components/HotkeyPanel";
import { HotkeyContextProvider } from "./components/HotkeyContextProvider";
import { HoverClickPopover } from "./components/HoverClickPopover";
import { ExportMenu } from "./components/ExportMenu";
import { AboutModal } from "./components/AboutModal";
import { Badge, Button, Panel, PanelHeader } from "./components/ui";
import type { Score } from "./notation/types";
import { cn } from "./lib/utils";
import { useHistory } from "./lib/useHistory";

type Mode = "source" | "visual";

function nameToFilename(doc: { name: string; source: string }): string {
  const titleMatch = doc.source.match(/^\s*title:\s*(.+)$/m);
  const base = (doc.name || titleMatch?.[1] || "chart").trim();
  const slug = base
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, "_")
    .slice(0, 48);
  return `${slug || "chart"}.drumtab`;
}

function loadInitialWorkspace(): {
  documents: DocumentRecord[];
  activeId: string;
  sidebarCollapsed: boolean;
  editorCollapsed: boolean;
} {
  const ws = loadWorkspace();
  if (ws && ws.documents.length) {
    return {
      documents: ws.documents,
      activeId: ws.activeId ?? ws.documents[0].id,
      sidebarCollapsed: ws.ui?.sidebarCollapsed ?? false,
      // Default collapsed = read-only mode. The user opts in to editing.
      editorCollapsed: ws.ui?.editorCollapsed ?? true,
    };
  }
  const id = newId();
  return {
    documents: [
      {
        id,
        name: "",
        source: defaultSample().source,
        savedAt: Date.now(),
      },
    ],
    activeId: id,
    sidebarCollapsed: false,
    editorCollapsed: true,
  };
}

export default function App() {
  const [documents, setDocuments] = useState<DocumentRecord[]>(
    () => loadInitialWorkspace().documents,
  );
  const [activeId, setActiveId] = useState<string>(
    () => loadInitialWorkspace().activeId,
  );

  const activeDoc =
    documents.find((d) => d.id === activeId) ?? documents[0];

  // Parse the active document's source into a Score.
  const parsed = useMemo(() => parseDrumtab(activeDoc.source), [activeDoc.source]);
  const score = parsed.score;
  const [textDraft, setTextDraft] = useState<string | null>(null);
  // Diagnostics only meaningfully differ from `parsed.diagnostics` while the
  // user has a textDraft (mid-edit in source view). When textDraft is null
  // they equal parsed.diagnostics.
  const [textDraftDiagnostics, setTextDraftDiagnostics] = useState<
    typeof parsed.diagnostics | null
  >(null);
  const textDiagnostics = textDraftDiagnostics ?? parsed.diagnostics;

  const [mode, setMode] = useState<Mode>("visual");
  const [selectedBar, setSelectedBar] = useState<number | null>(0);
  const [showLabels, setShowLabels] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => loadInitialWorkspace().sidebarCollapsed,
  );
  const [aboutOpen, setAboutOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileNavOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileNavOpen]);
  const [editorCollapsed, setEditorCollapsed] = useState(
    () => loadInitialWorkspace().editorCollapsed,
  );

  const serializedSource = useMemo(() => serializeScore(score), [score]);
  const currentSource = textDraft ?? serializedSource;

  // Debounced workspace persistence.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (saveTimer.current !== null) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveWorkspace({
        version: 3,
        documents,
        activeId,
        ui: { sidebarCollapsed, editorCollapsed },
      });
    }, 400);
    return () => {
      if (saveTimer.current !== null) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
    };
  }, [documents, activeId, sidebarCollapsed, editorCollapsed]);

  const validation = useMemo(() => validateScore(score), [score]);
  const diagnostics = [...textDiagnostics, ...validation];
  const hasErrors = diagnostics.some((d) => d.level === "error");

  const totalBars = score.sections.reduce((a, s) => a + s.bars.length, 0);
  const clampedSelectedBar =
    selectedBar === null
      ? null
      : Math.min(selectedBar, Math.max(0, totalBars - 1));

  const [playCursor, setPlayCursor] = useState<{
    barIndex: number;
    beatIndex: number;
  } | null>(null);

  // Ref-as-state so Export actions can reach the currently rendered
  // SVG without re-rendering through `react-dom/server`.
  const [chartContainer, setChartContainer] =
    useState<HTMLDivElement | null>(null);

  useHotkeys([
    {
      key: "ArrowLeft",
      meta: true,
      description: "Previous bar",
      handler: () =>
        setSelectedBar((i) => (i === null ? 0 : Math.max(0, i - 1))),
    },
    {
      key: "ArrowRight",
      meta: true,
      description: "Next bar",
      handler: () =>
        setSelectedBar((i) =>
          i === null ? 0 : Math.min(totalBars - 1, i + 1),
        ),
    },
    {
      key: "ArrowLeft",
      ctrl: true,
      description: "Previous bar",
      handler: () =>
        setSelectedBar((i) => (i === null ? 0 : Math.max(0, i - 1))),
    },
    {
      key: "ArrowRight",
      ctrl: true,
      description: "Next bar",
      handler: () =>
        setSelectedBar((i) =>
          i === null ? 0 : Math.min(totalBars - 1, i + 1),
        ),
    },
    // Undo / Redo. Cmd+Z / Ctrl+Z for undo; Shift variants for redo.
    {
      key: "z",
      meta: true,
      description: "Undo",
      handler: handleUndo,
    },
    {
      key: "z",
      ctrl: true,
      description: "Undo",
      handler: handleUndo,
    },
    {
      key: "z",
      meta: true,
      shift: true,
      description: "Redo",
      handler: handleRedo,
    },
    {
      key: "z",
      ctrl: true,
      shift: true,
      description: "Redo",
      handler: handleRedo,
    },
  ]);

  const layout = useMemo(
    () =>
      layoutScore(score, {
        showLabels,
        expanded: false,
        width: 980,
      }),
    [score, showLabels],
  );

  const selectedBarData = useMemo(() => {
    if (clampedSelectedBar === null) return null;
    let count = 0;
    for (const section of score.sections) {
      if (clampedSelectedBar < count + section.bars.length) {
        return section.bars[clampedSelectedBar - count];
      }
      count += section.bars.length;
    }
    return null;
  }, [score, clampedSelectedBar]);

  // Per-document undo/redo history. Keyed by document id so switching
  // between docs preserves each doc's timeline independently.
  const history = useHistory();
  // When true, `writeActiveDocSource` should skip pushing a new history
  // entry — used while applying an undo/redo result to avoid looping.
  const suppressRecordRef = useRef(false);

  // Seed the baseline snapshot for the active document the first time we
  // see it (and whenever the user switches to a doc we haven't tracked).
  useEffect(() => {
    history.record(activeId, activeDoc.source);
    // Only seed on doc switch; subsequent edits go through writeActiveDocSource.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  // Write back a new source string into the active document.
  function writeActiveDocSource(source: string) {
    setDocuments((docs) =>
      docs.map((d) =>
        d.id === activeId
          ? { ...d, source, savedAt: Date.now() }
          : d,
      ),
    );
    if (!suppressRecordRef.current) {
      history.record(activeId, source);
    }
  }

  function applyHistorySnapshot(source: string) {
    suppressRecordRef.current = true;
    try {
      // Write directly without routing through writeActiveDocSource's
      // record path.
      setDocuments((docs) =>
        docs.map((d) =>
          d.id === activeId
            ? { ...d, source, savedAt: Date.now() }
            : d,
        ),
      );
      setTextDraft(null);
      setTextDraftDiagnostics(null);
    } finally {
      suppressRecordRef.current = false;
    }
  }

  function handleUndo() {
    const snapshot = history.undo(activeId);
    if (snapshot !== null) applyHistorySnapshot(snapshot);
  }

  function handleRedo() {
    const snapshot = history.redo(activeId);
    if (snapshot !== null) applyHistorySnapshot(snapshot);
  }

  function handleLoadSample(sampleId: string) {
    const sample = samples.find((s) => s.id === sampleId);
    if (!sample) return;
    // Opening a sample creates a new document rather than overwriting
    // whatever the user is currently editing.
    const result = parseDrumtab(sample.source);
    const id = newId();
    const doc: DocumentRecord = {
      id,
      name: sample.label,
      source: serializeScore(result.score),
      savedAt: Date.now(),
    };
    setDocuments((docs) => [...docs, doc]);
    setActiveId(id);
    setTextDraft(null);
    setTextDraftDiagnostics(null);
    setSelectedBar(result.score.sections[0]?.bars.length ? 0 : null);
  }

  function handleSourceChange(next: string) {
    setTextDraft(next);
    const result = parseDrumtab(next);
    setTextDraftDiagnostics(result.diagnostics);
    if (
      !result.diagnostics.some((d) => d.level === "error") &&
      result.score.sections.length > 0
    ) {
      // While the user is editing raw source, avoid pushing one history
      // entry per keystroke — the textarea has its own native undo.
      // We'll commit a single snapshot when switching back to visual.
      suppressRecordRef.current = true;
      try {
        writeActiveDocSource(serializeScore(result.score));
      } finally {
        suppressRecordRef.current = false;
      }
    }
  }

  function switchMode(next: Mode) {
    setMode(next);
    if (next !== "source") {
      setTextDraft(null);
      setTextDraftDiagnostics(null);
      // Commit whatever the active doc ended up with as a single history
      // entry so undo rolls back the entire source-editing session.
      history.record(activeId, activeDoc.source);
    }
  }

  // Chain of pending updates within the same tick. Multiple synchronous
  // calls to applyScoreUpdate accumulate on top of the last pending result
  // so a sequence like `setDivision(4); toggleSlot(2);` sees the post-
  // division score, not the stale closure one.
  const pendingScoreRef = useRef<Score | null>(null);
  function applyScoreUpdate(update: (s: Score) => Score) {
    const base = pendingScoreRef.current ?? score;
    const next = update(base);
    pendingScoreRef.current = next;
    // Flush at the end of the current task so React batches state writes.
    queueMicrotask(() => {
      if (pendingScoreRef.current) {
        const flushed = pendingScoreRef.current;
        pendingScoreRef.current = null;
        writeActiveDocSource(serializeScore(flushed));
        setTextDraft(null);
      }
    });
  }

  // Document manager actions.
  function handleCreateDoc() {
    const id = newId();
    const newDoc: DocumentRecord = {
      id,
      name: "",
      source: "title: New Chart\ntempo: 100\nmeter: 4/4\n\n[A]\n| bd: o / o / o / o |",
      savedAt: Date.now(),
    };
    setDocuments((docs) => [...docs, newDoc]);
    setActiveId(id);
    setTextDraft(null);
    setSelectedBar(0);
  }

  function handleDuplicateDoc(id: string) {
    const src = documents.find((d) => d.id === id);
    if (!src) return;
    const newDoc: DocumentRecord = {
      id: newId(),
      name: src.name ? `${src.name} copy` : "",
      source: src.source,
      savedAt: Date.now(),
    };
    const srcIdx = documents.findIndex((d) => d.id === id);
    setDocuments((docs) => [
      ...docs.slice(0, srcIdx + 1),
      newDoc,
      ...docs.slice(srcIdx + 1),
    ]);
    setActiveId(newDoc.id);
  }

  function handleRenameDoc(id: string, name: string) {
    setDocuments((docs) =>
      docs.map((d) => (d.id === id ? { ...d, name } : d)),
    );
  }

  function handleDeleteDoc(id: string) {
    setDocuments((docs) => {
      const idx = docs.findIndex((d) => d.id === id);
      if (idx === -1) return docs;
      const next = docs.slice(0, idx).concat(docs.slice(idx + 1));
      if (next.length === 0) {
        // Never leave zero documents — reset to default.
        return [
          {
            id: newId(),
            name: "",
            source: defaultSample().source,
            savedAt: Date.now(),
          },
        ];
      }
      return next;
    });
    // If we deleted the active one, select the previous (or first).
    if (id === activeId) {
      const idx = documents.findIndex((d) => d.id === id);
      const fallback = documents[Math.max(0, idx - 1)];
      if (fallback && fallback.id !== id) setActiveId(fallback.id);
    }
  }

  function handleSelectDoc(id: string) {
    if (id === activeId) return;
    setActiveId(id);
    setTextDraft(null);
    setSelectedBar(0);
  }

  function handleExportDoc(id: string) {
    const doc = documents.find((d) => d.id === id);
    if (!doc) return;
    const filename = nameToFilename(doc);
    const blob = new Blob([doc.source], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleExportDocMidi(id: string) {
    const doc = documents.find((d) => d.id === id);
    if (!doc) return;
    const parsedDoc = parseDrumtab(doc.source);
    if (parsedDoc.score.sections.length === 0) {
      alert("Nothing to export — the document is empty.");
      return;
    }
    const bytes = exportScoreToMidi(parsedDoc.score);
    const filename = nameToFilename(doc).replace(/\.drumtab$/, ".mid");
    // Copy into a plain ArrayBuffer to satisfy Blob's strict typing.
    const buffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(buffer).set(bytes);
    const blob = new Blob([buffer], { type: "audio/midi" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleImportDoc(source: string) {
    const parsedImport = parseDrumtab(source);
    if (parsedImport.score.sections.length === 0) {
      alert("Couldn't parse the file as a .drumtab document.");
      return;
    }
    const id = newId();
    const doc: DocumentRecord = {
      id,
      name: "",
      source,
      savedAt: Date.now(),
    };
    setDocuments((docs) => [...docs, doc]);
    setActiveId(id);
    setTextDraft(null);
    setSelectedBar(0);
  }

  return (
    <HotkeyContextProvider>
    <div className="flex h-dvh w-full flex-col overflow-hidden bg-stone-50">
      <header className="flex flex-none flex-wrap items-center justify-between gap-2 border-b border-stone-200 bg-white px-3 py-2 lg:gap-3 lg:px-5">
        <div className="flex items-center gap-2 lg:gap-3">
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            aria-label="打开文档列表"
            title="文档"
            className="flex size-8 items-center justify-center rounded-md text-stone-600 hover:bg-stone-100 hover:text-stone-900 lg:hidden"
          >
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              className="size-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <p className="text-brand text-[11px] font-bold tracking-[0.18em] uppercase">
            Drumit
          </p>
          <h1 className="text-ink hidden font-serif text-base leading-none font-semibold tracking-tight sm:block">
            Drumtab visualizer
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="https://github.com/W-Mai/Drumit"
            target="_blank"
            rel="noreferrer noopener"
            title="GitHub 源码"
            aria-label="GitHub 源码"
            className="flex size-7 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-600 hover:bg-stone-50 hover:text-stone-900"
          >
            <svg
              viewBox="0 0 16 16"
              aria-hidden="true"
              className="size-[14px] fill-current"
            >
              <path d="M8 0C3.58 0 0 3.58 0 8a8 8 0 0 0 5.47 7.59c.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
            </svg>
          </a>
          <a
            href="https://benign.host"
            target="_blank"
            rel="noreferrer noopener"
            title="博客 · benign.host"
            aria-label="博客"
            className="hidden h-7 items-center justify-center rounded-full border border-stone-200 bg-white px-2.5 text-[11px] font-semibold text-stone-600 hover:bg-stone-50 hover:text-stone-900 sm:flex"
          >
            benign.host
          </a>
          <button
            type="button"
            onClick={() => setAboutOpen(true)}
            title="关于"
            aria-label="关于"
            className="flex size-7 items-center justify-center rounded-full border border-stone-200 bg-white text-sm font-semibold text-stone-600 hover:bg-stone-50 hover:text-stone-900"
          >
            i
          </button>
          <Button
            variant="danger"
            onClick={() => {
              if (
                window.confirm(
                  "Reset all documents to the default example? Your saved edits will be cleared.",
                )
              ) {
                clearWorkspace();
                const id = newId();
                setDocuments([
                  {
                    id,
                    name: "",
                    source: defaultSample().source,
                    savedAt: Date.now(),
                  },
                ]);
                setActiveId(id);
                setTextDraft(null);
                setSelectedBar(0);
              }
            }}
            title="Clear saved data and reset"
          >
            Reset
          </Button>
        </div>
      </header>
      <AboutModal open={aboutOpen} onClose={() => setAboutOpen(false)} />

      {mobileNavOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="文档列表"
          className="fixed inset-0 z-50 flex lg:hidden"
        >
          <button
            type="button"
            aria-label="关闭文档列表"
            onClick={() => setMobileNavOpen(false)}
            className="absolute inset-0 bg-stone-900/50"
          />
          <div className="relative flex h-full w-[85vw] max-w-sm flex-col bg-white shadow-xl">
            <DocumentList
              documents={documents.map((d) => ({
                id: d.id,
                name: d.name,
                source: d.source,
              }))}
              activeId={activeId}
              onSelect={(id) => {
                handleSelectDoc(id);
                setMobileNavOpen(false);
              }}
              onCreate={() => {
                handleCreateDoc();
                setMobileNavOpen(false);
              }}
              onDuplicate={handleDuplicateDoc}
              onRename={handleRenameDoc}
              onDelete={handleDeleteDoc}
              onExport={handleExportDoc}
              onExportMidi={handleExportDocMidi}
              onImport={(src) => {
                handleImportDoc(src);
                setMobileNavOpen(false);
              }}
              samples={samples.map(({ id, label }) => ({ id, label }))}
              onLoadSample={(id) => {
                handleLoadSample(id);
                setMobileNavOpen(false);
              }}
              onCollapse={() => setMobileNavOpen(false)}
            />
          </div>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col p-2 lg:flex-row lg:p-3">
        {/* Sidebar is desktop-only. On <lg, it's replaced by a drawer
            opened from the header hamburger — see S3. */}
        {sidebarCollapsed ? (
          <div className="hidden flex-none items-start justify-center lg:flex">
            <button
              type="button"
              onClick={() => setSidebarCollapsed(false)}
              title="Show documents"
              aria-label="Show documents"
              className="flex size-8 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-600 shadow-sm hover:border-stone-300 hover:bg-stone-50 hover:text-stone-900"
            >
              <span className="text-[14px] font-bold leading-none">⇥</span>
            </button>
          </div>
        ) : (
          <div className="relative hidden w-[200px] flex-none flex-col transition-[width] duration-150 lg:flex">
            <DocumentList
              documents={documents.map((d) => ({
                id: d.id,
                name: d.name,
                source: d.source,
              }))}
              activeId={activeId}
              onSelect={handleSelectDoc}
              onCreate={handleCreateDoc}
              onDuplicate={handleDuplicateDoc}
              onRename={handleRenameDoc}
              onDelete={handleDeleteDoc}
              onExport={handleExportDoc}
              onExportMidi={handleExportDocMidi}
              onImport={handleImportDoc}
              samples={samples.map(({ id, label }) => ({ id, label }))}
              onLoadSample={handleLoadSample}
              onCollapse={() => setSidebarCollapsed(true)}
            />
          </div>
        )}
        <button
          type="button"
          onClick={() => setSidebarCollapsed((v) => !v)}
          title={sidebarCollapsed ? "Show documents" : "Hide documents"}
          aria-label={sidebarCollapsed ? "Show documents" : "Hide documents"}
          className="group mx-0.5 hidden w-2.5 flex-none items-center justify-center hover:bg-stone-200/70 lg:flex"
        >
          <span className="h-10 w-[2px] rounded-full bg-stone-200 group-hover:bg-stone-400" />
        </button>


      <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 pb-[calc(3.25rem+env(safe-area-inset-bottom))] lg:pb-0">
        <PlaybackBar
          score={score}
          startBar={clampedSelectedBar ?? 0}
          onCursor={(p) =>
            setPlayCursor({ barIndex: p.barIndex, beatIndex: p.beatIndex })
          }
          onStop={() => setPlayCursor(null)}
        />

        <Panel className="flex min-h-0 flex-[55_55_0%] flex-col">
          <PanelHeader title="Preview">
            <Button
              variant={showLabels ? "primary" : "secondary"}
              onClick={() => setShowLabels((v) => !v)}
            >
              {showLabels ? "Hide labels" : "Show labels"}
            </Button>
            <ExportMenu
              score={score}
              getSvgElement={() =>
                chartContainer?.querySelector("svg") ?? null
              }
            />
          </PanelHeader>
          <div
            ref={setChartContainer}
            className="min-h-0 flex-1 overflow-auto bg-stone-100/40 p-4"
          >
            {hasErrors ? (
              <div className="grid min-h-[280px] place-items-center text-sm text-stone-500">
                Fix parse errors to update the preview.
              </div>
            ) : (
              <DrumChart
                layout={layout}
                showLabels={showLabels}
                selectedBarIndex={clampedSelectedBar}
                onSelectBar={(idx) => setSelectedBar(idx)}
                playCursor={playCursor}
              />
            )}
          </div>
        </Panel>

        {/* Horizontal splitter between Preview and the editor — clicking
            anywhere along the strip toggles the editor. Mirrors the
            sidebar's vertical splitter to make the interaction
            discoverable. */}
        <button
          type="button"
          onClick={() => setEditorCollapsed((v) => !v)}
          title={editorCollapsed ? "Show editor" : "Hide editor"}
          aria-label={editorCollapsed ? "Show editor" : "Hide editor"}
          className="group -my-0.5 flex h-2.5 flex-none items-center justify-center hover:bg-stone-200/70"
        >
          <span className="h-[2px] w-16 rounded-full bg-stone-200 group-hover:bg-stone-400" />
        </button>
        <div
          className={cn(
            "flex min-h-0 flex-col",
            editorCollapsed ? "flex-none" : "flex-[45_45_0%]",
          )}
        >
          <Panel className="flex min-h-0 flex-1 flex-col">
          <PanelHeader
            title={
              <span className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setEditorCollapsed((v) => !v)}
                  title={editorCollapsed ? "Show editor" : "Hide editor"}
                  aria-label={editorCollapsed ? "Show editor" : "Hide editor"}
                  className="flex size-5 items-center justify-center rounded text-stone-500 hover:bg-stone-100 hover:text-stone-900"
                >
                  <span className="text-[10px] leading-none">
                    {editorCollapsed ? "▸" : "▾"}
                  </span>
                </button>
                <span>
                  {mode === "visual" ? "Bar editor" : "Source"}
                </span>
                {editorCollapsed ? (
                  <span className="text-[10px] font-medium text-stone-500">
                    · read-only
                  </span>
                ) : null}
              </span>
            }
          >
            <div className="inline-flex rounded-full border border-stone-200 bg-stone-50 p-0.5">
              <ModeTab
                active={mode === "visual"}
                onClick={() => {
                  switchMode("visual");
                  if (editorCollapsed) setEditorCollapsed(false);
                }}
              >
                Visual
              </ModeTab>
              <ModeTab
                active={mode === "source"}
                onClick={() => {
                  switchMode("source");
                  if (editorCollapsed) setEditorCollapsed(false);
                }}
              >
                Source
              </ModeTab>
            </div>
            <Diagnostics diagnostics={diagnostics} />
            <HoverClickPopover
              placement="bottom"
              className="max-w-[min(780px,calc(100vw-24px))]"
              trigger={({ open }) => (
                <span
                  aria-expanded={open}
                  title="Keyboard shortcuts"
                  className={cn(
                    "flex size-7 items-center justify-center rounded-full border text-sm font-bold select-none",
                    open
                      ? "border-amber-400 bg-amber-100 text-stone-900"
                      : "border-stone-200 bg-white text-stone-600 hover:bg-stone-100",
                  )}
                >
                  ?
                </span>
              )}
            >
              <HotkeyPanel />
            </HoverClickPopover>
          </PanelHeader>

          {editorCollapsed ? null : (
          <div className="min-h-0 flex-1 overflow-auto p-4">
            {mode === "source" ? (
              <textarea
                value={currentSource}
                onChange={(event) => handleSourceChange(event.target.value)}
                spellCheck={false}
                className="block h-full min-h-[200px] w-full resize-none rounded-xl bg-stone-900 p-4 font-mono text-sm leading-relaxed text-amber-100 outline-none"
              />
            ) : selectedBarData && clampedSelectedBar !== null ? (
              <PadEditor
                bar={selectedBarData}
                barIndex={clampedSelectedBar}
                totalBars={totalBars}
                beatsPerBar={score.meter.beats}
                onSetRepeat={(hint) =>
                  applyScoreUpdate((s) =>
                    setBarRepeatPrevious(s, clampedSelectedBar, hint),
                  )
                }
                onToggleRepeatStart={() =>
                  applyScoreUpdate((s) =>
                    toggleBarRepeatStart(s, clampedSelectedBar),
                  )
                }
                onToggleRepeatEnd={() =>
                  applyScoreUpdate((s) =>
                    toggleBarRepeatEnd(s, clampedSelectedBar),
                  )
                }
                onCycleEnding={() =>
                  applyScoreUpdate((s) =>
                    cycleBarEnding(s, clampedSelectedBar),
                  )
                }
                onInsertAfter={() => {
                  applyScoreUpdate((s) =>
                    insertBarAfter(s, clampedSelectedBar),
                  );
                  setSelectedBar((i) => (i === null ? null : i + 1));
                }}
                onDelete={() => {
                  applyScoreUpdate((s) => deleteBar(s, clampedSelectedBar));
                }}
                onSetDivision={(bi, inst, d) =>
                  applyScoreUpdate((s) =>
                    setLaneDivision(s, clampedSelectedBar, bi, inst, d),
                  )
                }
                onSetGroupDivision={(bi, inst, gi, d) =>
                  applyScoreUpdate((s) =>
                    setGroupDivision(
                      s,
                      clampedSelectedBar,
                      bi,
                      inst,
                      gi,
                      d,
                    ),
                  )
                }
                onSplitBeat={(bi, inst, count) =>
                  applyScoreUpdate((s) =>
                    splitBeatIntoGroups(
                      s,
                      clampedSelectedBar,
                      bi,
                      inst,
                      count,
                    ),
                  )
                }
                onToggleSlot={(bi, inst, si, gi) =>
                  applyScoreUpdate((s) =>
                    toggleSlot(s, clampedSelectedBar, bi, inst, si, gi),
                  )
                }
                onToggleArticulation={(bi, inst, si, art, gi) =>
                  applyScoreUpdate((s) =>
                    toggleArticulation(
                      s,
                      clampedSelectedBar,
                      bi,
                      inst,
                      si,
                      art,
                      gi,
                    ),
                  )
                }
                onSetSticking={(bi, inst, si, st, gi) =>
                  applyScoreUpdate((s) =>
                    setSticking(
                      s,
                      clampedSelectedBar,
                      bi,
                      inst,
                      si,
                      st,
                      gi,
                    ),
                  )
                }
                onPrevBar={() =>
                  setSelectedBar((i) =>
                    i === null ? 0 : Math.max(0, i - 1),
                  )
                }
                onNextBar={() =>
                  setSelectedBar((i) =>
                    i === null ? 0 : Math.min(totalBars - 1, i + 1),
                  )
                }
              />
            ) : (
              <div className="grid min-h-[280px] place-items-center text-sm text-stone-500">
                Click a bar in the preview above to edit it.
              </div>
            )}
          </div>
          )}
          </Panel>
        </div>
      </section>
      </div>
    </div>
    </HotkeyContextProvider>
  );
}

function ModeTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full px-2.5 py-0.5 text-[11px] font-bold transition",
        active
          ? "bg-stone-900 text-white"
          : "text-stone-600 hover:bg-stone-200/70",
      )}
    >
      {children}
    </button>
  );
}

function Diagnostics({
  diagnostics,
}: {
  diagnostics: Array<{ level: "error" | "warning"; line: number; message: string }>;
}) {
  const errors = diagnostics.filter((d) => d.level === "error").length;
  const warnings = diagnostics.filter((d) => d.level === "warning").length;
  if (errors === 0 && warnings === 0) return <Badge tone="success">OK</Badge>;
  const title = diagnostics
    .map((d) => `${d.level}@${d.line}: ${d.message}`)
    .join("\n");
  return (
    <Badge tone={errors > 0 ? "danger" : "warning"} title={title}>
      {errors > 0 ? `${errors} error${errors > 1 ? "s" : ""}` : ""}
      {errors > 0 && warnings > 0 ? " · " : ""}
      {warnings > 0 ? `${warnings} warn` : ""}
    </Badge>
  );
}
