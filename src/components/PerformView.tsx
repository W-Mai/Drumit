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
import { layoutScore } from "../notation/layout";
import {
  expandScore,
  findExpandedIndicesForSourceBar,
} from "../notation/expand";
import { computeExpandedBarStartTime } from "../notation/scheduler";

type ViewMode = "drumit" | "staff";

export interface PerformViewProps {
  score: Score;
  /**
   * Null while idle. Source barIndex + expandedBarIndex + absolute
   * wall-clock time, as reported by the controller's cursor ticker.
   */
  cursor: {
    barIndex: number;
    beatIndex: number;
    expandedBarIndex: number;
    time: number;
  } | null;
  /** Inherits the main view's Drumit vs. Staff choice (Staff TBD). */
  viewMode: ViewMode;
  engineKind: EngineKind;
  isPlaying: boolean;
  onSeekTime(seconds: number): void;
  onTogglePlay(): void;
  onExit(): void;
}

/**
 * Fullscreen rehearsal view.
 *
 * Layout (top → bottom):
 *   ┌──────────────────────────────────────────────────────────┐
 *   │ top bar: exit, readout, play/pause                       │
 *   │ mini-map: full-timeline strip, click to seek             │
 *   │ ┌───────────────── stage ──────────────────────────────┐ │
 *   │ │   ░░ scrolling score ░░│   (reticle at left third)   │ │
 *   │ └───────────────────────────────────────────────────────┘ │
 *   └──────────────────────────────────────────────────────────┘
 *
 * The stage is a horizontally-scrolling SVG of the **entire expanded
 * score laid out in one row**. A vertical reticle sits at the left
 * ~1/3 of the stage; the score translates leftward so the beat that's
 * currently playing lines up with the reticle. Playback therefore
 * feels like a teleprompter rather than a page-turn.
 */
export function PerformView({
  score,
  cursor,
  viewMode: _viewMode,
  engineKind,
  isPlaying,
  onSeekTime,
  onTogglePlay,
  onExit,
}: PerformViewProps) {
  // Staff teleprompter view is not wired up yet — Drumit only for now.
  // Keep the prop in the type so App can pass it without fuss.
  void _viewMode;

  const rootRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);

  useFullscreenLifecycle(rootRef, onExit);

  // Expanded score + full single-row layout (very wide SVG).
  const expanded = useMemo(() => expandScore(score), [score]);
  const expandedBars = useMemo(
    () => expanded.sections.flatMap((s) => s.bars),
    [expanded],
  );
  const totalExpandedBars = expandedBars.length;

  // Force layoutScore into a single row by giving it a width big enough
  // to fit every bar. The exact bar width is controlled by the bar's
  // own min-width (≈ 196 px for 4/4 + 24 gap). We add margin to be safe.
  const fullScoreWidth = useMemo(
    () => estimateFullScoreWidth(expanded),
    [expanded],
  );
  const fullLayout = useMemo(
    () =>
      layoutScore(expanded, {
        width: fullScoreWidth,
        showLabels: false,
        expanded: false,
      }),
    [expanded, fullScoreWidth],
  );

  // Observe the stage's on-screen width so we can centre / left-third
  // the playhead in the *visible* area.
  const [stageWidth, setStageWidth] = useState(0);
  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    setStageWidth(el.clientWidth);
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) setStageWidth(entry.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Reticle sits at 1/3 from the left edge of the stage — "read ahead"
  // like a book rather than dead-centre.
  const reticleX = stageWidth / 3;

  // Compute the scroll offset that places the current beat's x under
  // the reticle. Falls back to the first bar when there's no cursor.
  const playheadX = useMemo(
    () => computePlayheadX(fullLayout, expanded, cursor),
    [fullLayout, expanded, cursor],
  );
  const scrollX = Math.max(0, playheadX - reticleX);

  const handleStageClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      // Translate click → absolute SVG x → beat → time → seek.
      const host = stageRef.current;
      if (!host) return;
      const rect = host.getBoundingClientRect();
      const xWithinStage = e.clientX - rect.left;
      const targetSvgX = xWithinStage + scrollX;
      const time = xToTime(fullLayout, expanded, targetSvgX);
      if (time !== null) onSeekTime(time);
    },
    [fullLayout, expanded, scrollX, onSeekTime],
  );

  const handleSeekExpanded = useCallback(
    (expandedIdx: number) => {
      onSeekTime(computeExpandedBarStartTime(score, expandedIdx));
    },
    [score, onSeekTime],
  );

  const focusedExpandedBar = cursor?.expandedBarIndex ?? 0;
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
      {/* Top bar */}
      <div className="flex shrink-0 items-center gap-3 px-3 py-2">
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

      {/* Mini-map */}
      <MiniMap
        score={score}
        fullScoreWidth={fullScoreWidth}
        playheadX={playheadX}
        stageWidth={stageWidth}
        scrollX={scrollX}
        focusedExpandedBar={focusedExpandedBar}
        onSeekExpanded={handleSeekExpanded}
      />

      {/* Scrolling stage */}
      <div
        ref={stageRef}
        className="relative min-h-0 flex-1 overflow-hidden bg-stone-900"
        onClick={handleStageClick}
        role="region"
        aria-label="Perform stage"
        data-testid="perform-stage"
      >
        {stageWidth > 0 ? (
          <div
            className="will-change-transform"
            style={{
              transform: `translateX(${-scrollX}px)`,
              transition: isPlaying
                ? "transform 120ms linear"
                : "transform 280ms ease-out",
              width: fullLayout.width,
            }}
          >
            <DrumChart
              layout={fullLayout}
              showLabels={false}
              playCursor={
                cursor
                  ? { barIndex: cursor.expandedBarIndex, beatIndex: cursor.beatIndex }
                  : null
              }
              playheadEngine={engineKind}
            />
          </div>
        ) : null}

        {/* Vertical reticle */}
        {stageWidth > 0 ? (
          <div
            className="pointer-events-none absolute top-0 bottom-0 w-px bg-amber-400/70"
            style={{ left: reticleX }}
            data-testid="perform-reticle"
          >
            <div
              className="absolute left-1/2 -translate-x-1/2 -translate-y-1 rounded bg-amber-400 px-1 py-0.5 text-[9px] font-bold text-stone-950"
              style={{ top: 0 }}
            >
              ▾
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The expanded score may be 30-100 bars long; `layoutScore` lays them
 * in a single row if we give it enough width. The bar's own
 * min-width is ~ `MIN_BEAT_WIDTH * beats + 20 + BAR_GAP_X`. We err
 * generous so bars don't end up shorter than natural.
 */
function estimateFullScoreWidth(expanded: Score): number {
  const beats = expanded.meter.beats;
  // MIN_BEAT_WIDTH = 44, BAR_GAP_X = 24 → keep consistent with layout.ts
  const barMinWidth = 44 * beats + 20;
  const perBar = barMinWidth + 24;
  const total = expanded.sections.reduce(
    (n, s) => n + s.bars.length,
    0,
  );
  // 32 covers the left/right margins layoutScore adds.
  return Math.max(400, total * perBar + 32);
}

/**
 * Return the absolute SVG x-coordinate of the current playhead
 * (interpolated inside the beat by wall-clock time). Falls back to
 * the start of the first bar when the cursor is null.
 */
function computePlayheadX(
  layout: ReturnType<typeof layoutScore>,
  expanded: Score,
  cursor: PerformViewProps["cursor"],
): number {
  const flatBars = layout.rows.flat();
  if (flatBars.length === 0) return 0;
  const defaultX = flatBars[0].beats[0]?.x ?? 0;
  if (!cursor) return defaultX + (flatBars[0].x ?? 0);
  const bar = flatBars[cursor.expandedBarIndex];
  if (!bar) return defaultX + (flatBars[0].x ?? 0);

  // x of the current beat's left edge (SVG absolute).
  const beat = bar.beats[Math.max(0, Math.min(bar.beats.length - 1, cursor.beatIndex))];
  if (!beat) return bar.x;
  // Fractional offset inside the beat via wall-clock time. Inline meter
  // per bar is not handled here — score-level tempo/meter is accurate
  // for ~all current scores. Can be tightened when it matters.
  const bpm = expanded.tempo?.bpm || 100;
  const secondsPerBeat = 60 / bpm;
  const barStartTime = computeExpandedBarStartTime(expanded, cursor.expandedBarIndex);
  const beatStartTime = barStartTime + cursor.beatIndex * secondsPerBeat;
  const fraction = Math.max(
    0,
    Math.min(1, (cursor.time - beatStartTime) / secondsPerBeat),
  );
  return bar.x + beat.x + beat.width * fraction;
}

/**
 * Invert: given an absolute SVG x-coordinate inside the full layout,
 * find the wall-clock time it represents. Used when the user taps
 * the stage to seek.
 */
function xToTime(
  layout: ReturnType<typeof layoutScore>,
  expanded: Score,
  x: number,
): number | null {
  const flatBars = layout.rows.flat();
  if (flatBars.length === 0) return null;
  // Find the bar whose span contains x.
  let target = flatBars[flatBars.length - 1];
  for (const b of flatBars) {
    if (x < b.x + b.width) {
      target = b;
      break;
    }
  }
  const expandedIdx = target.index - 1;
  const beats = target.beats;
  // Locate which beat box x lives in.
  let beatIdx = 0;
  for (let i = 0; i < beats.length; i += 1) {
    const leftEdge = target.x + beats[i].x;
    if (x >= leftEdge) beatIdx = i;
  }
  const beat = beats[beatIdx];
  const localX = x - (target.x + beat.x);
  const fraction = Math.max(0, Math.min(1, localX / Math.max(1, beat.width)));
  const bpm = expanded.tempo?.bpm || 100;
  const secondsPerBeat = 60 / bpm;
  const barStart = computeExpandedBarStartTime(expanded, expandedIdx);
  return barStart + beatIdx * secondsPerBeat + fraction * secondsPerBeat;
}

/* ─────────────────────────────────────────────────────────────────────
 * Fullscreen lifecycle hook — extracted for readability; swallows API
 * rejection on browsers that don't support orientation.lock / etc.
 * ───────────────────────────────────────────────────────────────────── */

function useFullscreenLifecycle(
  rootRef: React.RefObject<HTMLDivElement | null>,
  onExit: () => void,
): void {
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
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
  }, [rootRef]);

  useEffect(() => {
    const handler = () => {
      if (!document.fullscreenElement) onExit();
    };
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, [onExit]);
}

/* ─────────────────────────────────────────────────────────────────────
 * MiniMap
 *
 * Compressed top strip of the entire timeline. Shows:
 *   - one chip per expanded bar, narrow but tappable
 *   - section labels on the first chip of each section
 *   - ×pass/total on chips with repeats
 *   - a viewport rectangle indicating the portion currently on stage
 *   - a ▾ pass-picker next to chips that play more than once
 * ───────────────────────────────────────────────────────────────────── */

interface MiniMapProps {
  score: Score;
  fullScoreWidth: number;
  playheadX: number;
  stageWidth: number;
  scrollX: number;
  focusedExpandedBar: number;
  onSeekExpanded(expandedIdx: number): void;
}

function MiniMap({
  score,
  fullScoreWidth,
  playheadX,
  stageWidth,
  scrollX,
  focusedExpandedBar,
  onSeekExpanded,
}: MiniMapProps) {
  const chips = useMemo(() => buildChipMeta(score), [score]);
  const chipRefs = useRef<Array<HTMLButtonElement | null>>([]);

  // Auto-scroll the focused chip into view within the mini-map.
  useEffect(() => {
    const el = chipRefs.current[focusedExpandedBar];
    el?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [focusedExpandedBar]);

  // Viewport rect within the mini-map is proportional to what's visible
  // on the stage. This is a visual hint; the strip itself owns its own
  // scrolling independent of the stage.
  const viewportFraction =
    fullScoreWidth > 0 ? Math.min(1, stageWidth / fullScoreWidth) : 0;
  const viewportLeftFraction =
    fullScoreWidth > 0 ? scrollX / fullScoreWidth : 0;

  return (
    <div className="shrink-0 border-b border-stone-800 bg-stone-900/80">
      {/* Global progress bar */}
      <div
        className="relative h-1.5 bg-stone-800"
        data-testid="perform-minimap-progress"
      >
        <div
          className="absolute top-0 bottom-0 bg-amber-400/20"
          style={{
            left: `${viewportLeftFraction * 100}%`,
            width: `${viewportFraction * 100}%`,
          }}
        />
        <div
          className="absolute top-0 bottom-0 w-px bg-amber-400"
          style={{
            left: `${fullScoreWidth > 0 ? (playheadX / fullScoreWidth) * 100 : 0}%`,
          }}
        />
      </div>

      {/* Chip row */}
      <div
        className="flex gap-1 overflow-x-auto px-3 py-1.5"
        style={{ scrollbarWidth: "none" }}
        data-testid="perform-minimap-strip"
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
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────
 * Chip meta builder (unchanged from before)
 * ───────────────────────────────────────────────────────────────────── */

interface ChipMeta {
  expandedIndex: number;
  sourceIndex: number;
  pass: number;
  total: number;
  sectionLabel?: string;
  allPasses: number[];
}

function buildChipMeta(score: Score): ChipMeta[] {
  const result: ChipMeta[] = [];
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

/* ─────────────────────────────────────────────────────────────────────
 * BarChip + PassPopover (shrunk for the mini-map)
 * ───────────────────────────────────────────────────────────────────── */

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
    <div className="relative shrink-0">
      {chip.sectionLabel ? (
        <div className="absolute -top-1 left-0.5 rounded bg-amber-500 px-1 py-px text-[8px] font-bold leading-none text-stone-950">
          {chip.sectionLabel}
        </div>
      ) : null}
      <button
        ref={ref}
        type="button"
        onClick={onSeek}
        aria-label={`Bar ${chip.expandedIndex + 1}${hasMultiplePasses ? ` pass ${chip.pass} of ${chip.total}` : ""}`}
        className={`flex h-8 min-w-9 flex-col items-center justify-center rounded px-1 text-[10px] font-semibold leading-none tabular-nums transition ${
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
          <span className="text-[8px] leading-none opacity-80">
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
          className="absolute -right-0.5 -top-0.5 grid h-4 w-4 place-items-center rounded-full bg-stone-700 text-[9px] font-bold hover:bg-stone-600"
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
          className="absolute top-full left-1/2 z-[1] mt-1 flex -translate-x-1/2 gap-0.5 rounded-lg bg-stone-800 p-1 shadow-lg"
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
              className={`grid h-6 w-6 place-items-center rounded text-[10px] font-bold tabular-nums ${
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
