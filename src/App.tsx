import { useEffect, useMemo, useRef, useState } from "react";
import { dongCiDaCi } from "./notation/examples";
import { naTianWanShang } from "./notation/samples/page03-na-tian-wan-shang";
import { lanLianHua } from "./notation/samples/page04-lan-lian-hua";
import { popRock } from "./notation/samples/page07-pop-rock";
import { rockFusion } from "./notation/samples/page08-rock-fusion";
import { funkRock } from "./notation/samples/page09-funk-rock";
import { bluesVariations } from "./notation/samples/page10-blues";
import { parseDrumtab } from "./notation/parser";
import { serializeScore } from "./notation/serialize";
import { layoutScore } from "./notation/layout";
import { DrumChart } from "./notation/renderer";
import { validateScore } from "./notation/validate";
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
import { Badge, Button, Panel, PanelHeader, Select } from "./components/ui";
import type { Score } from "./notation/types";
import { cn } from "./lib/utils";
import { useHistory } from "./lib/useHistory";

type Mode = "source" | "visual";

const samples = [
  { label: "动次打次", src: dongCiDaCi },
  { label: "那天晚上 (Page 3)", src: naTianWanShang },
  { label: "蓝莲花 (Page 4)", src: lanLianHua },
  { label: "Pop Rock 综合练习 (Page 7)", src: popRock },
  { label: "Rock Fusion 综合练习 (Page 8)", src: rockFusion },
  { label: "Funk Rock 综合练习 (Page 9)", src: funkRock },
  { label: "Blues 节奏变奏 (Page 10)", src: bluesVariations },
];

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
} {
  const ws = loadWorkspace();
  if (ws && ws.documents.length) {
    return {
      documents: ws.documents,
      activeId: ws.activeId ?? ws.documents[0].id,
    };
  }
  const id = newId();
  return {
    documents: [
      {
        id,
        name: "",
        source: dongCiDaCi,
        savedAt: Date.now(),
      },
    ],
    activeId: id,
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

  const serializedSource = useMemo(() => serializeScore(score), [score]);
  const currentSource = textDraft ?? serializedSource;

  // Debounced workspace persistence.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (saveTimer.current !== null) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveWorkspace({
        version: 2,
        documents,
        activeId,
      });
    }, 400);
    return () => {
      if (saveTimer.current !== null) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
    };
  }, [documents, activeId]);

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

  function loadSample(src: string) {
    const result = parseDrumtab(src);
    writeActiveDocSource(serializeScore(result.score));
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
            source: dongCiDaCi,
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
    <div className="mx-auto w-full max-w-[1600px] p-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="text-brand text-xs font-bold tracking-[0.18em] uppercase">
            Drumit
          </p>
          <h1 className="text-ink font-serif text-5xl leading-none tracking-tight">
            Drumtab visualizer
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="inline-flex rounded-full border border-stone-200 bg-white p-1">
            <ModeTab active={mode === "visual"} onClick={() => switchMode("visual")}>
              Visual
            </ModeTab>
            <ModeTab active={mode === "source"} onClick={() => switchMode("source")}>
              Source
            </ModeTab>
          </div>
          <Select
            value=""
            className="rounded-full"
            onChange={(e) => {
              const found = samples.find((s) => s.label === e.target.value);
              if (found) loadSample(found.src);
              e.currentTarget.value = "";
            }}
          >
            <option value="" disabled>
              Load example…
            </option>
            {samples.map((s) => (
              <option key={s.label} value={s.label}>
                {s.label}
              </option>
            ))}
          </Select>
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
                    source: dongCiDaCi,
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

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
        <div className="hidden flex-col gap-3 lg:flex">
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
            onImport={handleImportDoc}
          />
          <HotkeyPanel />
        </div>

      <section className="flex flex-col gap-5">
        <PlaybackBar
          score={score}
          startBar={clampedSelectedBar ?? 0}
          onCursor={(p) =>
            setPlayCursor({ barIndex: p.barIndex, beatIndex: p.beatIndex })
          }
          onStop={() => setPlayCursor(null)}
        />

        <Panel>
          <PanelHeader title="Preview">
            <Button
              variant={showLabels ? "primary" : "secondary"}
              onClick={() => setShowLabels((v) => !v)}
            >
              {showLabels ? "Hide labels" : "Show labels"}
            </Button>
          </PanelHeader>
          <div className="max-h-[58vh] min-h-[320px] overflow-auto bg-stone-100/40 p-4">
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

        <Panel>
          <PanelHeader title={mode === "visual" ? "Bar editor" : "Source"}>
            <Diagnostics diagnostics={diagnostics} />
          </PanelHeader>

          <div className="max-h-[70vh] overflow-auto p-4">
            {mode === "source" ? (
              <textarea
                value={currentSource}
                onChange={(event) => handleSourceChange(event.target.value)}
                spellCheck={false}
                className="block h-[50vh] w-full resize-y rounded-xl bg-stone-900 p-4 font-mono text-sm leading-relaxed text-amber-100 outline-none"
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
        </Panel>
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
        "rounded-full px-4 py-1 text-xs font-bold transition",
        active
          ? "bg-stone-900 text-white"
          : "text-stone-600 hover:bg-stone-100",
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
