import { useEffect, useMemo, useRef, useState } from "react";
import { defaultSample, samples } from "./notation/samples";
import { parseDrumtab } from "./notation/parser";
import { serializeScore } from "./notation/serialize";
import { layoutScore } from "./notation/layout";
import {
  expandScore,
  findExpandedIndexForSourceBar,
  repeatPassForCursor,
} from "./notation/expand";
import { computeExpandedBarStartTime } from "./notation/scheduler";
import { DrumChart } from "./notation/renderer";
import { validateScore } from "./notation/validate";
import { exportScoreToMidi } from "./notation/midiExport";
import {
  cycleBarEnding,
  cycleDots,
  deleteBar,
  deleteBars,
  insertBarIntoSection,
  extractBars,
  insertBarAfter,
  pasteBarsBefore,
  setBarNavigation,
  setBarRepeatPrevious,
  clearBar,
  renameSection,
  insertSectionAfterBar,
  deleteSection,
  locateBar,
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
import { PerformView } from "./components/PerformView";
import {
  PlaybackBar,
  type EngineKind,
  type PlaybackBarHandle,
} from "./components/PlaybackBar";
import type { PlaybackState } from "./playback/controller";
import { useHotkeys } from "./lib/useHotkeys";
import { useMediaQuery } from "./lib/useMediaQuery";
import {
  clearWorkspace,
  loadWorkspace,
  newId,
  saveWorkspace,
  type DocumentRecord,
  type ViewMode,
} from "./lib/storage";
import { DocumentManager } from "./components/DocumentManager";
import { HotkeyPanel } from "./components/HotkeyPanel";
import { HotkeyContextProvider } from "./components/HotkeyContextProvider";
import { HoverClickPopover } from "./components/HoverClickPopover";
import { ExportMenu } from "./components/ExportMenu";
import { AboutModal } from "./components/AboutModal";
import { ThemeToggle, LocaleToggle } from "./components/ThemeLocaleToggles";
import { SavedIndicator } from "./components/SavedIndicator";
import { StaffView } from "./notation/staff/renderer";
import {
  Badge,
  Button,
  DialogProvider,
  Panel,
  PanelHeader,
  ToastProvider,
  ViewFader,
  useDialog,
  useToast,
} from "./components/ui";
import { AnimatePresence, motion } from "motion/react";
import type { Bar, Score } from "./notation/types";
import { cn } from "./lib/utils";
import { useHistory } from "./lib/useHistory";
import { useFlashBars } from "./lib/useFlashBars";
import {
  applyServiceWorkerUpdate,
  UPDATE_READY_EVENT,
} from "./lib/registerServiceWorker";
import { useI18n } from "./i18n/useI18n";

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
  editorCollapsed: boolean;
  viewMode: ViewMode;
} {
  const ws = loadWorkspace();
  if (ws && ws.documents.length) {
    return {
      documents: ws.documents,
      activeId: ws.activeId ?? ws.documents[0].id,
      editorCollapsed: ws.ui?.editorCollapsed ?? true,
      viewMode: ws.ui?.viewMode ?? "drumit",
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
    editorCollapsed: true,
    viewMode: "drumit",
  };
}

export default function App() {
  return (
    <ToastProvider>
      <DialogProvider>
        <AppInner />
      </DialogProvider>
    </ToastProvider>
  );
}

function AppInner() {
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
  // When non-null, forms a contiguous selection with `selectedBar` as
  // anchor and this as the other end — Shift+Arrow grows the range,
  // any plain arrow / click collapses it back to a single bar.
  const [selectionEnd, setSelectionEnd] = useState<number | null>(null);
  /** Normalised [lo, hi] inclusive range of the current selection. */
  const selectionRange = useMemo<[number, number] | null>(() => {
    if (selectedBar === null) return null;
    const end = selectionEnd ?? selectedBar;
    return [Math.min(selectedBar, end), Math.max(selectedBar, end)];
  }, [selectedBar, selectionEnd]);

  // In-memory clipboard used as a fallback when navigator.clipboard
  // isn't available (insecure context / permission denied) or when the
  // user copied from Drumit and the system clipboard was mangled.
  const barClipboardRef = useRef<Bar[] | null>(null);
  const lastBarClickRef = useRef<{ index: number; time: number } | null>(null);
  const [showLabels, setShowLabels] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [docsOpen, setDocsOpen] = useState(false);
  const [editorCollapsed, setEditorCollapsed] = useState(
    () => loadInitialWorkspace().editorCollapsed,
  );
  // Below lg the editor floats over the preview as a card (80% of the
  // short axis), so it never eats into the preview's visible score.
  const isOverlayEditor = !useMediaQuery("(min-width: 1024px)");
  // Within overlay mode, pick which edge the card slides in from.
  const isLandscape = useMediaQuery(
    "(min-aspect-ratio: 1/1) and (max-height: 600px)",
  );
  const [viewMode, setViewMode] = useState<ViewMode>(
    () => loadInitialWorkspace().viewMode,
  );

  const serializedSource = useMemo(() => serializeScore(score), [score]);
  const currentSource = textDraft ?? serializedSource;

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  useEffect(() => {
    if (saveTimer.current !== null) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveWorkspace({
        version: 4,
        documents,
        activeId,
        ui: { editorCollapsed, viewMode },
      });
      setSavedAt(Date.now());
    }, 400);
    return () => {
      if (saveTimer.current !== null) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
    };
  }, [documents, activeId, editorCollapsed, viewMode]);

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
    expandedBarIndex: number;
    time: number;
  } | null>(null);
  const [metronome, setMetronomeMirror] = useState(false);
  const [beatStripState, setBeatStripState] = useState<{
    beatIndex: number;
    beatProgress: number;
    countIn: { beat: number; total: number } | null;
  }>({ beatIndex: -1, beatProgress: 0, countIn: null });
  const [engineKind, setEngineKind] = useState<EngineKind>("synth");
  const [expandedPreview, setExpandedPreview] = useState(false);
  // Selection inside the expanded (linearised) view. Kept separate from
  // `selectedBar` because its indices live in a different space — they
  // point into the unrolled bar sequence, which doesn't map 1:1 back
  // onto source bars used by the editor / bar clipboard.
  const [expandedSelectedBar, setExpandedSelectedBar] = useState<number | null>(
    0,
  );
  const [expandedSelectionEnd, setExpandedSelectionEnd] = useState<
    number | null
  >(null);

  const [chartContainer, setChartContainer] =
    useState<HTMLDivElement | null>(null);

  // Imperative seek handle — PlaybackBar used to seek whenever its
  // `startBar` / `startTimeOverride` props changed, which tangled the
  // Compact/Expand toggle into the transport. Now seeking only happens
  // when the user explicitly selects a bar.
  const playbackRef = useRef<PlaybackBarHandle | null>(null);

  // Perform view state and the play state PlaybackBar pushes back up —
  // PerformView needs to show the right transport icon and doesn't own
  // the controller itself.
  const [performMode, setPerformMode] = useState(false);
  const [playState, setPlayState] = useState<PlaybackState>("idle");

  const lastScrolledBar = useRef<number | null>(null);
  useEffect(() => {
    if (!chartContainer || !playCursor) {
      lastScrolledBar.current = null;
      return;
    }
    // Auto-scroll uses the *view's* bar index: compact view's DOM
    // `data-bar-index` enumerates source bars, whereas expanded view's
    // `data-bar-index` enumerates positions in the unrolled sequence.
    const activeIndex = expandedPreview
      ? playCursor.expandedBarIndex
      : playCursor.barIndex;
    if (activeIndex === lastScrolledBar.current) return;
    lastScrolledBar.current = activeIndex;
    const el = chartContainer.querySelector<SVGGElement>(
      `[data-bar-index="${activeIndex}"]`,
    );
    el?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
  }, [chartContainer, playCursor, expandedPreview]);

  // ---------------------------------------------------------------
  // Bar-level clipboard (Copy / Cut / Paste / Delete on selected bars)
  //
  // Two storage paths:
  //   1. navigator.clipboard.writeText with a `drumit/bars` JSON header
  //      so copies round-trip across tabs and other apps see it as text.
  //   2. An in-memory ref fallback, used whenever the async clipboard
  //      API fails (insecure context, permission denied, old browser).
  // ---------------------------------------------------------------

  const CLIPBOARD_TAG = "drumit/bars:1";

  function encodeBarsForClipboard(bars: Bar[]): string {
    return `${CLIPBOARD_TAG}\n${JSON.stringify(bars)}`;
  }

  function decodeBarsFromClipboard(text: string): Bar[] | null {
    if (!text.startsWith(`${CLIPBOARD_TAG}\n`)) return null;
    try {
      const json = text.slice(CLIPBOARD_TAG.length + 1);
      const parsed = JSON.parse(json) as Bar[];
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  async function writeBarsToClipboard(bars: Bar[]): Promise<void> {
    barClipboardRef.current = bars;
    try {
      await navigator.clipboard?.writeText(encodeBarsForClipboard(bars));
    } catch {
      // In-memory only; system clipboard is unavailable.
    }
  }

  async function readBarsFromClipboard(): Promise<Bar[] | null> {
    try {
      const text = await navigator.clipboard?.readText();
      if (text) {
        const decoded = decodeBarsFromClipboard(text);
        if (decoded) return decoded;
      }
    } catch {
      // fall through
    }
    return barClipboardRef.current;
  }

  function handleCopyBars() {
    if (expandedPreview) return;
    if (!selectionRange) return;
    const bars = extractBars(score, selectionRange[0], selectionRange[1]);
    void writeBarsToClipboard(bars);
    const [lo, hi] = selectionRange;
    const indices: number[] = [];
    for (let i = lo; i <= hi; i += 1) indices.push(i);
    flash(indices, "amber");
  }

  function handleCutBars() {
    if (expandedPreview) return;
    if (!selectionRange) return;
    const bars = extractBars(score, selectionRange[0], selectionRange[1]);
    void writeBarsToClipboard(bars);
    const [lo, hi] = selectionRange;
    applyScoreUpdate((s) => deleteBars(s, lo, hi));
    setSelectionEnd(null);
    setSelectedBar(Math.max(0, lo - 1));
  }

  function handleDeleteBars() {
    if (expandedPreview) return;
    if (!selectionRange) return;
    const [lo, hi] = selectionRange;
    applyScoreUpdate((s) => deleteBars(s, lo, hi));
    setSelectionEnd(null);
    setSelectedBar(Math.max(0, lo - 1));
  }

  function handleInsertIntoSection(sectionIndex: number) {
    applyScoreUpdate((s) => insertBarIntoSection(s, sectionIndex));
    const priorBarCount = score.sections
      .slice(0, sectionIndex)
      .reduce((acc, s) => acc + s.bars.length, 0);
    setSelectedBar(priorBarCount);
    setSelectionEnd(null);
    playbackRef.current?.seekToBar(priorBarCount);
  }

  function handleBarClick(index: number, shiftKey?: boolean) {
    if (shiftKey && selectedBar !== null) {
      setSelectionEnd(index);
    } else {
      setSelectionEnd(null);
      setSelectedBar(index);
      // Plain click = seek. Shift-click extends the selection and
      // shouldn't move the playhead.
      playbackRef.current?.seekToBar(index);

      // Double-click on the same bar expands the editor panel. Keep
      // the threshold generous on touch (iOS registers taps ~200 ms
      // apart as a double-tap).
      const now = Date.now();
      const last = lastBarClickRef.current;
      if (
        last &&
        last.index === index &&
        now - last.time < 350 &&
        editorCollapsed
      ) {
        setEditorCollapsed(false);
      }
      lastBarClickRef.current = { index, time: now };
    }
    // Park focus inside the Preview scope so scoped hotkeys fire.
    chartContainer?.focus();
  }

  function handleExpandedBarClick(index: number, shiftKey?: boolean) {
    if (shiftKey && expandedSelectedBar !== null) {
      setExpandedSelectionEnd(index);
    } else {
      setExpandedSelectionEnd(null);
      setExpandedSelectedBar(index);
      // Map the expanded-sequence index to wall-clock time and seek.
      playbackRef.current?.seekToTime(
        computeExpandedBarStartTime(score, index),
      );
    }
    // No focus park: clipboard hotkeys are a no-op in expanded mode
    // because the bar clipboard operates on source bars.
  }

  async function handlePasteBars() {
    if (expandedPreview) return;
    const bars = await readBarsFromClipboard();
    if (!bars || bars.length === 0) return;
    if (selectedBar === null) return;
    const target = selectionRange ? selectionRange[0] : selectedBar;
    applyScoreUpdate((s) => pasteBarsBefore(s, target, bars));
    setSelectionEnd(null);
    setSelectedBar(target);
    if (bars.length > 1) setSelectionEnd(target + bars.length - 1);
    const indices: number[] = [];
    for (let i = 0; i < bars.length; i += 1) indices.push(target + i);
    flash(indices, "emerald");
  }

  useHotkeys([
    // Bar clipboard. Scoped to the Preview panel so the same shortcuts
    // do something else (copy bar source, clear slot, ...) when the
    // Editor panel has focus.
    { key: "c", meta: true, scope: "preview", description: "Copy bar(s)", handler: handleCopyBars },
    { key: "c", ctrl: true, scope: "preview", description: "Copy bar(s)", handler: handleCopyBars },
    { key: "x", meta: true, scope: "preview", description: "Cut bar(s)", handler: handleCutBars },
    { key: "x", ctrl: true, scope: "preview", description: "Cut bar(s)", handler: handleCutBars },
    {
      key: "v",
      meta: true,
      scope: "preview",
      description: "Paste bars before selection",
      handler: () => void handlePasteBars(),
    },
    {
      key: "v",
      ctrl: true,
      scope: "preview",
      description: "Paste bars before selection",
      handler: () => void handlePasteBars(),
    },
    {
      key: "Backspace",
      scope: "preview",
      description: "Delete selected bar(s)",
      handler: handleDeleteBars,
    },
    {
      key: "Delete",
      scope: "preview",
      description: "Delete selected bar(s)",
      handler: handleDeleteBars,
    },
    // Shift+Arrow extends the selection.
    {
      key: "ArrowLeft",
      meta: true,
      shift: true,
      description: "Extend selection left",
      handler: () => {
        if (selectedBar === null) return;
        setSelectionEnd((e) => {
          const cur = e ?? selectedBar;
          return Math.max(0, cur - 1);
        });
      },
    },
    {
      key: "ArrowRight",
      meta: true,
      shift: true,
      description: "Extend selection right",
      handler: () => {
        if (selectedBar === null) return;
        setSelectionEnd((e) => {
          const cur = e ?? selectedBar;
          return Math.min(totalBars - 1, cur + 1);
        });
      },
    },
    {
      key: "ArrowLeft",
      meta: true,
      description: "Previous bar",
      handler: () => {
        setSelectionEnd(null);
        setSelectedBar((i) => (i === null ? 0 : Math.max(0, i - 1)));
      },
    },
    {
      key: "ArrowRight",
      meta: true,
      description: "Next bar",
      handler: () => {
        setSelectionEnd(null);
        setSelectedBar((i) =>
          i === null ? 0 : Math.min(totalBars - 1, i + 1),
        );
      },
    },
    {
      key: "ArrowLeft",
      ctrl: true,
      description: "Previous bar",
      handler: () => {
        setSelectionEnd(null);
        setSelectedBar((i) => (i === null ? 0 : Math.max(0, i - 1)));
      },
    },
    {
      key: "ArrowRight",
      ctrl: true,
      description: "Next bar",
      handler: () => {
        setSelectionEnd(null);
        setSelectedBar((i) =>
          i === null ? 0 : Math.min(totalBars - 1, i + 1),
        );
      },
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

  const displayScore = useMemo(
    () => (expandedPreview ? expandScore(score) : score),
    [score, expandedPreview],
  );

  // playCursor carries both source and expanded indices. Renderers expect
  // `{ barIndex, beatIndex }` — hand each view the flavour that matches
  // its own DOM coordinate system (source bars in compact, unrolled
  // bars in expand).
  const viewPlayCursor = useMemo(() => {
    if (!playCursor) return null;
    return expandedPreview
      ? { barIndex: playCursor.expandedBarIndex, beatIndex: playCursor.beatIndex }
      : { barIndex: playCursor.barIndex, beatIndex: playCursor.beatIndex };
  }, [playCursor, expandedPreview]);

  // Which pass of a repeated bar is currently sounding — only useful in
  // compact view (where a source bar can occupy a single on-screen slot
  // yet play multiple times). Expanded view shows every pass on its own.
  const viewRepeatPass = useMemo(() => {
    if (expandedPreview || !playCursor) return null;
    return repeatPassForCursor(
      score,
      playCursor.barIndex,
      playCursor.expandedBarIndex,
    );
  }, [expandedPreview, playCursor, score]);

  const layout = useMemo(
    () =>
      layoutScore(displayScore, {
        showLabels,
        expanded: false,
        width: 980,
      }),
    [displayScore, showLabels],
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

  const selectedSectionInfo = useMemo(() => {
    if (clampedSelectedBar === null) return null;
    const loc = locateBar(score, clampedSelectedBar);
    if (!loc) return null;
    return {
      sectionIndex: loc.sectionIndex,
      label: score.sections[loc.sectionIndex].label,
      isFirstBarOfSection: loc.barIndex === 0,
    };
  }, [score, clampedSelectedBar]);

  // Per-document undo/redo history. Keyed by document id so switching
  // between docs preserves each doc's timeline independently.
  const history = useHistory();
  const { flashes, flash } = useFlashBars();
  const dialog = useDialog();
  const toast = useToast();
  const { t } = useI18n();
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

  useEffect(() => {
    const onReady = () => {
      toast.toast({
        message: t("toast.update_ready"),
        tone: "info",
        duration: 0,
        action: {
          label: t("toast.update_refresh"),
          onClick: () => {
            void applyServiceWorkerUpdate();
          },
        },
      });
    };
    window.addEventListener(UPDATE_READY_EVENT, onReady);
    return () => window.removeEventListener(UPDATE_READY_EVENT, onReady);
  }, [toast, t]);

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
      source: `title: ${t("editor.new_chart_title")}\ntempo: 100\nmeter: 4/4\n\n[A]\n| bd: o / o / o / o |`,
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
      name: src.name ? `${src.name} ${t("editor.copy_suffix")}` : "",
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
    const titleFromSource =
      src.source.match(/^\s*title:\s*(.+)$/m)?.[1].trim() ?? "";
    const displayName =
      src.name || titleFromSource || t("editor.untitled");
    toast.toast({
      message: t("toast.document_duplicated", { name: displayName }),
      tone: "info",
    });
  }

  function handleRenameDoc(id: string, name: string) {
    setDocuments((docs) =>
      docs.map((d) => (d.id === id ? { ...d, name } : d)),
    );
  }

  function handleDeleteDoc(id: string) {
    const snapshotIdx = documents.findIndex((d) => d.id === id);
    const snapshotDoc = documents[snapshotIdx];
    const snapshotActive = activeId;
    if (!snapshotDoc) return;

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
      const fallback = documents[Math.max(0, snapshotIdx - 1)];
      if (fallback && fallback.id !== id) setActiveId(fallback.id);
    }

    const titleFromSource =
      snapshotDoc.source.match(/^\s*title:\s*(.+)$/m)?.[1].trim() ?? "";
    const displayName =
      snapshotDoc.name || titleFromSource || t("editor.untitled");
    toast.toast({
      message: t("toast.document_deleted", { name: displayName }),
      tone: "info",
      duration: 6000,
      action: {
        label: t("toast.undo"),
        onClick: () => {
          setDocuments((docs) => {
            if (docs.some((d) => d.id === snapshotDoc.id)) return docs;
            const clamped = Math.min(snapshotIdx, docs.length);
            return [
              ...docs.slice(0, clamped),
              snapshotDoc,
              ...docs.slice(clamped),
            ];
          });
          if (snapshotActive === id) setActiveId(id);
        },
      },
    });
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
    toast.toast({
      message: t("toast.exported", { file: filename }),
      tone: "success",
    });
  }

  function handleExportDocMidi(id: string) {
    const doc = documents.find((d) => d.id === id);
    if (!doc) return;
    const parsedDoc = parseDrumtab(doc.source);
    if (parsedDoc.score.sections.length === 0) {
      void dialog.alert({
        title: t("export.empty_title"),
        message: t("export.empty_message"),
      });
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
    toast.toast({
      message: t("toast.exported", { file: filename }),
      tone: "success",
    });
  }

  function handleImportDoc(source: string) {
    const parsedImport = parseDrumtab(source);
    if (parsedImport.score.sections.length === 0) {
      void dialog.alert({
        title: t("import.failed_title"),
        message: t("import.failed_message"),
        tone: "danger",
      });
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
    const importedTitle =
      parsedImport.score.title ||
      source.match(/^\s*title:\s*(.+)$/m)?.[1].trim() ||
      t("editor.untitled");
    toast.toast({
      message: t("toast.imported", { name: importedTitle }),
      tone: "success",
    });
  }

  return (
    <HotkeyContextProvider>
    <div className="flex h-dvh w-full flex-col overflow-hidden bg-stone-50">
      <header
        className="flex flex-none flex-wrap items-center justify-between gap-2 border-b border-stone-200 bg-white px-3 py-2 lg:gap-3 lg:px-5"
        style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top))" }}
      >
        <div className="flex items-center gap-2 lg:gap-3">
          <button
            type="button"
            onClick={() => setDocsOpen(true)}
            aria-label={t("header.open_docs")}
            title={t("header.docs")}
            className="motion-press flex size-8 items-center justify-center rounded-md text-stone-600 transition-colors hover:bg-stone-100 hover:text-stone-900"
          >
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              className="size-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 7.5a2 2 0 0 1 2-2h3.5l2 2H19a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7.5Z" />
            </svg>
          </button>
          <p className="text-brand text-[11px] font-bold tracking-[0.18em] uppercase">
            Drumit
          </p>
          <h1 className="text-ink hidden font-serif text-base leading-none font-semibold tracking-tight sm:block">
            {t("header.tagline")}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="https://github.com/W-Mai/Drumit"
            target="_blank"
            rel="noreferrer noopener"
            title={t("header.github")}
            aria-label={t("header.github")}
            className="motion-press hidden size-7 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-600 transition-colors hover:bg-stone-50 hover:text-stone-900 sm:flex"
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
            title={t("header.blog")}
            aria-label={t("header.blog_short")}
            className="motion-press hidden h-7 items-center justify-center rounded-full border border-stone-200 bg-white px-2.5 text-[11px] font-semibold text-stone-600 transition-colors hover:bg-stone-50 hover:text-stone-900 sm:flex"
          >
            benign.host
          </a>
          {/* key forces a remount so "just now" state resets without setState-in-effect */}
          <SavedIndicator key={savedAt ?? 0} savedAt={savedAt} />
          <LocaleToggle />
          <ThemeToggle />
          <button
            type="button"
            onClick={() => setAboutOpen(true)}
            title={t("header.about")}
            aria-label={t("header.about")}
            className="motion-press flex size-7 items-center justify-center rounded-full border border-stone-200 bg-white text-sm font-semibold text-stone-600 transition-colors hover:bg-stone-50 hover:text-stone-900"
          >
            i
          </button>
        </div>
      </header>
      <AboutModal
        open={aboutOpen}
        onClose={() => setAboutOpen(false)}
        onResetWorkspace={async () => {
          const ok = await dialog.confirm({
            title: t("header.reset_confirm_title"),
            message: t("header.reset_confirm_message"),
            confirmLabel: t("header.reset_confirm_label"),
            tone: "danger",
          });
          if (!ok) return;
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
          setAboutOpen(false);
          toast.toast({
            message: t("toast.workspace_reset"),
            tone: "warning",
          });
        }}
      />

      <DocumentManager
        open={docsOpen}
        onClose={() => setDocsOpen(false)}
        documents={documents.map((d) => ({
          id: d.id,
          name: d.name,
          source: d.source,
        }))}
        activeId={activeId}
        onSelect={handleSelectDoc}
        onCreate={() => {
          handleCreateDoc();
          setDocsOpen(false);
        }}
        onDuplicate={handleDuplicateDoc}
        onRename={handleRenameDoc}
        onDelete={handleDeleteDoc}
        onExport={handleExportDoc}
        onExportMidi={handleExportDocMidi}
        onImport={(src) => {
          handleImportDoc(src);
          setDocsOpen(false);
        }}
        samples={samples.map(({ id, label }) => ({ id, label }))}
        onLoadSample={(id) => {
          handleLoadSample(id);
          setDocsOpen(false);
        }}
      />

      <div className="mx-auto flex min-h-0 w-full max-w-[1400px] flex-1 flex-col p-2 sm:p-3">
      <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 pb-[calc(3rem+max(0.5rem,env(safe-area-inset-bottom)))] lg:pb-0">
        <PlaybackBar
          ref={playbackRef}
          score={score}
          startBar={clampedSelectedBar ?? 0}
          onCursor={(p) =>
            setPlayCursor({
              barIndex: p.barIndex,
              beatIndex: p.beatIndex,
              expandedBarIndex: p.expandedBarIndex,
              time: p.time,
            })
          }
          onStop={() => setPlayCursor(null)}
          onEngineChange={setEngineKind}
          onStateChange={setPlayState}
          onMetronomeChange={setMetronomeMirror}
          onBeatStripChange={setBeatStripState}
        />

        <Panel className="flex min-h-0 flex-[55_55_0%] flex-col">
          <PanelHeader
            title={
              <span className="flex items-center gap-2">
                <span>{t("editor.preview")}</span>
                <ViewModeToggle value={viewMode} onChange={setViewMode} />
              </span>
            }
          >
            <Button
              variant="secondary"
              onClick={() => setPerformMode(true)}
              title={t("editor.perform_tip")}
            >
              <span className="sm:hidden">🎭</span>
              <span className="hidden whitespace-nowrap sm:inline">
                {t("editor.perform")}
              </span>
            </Button>
            <Button
              variant={expandedPreview ? "primary" : "secondary"}
              onClick={() => {
                setExpandedPreview((v) => {
                  const next = !v;
                  if (next && clampedSelectedBar !== null) {
                    // Seed the expanded selection at the first occurrence
                    // of the currently-selected source bar, so the user's
                    // place in the score doesn't jump when toggling.
                    const seeded = findExpandedIndexForSourceBar(
                      score,
                      clampedSelectedBar,
                    );
                    setExpandedSelectedBar(seeded);
                    setExpandedSelectionEnd(null);
                  }
                  return next;
                });
              }}
              title={
                expandedPreview ? t("editor.compact_tip") : t("editor.expand_tip")
              }
            >
              <span className="sm:hidden">{expandedPreview ? "⇉" : "⇆"}</span>
              <span className="hidden whitespace-nowrap sm:inline">
                {expandedPreview ? t("editor.compact") : t("editor.expand")}
              </span>
            </Button>
            <Button
              variant={showLabels ? "primary" : "secondary"}
              onClick={() => setShowLabels((v) => !v)}
              title={
                showLabels ? t("preview.hide_labels") : t("preview.show_labels")
              }
            >
              <span className="sm:hidden">{showLabels ? "🏷" : "🏷︎"}</span>
              <span className="hidden whitespace-nowrap sm:inline">
                {showLabels
                  ? t("editor.hide_labels_short")
                  : t("editor.show_labels_short")}
              </span>
            </Button>
            <ExportMenu
              score={score}
              getSvgElement={() =>
                chartContainer?.querySelector("svg") ?? null
              }
              viewLabel={viewMode === "staff" ? "staff" : undefined}
            />
          </PanelHeader>
          <div
            ref={setChartContainer}
            data-drumit-scope="preview"
            tabIndex={0}
            className="mobile-safe-scroll-x min-h-0 flex-1 overflow-auto bg-stone-100/40 p-2 outline-none sm:p-4"
          >
            {hasErrors ? (
              <div className="grid min-h-[280px] place-items-center text-sm text-stone-500">
                {t("editor.fix_errors")}
              </div>
            ) : (
              <ViewFader
                activeKey={`${viewMode}-${expandedPreview ? "exp" : "cmp"}`}
              >
                {viewMode === "staff" ? (
                  <StaffView
                    score={displayScore}
                    selectedBarIndex={
                      expandedPreview ? expandedSelectedBar : clampedSelectedBar
                    }
                    selectionEnd={
                      expandedPreview ? expandedSelectionEnd : selectionEnd
                    }
                    onSelectBar={
                      expandedPreview ? handleExpandedBarClick : handleBarClick
                    }
                    playCursor={viewPlayCursor}
                    playheadEngine={engineKind}
                    repeatPass={viewRepeatPass}
                    ariaLabel={t("chart.aria_staff")}
                  />
                ) : (
                  <DrumChart
                    layout={layout}
                    showLabels={showLabels}
                    selectedBarIndex={
                      expandedPreview ? expandedSelectedBar : clampedSelectedBar
                    }
                    selectionEnd={
                      expandedPreview ? expandedSelectionEnd : selectionEnd
                    }
                    onSelectBar={
                      expandedPreview ? handleExpandedBarClick : handleBarClick
                    }
                    onInsertIntoSection={
                      expandedPreview ? undefined : handleInsertIntoSection
                    }
                    emptySectionLabel={t("chart.add_bar")}
                    playCursor={viewPlayCursor}
                    playheadEngine={engineKind}
                    repeatPass={viewRepeatPass}
                    flashes={expandedPreview ? undefined : flashes}
                    ariaLabel={t("chart.aria_drum")}
                  />
                )}
              </ViewFader>
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
          title={
            editorCollapsed ? t("editor.show_editor") : t("editor.hide_editor")
          }
          aria-label={
            editorCollapsed ? t("editor.show_editor") : t("editor.hide_editor")
          }
          className="group -my-0.5 hidden h-2.5 flex-none items-center justify-center hover:bg-stone-200/70 lg:flex"
        >
          <span className="h-[2px] w-16 rounded-full bg-stone-200 group-hover:bg-stone-400" />
        </button>
        {/* Overlay-mode backdrop: clicking it collapses the editor.
            Only rendered below lg when the editor is expanded. */}
        {isOverlayEditor && !editorCollapsed ? (
          <motion.button
            type="button"
            aria-label={t("editor.hide_editor")}
            onClick={() => setEditorCollapsed(true)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-30 bg-black/10 lg:hidden"
          />
        ) : null}
        {/* Edge handle — mobile-only entry point when editor is
            collapsed. Sits above MobilePlaybackBar in portrait, on
            the right edge in landscape. */}
        {isOverlayEditor && editorCollapsed ? (
          <button
            type="button"
            onClick={() => setEditorCollapsed(false)}
            aria-label={t("editor.show_editor")}
            className={cn(
              "fixed z-30 flex items-center justify-center rounded-full border border-stone-200 bg-white text-stone-700 shadow-xl shadow-stone-900/10 hover:bg-stone-50 lg:hidden",
              isLandscape
                ? "top-1/2 right-2 h-16 w-9 -translate-y-1/2"
                : "bottom-[calc(3.25rem+max(0.5rem,env(safe-area-inset-bottom)))] left-1/2 h-9 w-28 -translate-x-1/2",
            )}
          >
            <span className="flex items-center gap-1.5 text-xs font-extrabold tracking-wide">
              <span className="text-[10px]">{isLandscape ? "◂" : "▴"}</span>
              <span>
                {mode === "visual"
                  ? t("editor.bar_editor")
                  : t("editor.source")}
              </span>
            </span>
          </button>
        ) : null}
        <motion.div
          // Slide animation only on mount/unmount in overlay mode.
          // Keying by mode makes AnimatePresence swap variants cleanly.
          key={isOverlayEditor ? "overlay" : "inline"}
          initial={
            isOverlayEditor && !editorCollapsed
              ? isLandscape
                ? { x: "100%", opacity: 0 }
                : { y: "100%", opacity: 0 }
              : false
          }
          animate={
            isOverlayEditor && !editorCollapsed
              ? { x: 0, y: 0, opacity: 1 }
              : {}
          }
          transition={{ type: "spring", stiffness: 320, damping: 32 }}
          className={cn(
            "min-h-0 flex-col",
            !isOverlayEditor &&
              (editorCollapsed ? "flex flex-none" : "flex flex-[45_45_0%]"),
            isOverlayEditor && editorCollapsed && "hidden",
            isOverlayEditor &&
              !editorCollapsed &&
              cn(
                "fixed z-40 flex drop-shadow-2xl",
                isLandscape
                  ? "top-2 right-2 bottom-2 w-[80vw] max-w-[640px]"
                  : "inset-x-2 bottom-[calc(3rem+max(0.5rem,env(safe-area-inset-bottom)))] h-[80vh]",
              ),
          )}
        >
          <Panel className="flex min-h-0 flex-1 flex-col">
          <PanelHeader
            onTitleClick={() => setEditorCollapsed((v) => !v)}
            titleClickLabel={
              editorCollapsed
                ? t("editor.show_editor")
                : t("editor.hide_editor")
            }
            titleExpanded={!editorCollapsed}
            title={
              <>
                <span className="flex size-5 items-center justify-center text-stone-500">
                  <span className="text-[10px] leading-none">
                    {editorCollapsed ? "▸" : "▾"}
                  </span>
                </span>
                <span>
                  {mode === "visual"
                    ? t("editor.bar_editor")
                    : t("editor.source")}
                </span>
                {editorCollapsed ? (
                  <span className="text-[10px] font-medium text-stone-500">
                    {t("editor.readonly_tag")}
                  </span>
                ) : null}
              </>
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
                {t("editor.visual_mode")}
              </ModeTab>
              <ModeTab
                active={mode === "source"}
                onClick={() => {
                  switchMode("source");
                  if (editorCollapsed) setEditorCollapsed(false);
                }}
              >
                {t("editor.source_mode")}
              </ModeTab>
            </div>
            <Diagnostics diagnostics={diagnostics} />
            <HoverClickPopover
              placement="bottom"
              className="max-w-[min(780px,calc(100vw-24px))]"
              trigger={({ open }) => (
                <span
                  aria-expanded={open}
                  title={t("hotkeys.title")}
                  className={cn(
                    "flex size-7 items-center justify-center rounded-full border text-sm font-bold select-none",
                    open
                      ? "border-amber-400 bg-amber-100 text-stone-900 dark:bg-amber-500/30 dark:text-amber-50"
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

          <AnimatePresence initial={false}>
          {editorCollapsed ? null : (
          <motion.div
            key="editor-body"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
            className="min-h-0 flex-1 overflow-auto p-4"
          >
            {mode === "source" ? (
              <textarea
                value={currentSource}
                onChange={(event) => handleSourceChange(event.target.value)}
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                autoComplete="off"
                /* ≥16px base keeps iOS Safari from zooming on focus;
                   sm: compacts down once we're past the mobile breakpoint.
                   Use a literal #1c1917 so the \"code surface\" look
                   stays dark-on-amber in both themes — bg-stone-900
                   would flip to near-white under our dark override. */
                className="block h-full min-h-[200px] w-full resize-none rounded-xl bg-[#1c1917] p-4 font-mono text-base leading-relaxed text-amber-100 caret-amber-400 outline-none ring-1 ring-stone-800 transition-shadow focus:ring-2 focus:ring-amber-400/40 sm:text-sm"
              />
            ) : expandedPreview ? (
              <div className="grid min-h-[280px] place-items-center p-6 text-center text-sm text-stone-500">
                <div>
                  <p>{t("panel.preview_readonly")}</p>
                  <p className="mt-1 text-xs text-stone-400">
                    {t("editor.switch_to_compact")}
                  </p>
                </div>
              </div>
            ) : selectedBarData && clampedSelectedBar !== null ? (
              <PadEditor
                bar={selectedBarData}
                barIndex={clampedSelectedBar}
                totalBars={totalBars}
                beatsPerBar={score.meter.beats}
                sectionLabel={selectedSectionInfo?.label ?? ""}
                isFirstBarOfSection={
                  selectedSectionInfo?.isFirstBarOfSection ?? false
                }
                onRenameSection={(label) =>
                  applyScoreUpdate((s) =>
                    selectedSectionInfo
                      ? renameSection(s, selectedSectionInfo.sectionIndex, label)
                      : s,
                  )
                }
                onInsertSectionAfter={(label) => {
                  applyScoreUpdate((s) =>
                    insertSectionAfterBar(s, clampedSelectedBar, label),
                  );
                  // Move the cursor onto the first bar of the new section
                  // so the user can start editing it immediately.
                  setSelectedBar((i) => (i === null ? null : i + 1));
                }}
                onDeleteSection={() =>
                  applyScoreUpdate((s) =>
                    selectedSectionInfo
                      ? deleteSection(s, selectedSectionInfo.sectionIndex)
                      : s,
                  )
                }
                onSetRepeat={(hint) =>
                  applyScoreUpdate((s) =>
                    setBarRepeatPrevious(s, clampedSelectedBar, hint),
                  )
                }
                onClearBar={() =>
                  applyScoreUpdate((s) => clearBar(s, clampedSelectedBar))
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
                onSetNavigation={(nav) =>
                  applyScoreUpdate((s) =>
                    setBarNavigation(s, clampedSelectedBar, nav),
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
                onCycleDots={(bi, inst, si) =>
                  applyScoreUpdate((s) =>
                    cycleDots(s, clampedSelectedBar, bi, inst, si),
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
                {t("editor.click_bar_to_edit")}
              </div>
            )}
          </motion.div>
          )}
          </AnimatePresence>
          </Panel>
        </motion.div>
      </section>
      </div>
      <AnimatePresence>
        {performMode ? (
          <PerformView
            key="perform"
            score={score}
            cursor={playCursor}
            viewMode={viewMode}
            engineKind={engineKind}
            isPlaying={playState === "playing"}
            metronome={metronome}
            beatStripState={beatStripState}
            onSeekTime={(s) => playbackRef.current?.seekToTime(s)}
            onTogglePlay={() => playbackRef.current?.togglePlay()}
            onToggleMetronome={() =>
              playbackRef.current?.toggleMetronome()
            }
            onExit={() => setPerformMode(false)}
          />
        ) : null}
      </AnimatePresence>
    </div>
    </HotkeyContextProvider>
  );
}

function ViewModeToggle({
  value,
  onChange,
}: {
  value: ViewMode;
  onChange: (v: ViewMode) => void;
}) {
  return (
    <span className="inline-flex rounded-full border border-stone-200 bg-stone-50 p-0.5">
      <ModeTab active={value === "drumit"} onClick={() => onChange("drumit")}>
        Drumit
      </ModeTab>
      <ModeTab active={value === "staff"} onClick={() => onChange("staff")}>
        Staff
      </ModeTab>
    </span>
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
        "motion-press rounded-full px-2.5 py-0.5 text-[11px] font-bold transition-[background-color,color,box-shadow] duration-150 ease-out",
        active
          ? "bg-stone-900 text-stone-50 shadow-sm"
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
  const state =
    errors === 0 && warnings === 0
      ? "ok"
      : errors > 0
        ? "error"
        : "warn";
  const title = diagnostics
    .map((d) => `${d.level}@${d.line}: ${d.message}`)
    .join("\n");
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.span
        key={state}
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        transition={{ duration: 0.14 }}
      >
        {state === "ok" ? (
          <Badge tone="success">OK</Badge>
        ) : (
          <Badge tone={state === "error" ? "danger" : "warning"} title={title}>
            {errors > 0 ? `${errors} error${errors > 1 ? "s" : ""}` : ""}
            {errors > 0 && warnings > 0 ? " · " : ""}
            {warnings > 0 ? `${warnings} warn` : ""}
          </Badge>
        )}
      </motion.span>
    </AnimatePresence>
  );
}
