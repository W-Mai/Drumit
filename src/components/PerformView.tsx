import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Score } from "../notation/types";
import type { EngineKind } from "./PlaybackBar";
import { DrumChart } from "../notation/renderer";
import { StaffView } from "../notation/staff/renderer";
import { layoutScore } from "../notation/layout";
import {
  expandScore,
  findExpandedIndicesForSourceBar,
  sliceExpandedForPerform,
} from "../notation/expand";
import { computeExpandedBarStartTime } from "../notation/scheduler";

type ViewMode = "drumit" | "staff";

export interface PerformViewProps {
  score: Score;
  /** Null while idle. Source barIndex + expandedBarIndex as reported by the controller. */
  cursor: {
    barIndex: number;
    beatIndex: number;
    expandedBarIndex: number;
  } | null;
  /** Inherits the main view's Drumit vs. Staff choice; not togglable here. */
  viewMode: ViewMode;
  engineKind: EngineKind;
  isPlaying: boolean;
  onSeekTime(seconds: number): void;
  onTogglePlay(): void;
  onExit(): void;
}

/**
 * Fullscreen rehearsal view. Renders a windowed single-row chart of
 * the expanded (unrolled) score plus a scrolling chip strip timeline.
 * Entry and exit are handled by the parent via `performMode` state;
 * this component just fills the viewport and exposes callbacks.
 */
export function PerformView({
  score,
  cursor,
  viewMode,
  engineKind,
  isPlaying,
  onSeekTime,
  onTogglePlay,
  onExit,
}: PerformViewProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);

  // Request fullscreen + orientation lock on mount. Both may be refused
  // (iOS Safari ignores orientation.lock) — we swallow all errors.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    // Fullscreen entry: vendor-prefixed fallback for WebKit.
    type Fs = {
      requestFullscreen?: () => Promise<void>;
      webkitRequestFullscreen?: () => Promise<void>;
    };
    const target = el as unknown as Fs;
    try {
      const p = target.requestFullscreen?.() ?? target.webkitRequestFullscreen?.();
      if (p && typeof (p as Promise<void>).catch === "function") {
        (p as Promise<void>).catch(() => {});
      }
    } catch {
      // ignore
    }
    type LockableOrientation = {
      lock?: (dir: "landscape") => Promise<void>;
      unlock?: () => void;
    };
    const orientation = (screen as unknown as { orientation?: LockableOrientation })
      .orientation;
    try {
      const p = orientation?.lock?.("landscape");
      if (p && typeof p.catch === "function") p.catch(() => {});
    } catch {
      // ignore
    }
    return () => {
      try {
        void document.exitFullscreen?.().catch(() => {});
      } catch {
        // ignore
      }
      try {
        orientation?.unlock?.();
      } catch {
        // ignore
      }
    };
  }, []);

  // If the browser drops out of fullscreen for any reason (Esc key,
  // swipe gesture, another element taking over), bounce back to the
  // normal app.
  useEffect(() => {
    const handler = () => {
      if (!document.fullscreenElement) onExit();
    };
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, [onExit]);

  // Expanded score memoisation — same object as long as `score` is stable.
  const expanded = useMemo(() => expandScore(score), [score]);
  const expandedBars = useMemo(
    () => expanded.sections.flatMap((s) => s.bars),
    [expanded],
  );
  const totalExpandedBars = expandedBars.length;

  // Effective focused bar. In normal playback this tracks the cursor.
  // When the user taps a chip we override to that index; the override
  // clears as soon as the cursor catches up (seek should make them
  // match within one tick, so normally one render).
  const [userFocus, setUserFocus] = useState<number | null>(null);
  const focusedExpandedBar =
    userFocus !== null
      ? userFocus
      : cursor
        ? cursor.expandedBarIndex
        : 0;
  // When cursor reaches the user's target, drop the override on next
  // render. Runs inside render body so no effect is needed; safe
  // because clearing is idempotent.
  if (
    userFocus !== null &&
    cursor &&
    cursor.expandedBarIndex === userFocus
  ) {
    // setState from render body is the escape hatch React explicitly
    // endorses for "derived state" reconciliation.
    setUserFocus(null);
  }

  // Observe the stage width to choose the window size and layout.
  const [stageWidth, setStageWidth] = useState(0);
  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setStageWidth(entry.contentRect.width);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const windowSize = stageWidth === 0 ? 4 : chooseWindowSize(stageWidth);

  const { windowed, windowOffset } = useMemo(() => {
    const { score: w, offset } = sliceExpandedForPerform(
      expanded,
      focusedExpandedBar,
      windowSize,
    );
    return { windowed: w, windowOffset: offset };
  }, [expanded, focusedExpandedBar, windowSize]);

  const windowedLayout = useMemo(
    () =>
      layoutScore(windowed, {
        width: Math.max(400, stageWidth || 900),
        showLabels: false,
        expanded: false,
      }),
    [windowed, stageWidth],
  );

  // Project the global cursor into the window's local coord space, but
  // only when the cursor actually falls inside the visible window.
  const localPlayCursor = useMemo(() => {
    if (!cursor) return null;
    const localIdx = cursor.expandedBarIndex - windowOffset;
    if (localIdx < 0 || localIdx >= windowSize) return null;
    return { barIndex: localIdx, beatIndex: cursor.beatIndex };
  }, [cursor, windowOffset, windowSize]);

  const handleSeekExpanded = useCallback(
    (expandedIdx: number) => {
      setUserFocus(expandedIdx);
      onSeekTime(computeExpandedBarStartTime(score, expandedIdx));
    },
    [score, onSeekTime],
  );

  // Current-bar readout for the top bar.
  const readout = `Bar ${focusedExpandedBar + 1} / ${totalExpandedBars}`;

  return (
    <div
      ref={rootRef}
      className="fixed inset-0 z-[9999] flex flex-col bg-stone-950 text-stone-100"
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingLeft: "env(safe-area-inset-left)",
        paddingRight: "env(safe-area-inset-right)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      {/* Top bar: exit, readout, play/pause */}
      <div className="flex items-center gap-3 px-3 py-2">
        <button
          type="button"
          onClick={onExit}
          className="grid h-10 w-10 place-items-center rounded-full bg-stone-800 text-lg font-bold hover:bg-stone-700"
          aria-label="Exit perform view"
          title="Exit (Esc)"
        >
          ✕
        </button>
        <div className="flex-1 text-center text-sm tabular-nums text-stone-300">
          {readout}
        </div>
        <button
          type="button"
          onClick={onTogglePlay}
          className="grid h-10 min-w-10 place-items-center rounded-full bg-amber-400 px-4 font-bold text-stone-950 hover:bg-amber-300"
          aria-label={isPlaying ? "Pause" : "Play"}
          title={isPlaying ? "Pause (Space)" : "Play (Space)"}
        >
          {isPlaying ? "❚❚" : "▶"}
        </button>
      </div>

      {/* Stage: windowed chart */}
      <div
        ref={stageRef}
        className="flex min-h-0 flex-1 items-center justify-center px-2"
      >
        {stageWidth > 0 ? (
          viewMode === "staff" ? (
            <StaffView
              score={windowed}
              width={Math.max(400, stageWidth)}
              playCursor={localPlayCursor}
              playheadEngine={engineKind}
            />
          ) : (
            <DrumChart
              layout={windowedLayout}
              showLabels={false}
              playCursor={localPlayCursor}
              playheadEngine={engineKind}
            />
          )
        ) : null}
      </div>

      {/* Chip strip */}
      <ChipStrip
        score={score}
        expandedBars={expandedBars}
        focusedExpandedBar={focusedExpandedBar}
        onSeekExpanded={handleSeekExpanded}
      />
    </div>
  );
}

function chooseWindowSize(width: number): number {
  if (width < 600) return 3;
  if (width < 900) return 4;
  if (width < 1200) return 5;
  return 6;
}

// ──────────────────────────────────────────────────────────────────────
// ChipStrip
// ──────────────────────────────────────────────────────────────────────

interface ChipStripProps {
  score: Score;
  expandedBars: Score["sections"][number]["bars"];
  focusedExpandedBar: number;
  onSeekExpanded(expandedIdx: number): void;
}

function ChipStrip({
  score,
  expandedBars,
  focusedExpandedBar,
  onSeekExpanded,
}: ChipStripProps) {
  const stripRef = useRef<HTMLDivElement | null>(null);
  const chipRefs = useRef<Array<HTMLButtonElement | null>>([]);

  // Build per-expanded-bar metadata once per score change.
  const chips = useMemo(() => buildChipMeta(score), [score]);

  // Scroll the focused chip into view. Slight debounce via rAF so a
  // burst of cursor ticks doesn't trigger back-to-back smooth scrolls.
  const scrollFrameRef = useRef<number | null>(null);
  useEffect(() => {
    if (scrollFrameRef.current !== null) {
      cancelAnimationFrame(scrollFrameRef.current);
    }
    scrollFrameRef.current = requestAnimationFrame(() => {
      const el = chipRefs.current[focusedExpandedBar];
      el?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
    });
    return () => {
      if (scrollFrameRef.current !== null) {
        cancelAnimationFrame(scrollFrameRef.current);
      }
    };
  }, [focusedExpandedBar]);

  return (
    <div
      ref={stripRef}
      className="flex gap-1 overflow-x-auto px-3 py-2"
      style={{
        scrollSnapType: "x proximity",
        scrollbarWidth: "none",
      }}
      data-testid="chip-strip"
    >
      {chips.map((chip, idx) => (
        <BarChip
          key={idx}
          ref={(el) => {
            chipRefs.current[idx] = el;
          }}
          chip={chip}
          active={idx === focusedExpandedBar}
          onSeek={() => onSeekExpanded(idx)}
          onPickPass={(passExpandedIdx) => onSeekExpanded(passExpandedIdx)}
        />
      ))}
      {/* Silence unused-var lint on expandedBars: it's in closure via chips. */}
      <span className="hidden">{expandedBars.length}</span>
    </div>
  );
}

interface ChipMeta {
  /** Expanded-bar index this chip represents. */
  expandedIndex: number;
  /** Source bar this chip plays. */
  sourceIndex: number;
  /** 1-based pass among all occurrences of sourceIndex. */
  pass: number;
  /** Total passes for this source bar. */
  total: number;
  /** If this is the first expanded bar of a source section, that label. */
  sectionLabel?: string;
  /** All expanded indices this source bar plays at (for PassPopover). */
  allPasses: number[];
}

function buildChipMeta(score: Score): ChipMeta[] {
  const result: ChipMeta[] = [];
  // Index each source bar's sectionLabel, and remember where in the source
  // flat-bar sequence each section starts (so we can mark the *first*
  // expanded appearance of that section with its label).
  const sourceBarToSection: Array<{ sectionLabel: string; firstOfSection: boolean }> = [];
  for (const section of score.sections) {
    section.bars.forEach((_, idx) => {
      sourceBarToSection.push({
        sectionLabel: section.label,
        firstOfSection: idx === 0,
      });
    });
  }

  const expanded = expandScore(score);
  const expandedBars = expanded.sections.flatMap((s) => s.bars);
  const seenSections = new Set<string>();
  for (let expandedIdx = 0; expandedIdx < expandedBars.length; expandedIdx += 1) {
    // Find which source bar this expanded bar resolves to — use the
    // helper in reverse by iterating sourceBar → expanded indices once.
    // For small scores this is fast enough.
  }

  // Build source→expanded-indices map once.
  const allIndicesByBar = new Map<number, number[]>();
  const totalSourceBars = score.sections.reduce(
    (n, s) => n + s.bars.length,
    0,
  );
  for (let sourceIdx = 0; sourceIdx < totalSourceBars; sourceIdx += 1) {
    allIndicesByBar.set(
      sourceIdx,
      findExpandedIndicesForSourceBar(score, sourceIdx),
    );
  }

  // Invert: expandedIdx → sourceIdx.
  const expandedToSource = new Array<number>(expandedBars.length);
  for (const [sourceIdx, indices] of allIndicesByBar) {
    indices.forEach((ei) => {
      expandedToSource[ei] = sourceIdx;
    });
  }

  for (let expandedIdx = 0; expandedIdx < expandedBars.length; expandedIdx += 1) {
    const sourceIdx = expandedToSource[expandedIdx];
    const allPasses = allIndicesByBar.get(sourceIdx) ?? [expandedIdx];
    const pass = allPasses.indexOf(expandedIdx) + 1 || 1;
    const secInfo = sourceBarToSection[sourceIdx];
    let sectionLabel: string | undefined;
    if (secInfo?.firstOfSection && secInfo.sectionLabel) {
      // Tag only the *first* expanded appearance of a section with the
      // section label so the strip still visually groups passes.
      if (!seenSections.has(secInfo.sectionLabel)) {
        sectionLabel = secInfo.sectionLabel;
        seenSections.add(secInfo.sectionLabel);
      }
    }
    result.push({
      expandedIndex: expandedIdx,
      sourceIndex: sourceIdx,
      pass,
      total: allPasses.length,
      sectionLabel,
      allPasses,
    });
  }
  return result;
}

// ──────────────────────────────────────────────────────────────────────
// BarChip + PassPopover
// ──────────────────────────────────────────────────────────────────────

interface BarChipProps {
  chip: ChipMeta;
  active: boolean;
  onSeek(): void;
  onPickPass(passExpandedIdx: number): void;
}

const BarChip = forwardRef<HTMLButtonElement, BarChipProps>(function BarChip(
  { chip, active, onSeek, onPickPass },
  ref,
) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const hasMultiplePasses = chip.total > 1;
  const popoverId = useId();

  return (
    <div className="relative shrink-0" style={{ scrollSnapAlign: "center" }}>
      {chip.sectionLabel ? (
        <div className="absolute -top-1 left-1 rounded bg-amber-500 px-1.5 py-0.5 text-[9px] font-bold text-stone-950">
          {chip.sectionLabel}
        </div>
      ) : null}
      <button
        ref={ref}
        type="button"
        onClick={onSeek}
        aria-label={`Bar ${chip.expandedIndex + 1}${hasMultiplePasses ? ` pass ${chip.pass} of ${chip.total}` : ""}`}
        className={`flex h-11 min-w-14 flex-col items-center justify-center rounded-lg px-2 text-xs font-semibold tabular-nums transition ${
          active
            ? "bg-amber-400 text-stone-950"
            : "bg-stone-800 text-stone-200 hover:bg-stone-700"
        }`}
        data-testid="bar-chip"
        data-active={active || undefined}
        data-expanded-index={chip.expandedIndex}
      >
        <span>{chip.expandedIndex + 1}</span>
        {hasMultiplePasses ? (
          <span className="text-[9px] leading-none opacity-80">
            ×{chip.pass}/{chip.total}
          </span>
        ) : null}
      </button>
      {hasMultiplePasses ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setPopoverOpen((v) => !v);
          }}
          aria-label={`Pick pass for bar ${chip.expandedIndex + 1}`}
          aria-expanded={popoverOpen}
          aria-controls={popoverId}
          className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-stone-700 text-[10px] font-bold hover:bg-stone-600"
          data-testid="bar-chip-passes"
        >
          ▾
        </button>
      ) : null}
      {popoverOpen && hasMultiplePasses ? (
        <div
          id={popoverId}
          role="menu"
          data-testid="bar-chip-popover"
          className="absolute bottom-full left-1/2 z-[1] mb-2 flex -translate-x-1/2 gap-1 rounded-lg bg-stone-800 p-1.5 shadow-lg"
        >
          {chip.allPasses.map((passExpandedIdx, i) => (
            <button
              key={passExpandedIdx}
              type="button"
              role="menuitem"
              onClick={() => {
                setPopoverOpen(false);
                onPickPass(passExpandedIdx);
              }}
              className={`grid h-8 w-8 place-items-center rounded text-xs font-bold tabular-nums ${
                passExpandedIdx === chip.expandedIndex
                  ? "bg-amber-400 text-stone-950"
                  : "bg-stone-700 text-stone-200 hover:bg-stone-600"
              }`}
            >
              {i + 1}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
});
