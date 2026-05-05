import { useEffect, useMemo, useState } from "react";
import { serializeBar } from "../notation/serialize";
import { cn } from "../lib/utils";
import {
  canonicalAlias,
  instrumentLabels,
} from "../notation/instruments";
import type {
  Articulation,
  Bar,
  Hit,
  Instrument,
  LaneBeat,
  NavigationMarker,
  RepeatHint,
} from "../notation/types";
import { AnimatePresence, motion } from "motion/react";
import { FloatingMenu } from "./FloatingMenu";
import { InstrumentIcon } from "./InstrumentIcon";
import { Button, Chip, ChipGroup, useDialog } from "./ui";
import { useHotkeys, type Hotkey } from "../lib/useHotkeys";
import { useMediaQuery } from "../lib/useMediaQuery";
import { useSwipeLane } from "../lib/useSwipeLane";
import { useI18n } from "../i18n/useI18n";
import {
  DIGIT_BY_INSTRUMENT,
  INSTRUMENT_BY_DIGIT,
} from "../notation/hotkeyMap";
import { rowGroupFor } from "../notation/layout";
import { useHotkeyContext } from "./hotkeyContext";

/* ------------------------------------------------------------------ */
/* Props                                                               */
/* ------------------------------------------------------------------ */

interface Props {
  bar: Bar;
  barIndex: number; // global
  totalBars: number;
  beatsPerBar: number;
  /** Label of the section that owns this bar. */
  sectionLabel: string;
  /** True iff this bar is the first bar of its section (so the Section
   *  strip can surface the label prominently). */
  isFirstBarOfSection: boolean;
  onRenameSection: (label: string) => void;
  onInsertSectionAfter: (label: string) => void;
  onDeleteSection: () => void;
  onSetRepeat: (hint: RepeatHint | null) => void;
  onClearBar: () => void;
  onToggleRepeatStart: () => void;
  onToggleRepeatEnd: () => void;
  onCycleEnding: () => void;
  onSetNavigation: (nav: NavigationMarker | null) => void;
  onInsertAfter: () => void;
  onDelete: () => void;
  onSetDivision: (
    beatIndex: number,
    instrument: Instrument,
    division: number,
  ) => void;
  onSetGroupDivision: (
    beatIndex: number,
    instrument: Instrument,
    groupIndex: number,
    division: number,
  ) => void;
  onSplitBeat: (
    beatIndex: number,
    instrument: Instrument,
    count: number,
  ) => void;
  onToggleSlot: (
    beatIndex: number,
    instrument: Instrument,
    slotIndex: number,
    groupIndex?: number,
  ) => void;
  onSetSlotRest: (
    beatIndex: number,
    instrument: Instrument,
    slotIndex: number,
    groupIndex?: number,
  ) => void;
  onToggleArticulation: (
    beatIndex: number,
    instrument: Instrument,
    slotIndex: number,
    articulation: Articulation,
    groupIndex?: number,
  ) => void;
  /** Called when cursor crosses past the end of this bar. */
  onNextBar?: () => void;
  /** Navigate to the previous bar while preserving the cursor lane. */
  onPrevBar?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onSetSticking: (
    beatIndex: number,
    instrument: Instrument,
    slotIndex: number,
    sticking: "R" | "L" | null,
    groupIndex?: number,
  ) => void;
  onCycleDots: (
    beatIndex: number,
    instrument: Instrument,
    slotIndex: number,
  ) => void;
}

/* ------------------------------------------------------------------ */
/* Config                                                              */
/* ------------------------------------------------------------------ */

const ALL_INSTRUMENTS: Instrument[] = [
  "hihatClosed",
  "hihatOpen",
  "hihatHalfOpen",
  "hihatFoot",
  "ride",
  "rideBell",
  "crashLeft",
  "crashRight",
  "tomHigh",
  "tomMid",
  "floorTom",
  "snare",
  "kick",
];

type Resolution = {
  kind: "binary" | "triplet";
  slotsPerBeat: number;
  label: string;
  /** Shorter label used when the header has to fit on a phone. */
  shortLabel?: string;
};

const RESOLUTIONS: Resolution[] = [
  { kind: "binary", slotsPerBeat: 1, label: "1/4" },
  { kind: "binary", slotsPerBeat: 2, label: "1/8" },
  { kind: "binary", slotsPerBeat: 4, label: "1/16" },
  { kind: "binary", slotsPerBeat: 8, label: "1/32" },
  { kind: "triplet", slotsPerBeat: 3, label: "Triplet", shortLabel: "3×" },
  { kind: "triplet", slotsPerBeat: 6, label: "Sextuplet", shortLabel: "6×" },
];

const DEFAULT_RESOLUTION: Resolution = RESOLUTIONS[2]; // 1/16

/* ------------------------------------------------------------------ */
/* Column model                                                        */
/* ------------------------------------------------------------------ */

/**
 * Every instrument row in a bar gets its own column plan: one array per
 * beat. The plan says how to translate a click on a visual cell back into
 * `(slotIndex, groupIndex?)` on the lane.
 *
 * When the lane has no `groups` for this beat we use the bar-level
 * resolution (unless the user has manually set a larger `lane.division` —
 * we respect whichever is finer).
 *
 * When the lane has `groups` for this beat we show those groups as-is and
 * ignore the bar-level resolution.
 */
type CellPlan =
  | {
      kind: "beat-slot";
      slotIndex: number;
      slotsPerBeat: number;
      /** True if the displayed grid is driven by the lane's division rather
       *  than the bar-level resolution (i.e. the user customized this lane). */
      custom: boolean;
      /** Relative width units within the beat (all beat-slot share equal value). */
      widthUnits: number;
    }
  | {
      kind: "group-slot";
      groupIndex: number;
      slotIndex: number;
      slotsInGroup: number;
      /** Relative width units within the beat = group.ratio / group.division. */
      widthUnits: number;
    };

interface LaneBeatPlan {
  beatIndex: number;
  /** Whether this lane's column layout follows the bar-level resolution. */
  usesBarResolution: boolean;
  /** Whether this lane is split into multiple groups for this beat. */
  split: boolean;
  columns: CellPlan[];
}

function planLaneBeat(
  lane: LaneBeat | undefined,
  beatIndex: number,
  barResolution: Resolution,
): LaneBeatPlan {
  if (lane?.groups && lane.groups.length > 1) {
    // Dot-expanded lanes — every sub-group is a single slot driven by
    // a slot's own dots. Detect via any slot carrying `dots`; a user
    // split into equal-ratio single-slot groups has no dots and must
    // take the regular `split: true` branch below.
    const allSingle = lane.groups.every(
      (g) => g.division === 1 && g.slots.length === 1,
    );
    const anyDotted =
      allSingle &&
      lane.groups.some((g) => (g.slots[0]?.dots ?? 0) > 0);
    if (allSingle && anyDotted) {
      const columns: CellPlan[] = lane.groups.map((g, idx) => ({
        kind: "beat-slot",
        slotIndex: idx,
        slotsPerBeat: lane.groups!.length,
        custom: true,
        widthUnits: g.ratio,
      }));
      return {
        beatIndex,
        usesBarResolution: false,
        split: false,
        columns,
      };
    }
    const columns: CellPlan[] = [];
    lane.groups.forEach((g, groupIndex) => {
      const widthUnits = g.ratio / Math.max(1, g.division);
      for (let slotIndex = 0; slotIndex < g.division; slotIndex += 1) {
        columns.push({
          kind: "group-slot",
          groupIndex,
          slotIndex,
          slotsInGroup: g.division,
          widthUnits,
        });
      }
    });
    return {
      beatIndex,
      usesBarResolution: false,
      split: true,
      columns,
    };
  }

  // Un-split lane: its own division wins whenever it differs from the
  // bar grid — hits are not required. An all-rest lane that the user
  // explicitly sliced as /6 should render as /6 immediately.
  const laneDiv = lane?.division ?? barResolution.slotsPerBeat;
  const slotsPerBeat = Math.max(1, laneDiv);
  const custom = slotsPerBeat !== barResolution.slotsPerBeat;

  const widthUnits = 1 / Math.max(1, slotsPerBeat);
  const columns: CellPlan[] = Array.from({ length: slotsPerBeat }, (_, i) => ({
    kind: "beat-slot",
    slotIndex: i,
    slotsPerBeat,
    custom,
    widthUnits,
  }));
  return {
    beatIndex,
    usesBarResolution: !custom,
    split: false,
    columns,
  };
}

/* ------------------------------------------------------------------ */
/* Public component                                                    */
/* ------------------------------------------------------------------ */

export function PadEditor({
  bar,
  barIndex,
  totalBars,
  beatsPerBar,
  sectionLabel,
  isFirstBarOfSection,
  onRenameSection,
  onInsertSectionAfter,
  onDeleteSection,
  onSetRepeat,
  onClearBar,
  onToggleRepeatStart,
  onToggleRepeatEnd,
  onCycleEnding,
  onSetNavigation,
  onInsertAfter,
  onDelete,
  onSetDivision,
  onSetGroupDivision,
  onSplitBeat,
  onToggleSlot,
  onSetSlotRest,
  onToggleArticulation,
  onSetSticking,
  onCycleDots,
  onNextBar,
  onPrevBar,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
}: Props) {
  const { t } = useI18n();
  // sm breakpoint — matches Tailwind's `sm:` everywhere else in the app.
  const isDesktop = useMediaQuery("(min-width: 640px)");
  const isOverlay = !useMediaQuery("(min-width: 1024px)");
  const [barResolution, setBarResolution] = useState<Resolution>(
    () => inferBarResolution(bar) ?? DEFAULT_RESOLUTION,
  );

  const [extraInstruments, setExtraInstruments] = useState<Instrument[]>([]);

  const serialized = useMemo(() => serializeBar(bar), [bar]);

  const presentInstruments = useMemo(() => {
    const seen = new Set<Instrument>();
    bar.beats.forEach((b) =>
      b.lanes.forEach((l) => seen.add(l.instrument)),
    );
    extraInstruments.forEach((i) => seen.add(i));
    return ALL_INSTRUMENTS.filter((i) => seen.has(i));
  }, [bar, extraInstruments]);

  // Edit cursor state.
  const [cursor, setCursor] = useState<{
    beatIndex: number;
    slotIndex: number;
    laneIdx: number;
  }>({ beatIndex: 0, slotIndex: 0, laneIdx: 0 });
  const { setCurrentInstrument, setAutoAdvance: ctxSetAutoAdvance } =
    useHotkeyContext();
  const [autoAdvance, setAutoAdvance] = useState(true);

  // Keep cursor in valid range when bar/beat/presentInstruments change.
  const clampedCursor = useMemo(() => {
    const beatIndex = Math.min(cursor.beatIndex, Math.max(0, beatsPerBar - 1));
    const plan = planLaneBeat(
      bar.beats[beatIndex]?.lanes.find(
        (l) => l.instrument === presentInstruments[cursor.laneIdx],
      ),
      beatIndex,
      barResolution,
    );
    const slotCount = Math.max(1, plan.columns.length);
    const slotIndex = Math.min(cursor.slotIndex, slotCount - 1);
    const laneIdx = Math.min(
      cursor.laneIdx,
      Math.max(0, presentInstruments.length - 1),
    );
    return { beatIndex, slotIndex, laneIdx };
  }, [cursor, beatsPerBar, bar, presentInstruments, barResolution]);

  const currentInstrument = presentInstruments[clampedCursor.laneIdx];

  // Publish current cursor state to the hotkey context so the sidebar
  // HotkeyPanel can highlight the active instrument and auto-advance state.
  useEffect(() => {
    setCurrentInstrument(currentInstrument ?? null);
  }, [currentInstrument, setCurrentInstrument]);
  useEffect(() => {
    ctxSetAutoAdvance(autoAdvance);
  }, [autoAdvance, ctxSetAutoAdvance]);

  // --- Keyboard navigation helpers ---
  function moveCursor(dx: number, dy: number) {
    setCursor((c) => {
      let { beatIndex, slotIndex, laneIdx } = c;
      if (dy !== 0) {
        laneIdx = Math.max(
          0,
          Math.min(presentInstruments.length - 1, laneIdx + dy),
        );
      }
      if (dx !== 0) {
        const lane = bar.beats[beatIndex]?.lanes.find(
          (l) => l.instrument === presentInstruments[laneIdx],
        );
        const plan = planLaneBeat(lane, beatIndex, barResolution);
        const slotCount = plan.columns.length;
        slotIndex += dx;
        while (slotIndex >= slotCount && beatIndex < beatsPerBar - 1) {
          slotIndex -= slotCount;
          beatIndex += 1;
        }
        while (slotIndex < 0 && beatIndex > 0) {
          beatIndex -= 1;
          const prevLane = bar.beats[beatIndex]?.lanes.find(
            (l) => l.instrument === presentInstruments[laneIdx],
          );
          const prevPlan = planLaneBeat(prevLane, beatIndex, barResolution);
          slotIndex += prevPlan.columns.length;
        }
        // Cross-bar: past last slot of last beat → next bar; before 0 of beat 0 → prev bar.
        if (slotIndex >= slotCount && beatIndex === beatsPerBar - 1) {
          if (onNextBar) {
            onNextBar();
            return { beatIndex: 0, slotIndex: 0, laneIdx };
          }
        }
        if (slotIndex < 0 && beatIndex === 0) {
          if (onPrevBar) {
            onPrevBar();
            return { beatIndex: 0, slotIndex: 0, laneIdx };
          }
        }
        slotIndex = Math.max(0, Math.min(slotCount - 1, slotIndex));
      }
      return { beatIndex, slotIndex, laneIdx };
    });
  }

  function advanceCursor() {
    if (!autoAdvance) return;
    moveCursor(1, 0);
  }

  // Toggle hit at cursor + advance.
  function toggleAtCursor(instrument?: Instrument) {
    const inst = instrument ?? currentInstrument;
    if (!inst) return;
    // Make sure the instrument is in presentInstruments so its row is shown.
    if (!presentInstruments.includes(inst)) {
      setExtraInstruments((prev) => (prev.includes(inst) ? prev : [...prev, inst]));
    }
    const laneBeat = bar.beats[clampedCursor.beatIndex]?.lanes.find(
      (l) => l.instrument === inst,
    );
    const plan = planLaneBeat(laneBeat, clampedCursor.beatIndex, barResolution);
    const col = plan.columns[clampedCursor.slotIndex];
    if (!col) return;
    if (col.kind === "beat-slot") {
      // Ensure lane.division matches display resolution.
      if (
        !laneBeat ||
        laneBeat.groups ||
        laneBeat.division !== col.slotsPerBeat
      ) {
        onSetDivision(clampedCursor.beatIndex, inst, col.slotsPerBeat);
      }
      onToggleSlot(clampedCursor.beatIndex, inst, col.slotIndex);
    } else {
      onToggleSlot(
        clampedCursor.beatIndex,
        inst,
        col.slotIndex,
        col.groupIndex,
      );
    }
    advanceCursor();
  }

  function restAtCursor() {
    const inst = currentInstrument;
    if (!inst) return;
    const laneBeat = bar.beats[clampedCursor.beatIndex]?.lanes.find(
      (l) => l.instrument === inst,
    );
    const plan = planLaneBeat(laneBeat, clampedCursor.beatIndex, barResolution);
    const col = plan.columns[clampedCursor.slotIndex];
    if (!col) return;
    if (col.kind === "beat-slot") {
      if (
        !laneBeat ||
        laneBeat.groups ||
        laneBeat.division !== col.slotsPerBeat
      ) {
        onSetDivision(clampedCursor.beatIndex, inst, col.slotsPerBeat);
      }
      onSetSlotRest(clampedCursor.beatIndex, inst, col.slotIndex);
    } else {
      onSetSlotRest(
        clampedCursor.beatIndex,
        inst,
        col.slotIndex,
        col.groupIndex,
      );
    }
    advanceCursor();
  }

  function clearCursorSlot() {
    // Clear every lane at this slot (by setting the slot empty).
    for (const inst of presentInstruments) {
      const laneBeat = bar.beats[clampedCursor.beatIndex]?.lanes.find(
        (l) => l.instrument === inst,
      );
      if (!laneBeat) continue;
      const plan = planLaneBeat(laneBeat, clampedCursor.beatIndex, barResolution);
      const col = plan.columns[clampedCursor.slotIndex];
      if (!col) continue;
      if (col.kind === "beat-slot") {
        const hit = laneBeat.slots[col.slotIndex];
        if (hit) onToggleSlot(clampedCursor.beatIndex, inst, col.slotIndex);
      } else {
        const hit = laneBeat.groups?.[col.groupIndex]?.slots[col.slotIndex];
        if (hit)
          onToggleSlot(
            clampedCursor.beatIndex,
            inst,
            col.slotIndex,
            col.groupIndex,
          );
      }
    }
    moveCursor(-1, 0);
  }

  function applyModifierAtCursor(
    instrument: Instrument,
    articulation: Articulation,
  ) {
    const laneBeat = bar.beats[clampedCursor.beatIndex]?.lanes.find(
      (l) => l.instrument === instrument,
    );
    if (!laneBeat) return;
    const plan = planLaneBeat(laneBeat, clampedCursor.beatIndex, barResolution);
    const col = plan.columns[clampedCursor.slotIndex];
    if (!col) return;
    const slotAddress =
      col.kind === "beat-slot"
        ? { slotIndex: col.slotIndex, groupIndex: undefined }
        : { slotIndex: col.slotIndex, groupIndex: col.groupIndex };
    onToggleArticulation(
      clampedCursor.beatIndex,
      instrument,
      slotAddress.slotIndex,
      articulation,
      slotAddress.groupIndex,
    );
  }

  function setStickingAtCursor(instrument: Instrument, s: "R" | "L" | null) {
    const laneBeat = bar.beats[clampedCursor.beatIndex]?.lanes.find(
      (l) => l.instrument === instrument,
    );
    if (!laneBeat) return;
    const plan = planLaneBeat(laneBeat, clampedCursor.beatIndex, barResolution);
    const col = plan.columns[clampedCursor.slotIndex];
    if (!col) return;
    const slotAddress =
      col.kind === "beat-slot"
        ? { slotIndex: col.slotIndex, groupIndex: undefined }
        : { slotIndex: col.slotIndex, groupIndex: col.groupIndex };
    onSetSticking(
      clampedCursor.beatIndex,
      instrument,
      slotAddress.slotIndex,
      s,
      slotAddress.groupIndex,
    );
  }

  function cycleDotsAtCursor(instrument: Instrument) {
    // cycleDots only supports simple (non-`,`-split) lanes for now; it
    // addresses the slot by its flat position within the beat.
    const laneBeat = bar.beats[clampedCursor.beatIndex]?.lanes.find(
      (l) => l.instrument === instrument,
    );
    if (!laneBeat) return;
    const plan = planLaneBeat(laneBeat, clampedCursor.beatIndex, barResolution);
    const col = plan.columns[clampedCursor.slotIndex];
    if (!col) return;
    // `,`-split lanes expose slots via `beat-group-slot` columns with a
    // groupIndex > 0. Those aren't supported for dot cycling yet.
    if (col.kind !== "beat-slot") return;
    onCycleDots(
      clampedCursor.beatIndex,
      instrument,
      col.slotIndex,
    );
  }

  async function copyBarSourceToClipboard() {
    try {
      await navigator.clipboard?.writeText(serialized);
    } catch {
      // Clipboard may be blocked in insecure contexts; nothing we can do.
    }
  }

  // Every Editor hotkey carries scope: "editor" so it only fires when
  // focus is inside the Editor panel. Preview-scoped shortcuts (bar
  // clipboard, selection) live in App.tsx with scope: "preview".
  const editorHotkeys: Hotkey[] = [
    // Navigation
    { key: "ArrowLeft", handler: () => moveCursor(-1, 0) },
    { key: "ArrowRight", handler: () => moveCursor(1, 0) },
    { key: "ArrowUp", handler: () => moveCursor(0, -1) },
    { key: "ArrowDown", handler: () => moveCursor(0, 1) },
    {
      key: "Home",
      handler: () =>
        setCursor((c) => ({ ...c, beatIndex: 0, slotIndex: 0 })),
    },
    {
      key: "End",
      handler: () => {
        const beatIndex = beatsPerBar - 1;
        const lane = bar.beats[beatIndex]?.lanes.find(
          (l) => l.instrument === currentInstrument,
        );
        const plan = planLaneBeat(lane, beatIndex, barResolution);
        setCursor((c) => ({
          ...c,
          beatIndex,
          slotIndex: Math.max(0, plan.columns.length - 1),
        }));
      },
    },
    // Copy the current bar's .drumtab source to the clipboard. Different
    // semantics from the Preview panel's ⌘C (which copies whole bars as
    // AST); here the user gets the raw text so they can paste into the
    // Source-mode textarea or another app.
    {
      key: "c",
      meta: true,
      description: "Copy bar source",
      handler: () => void copyBarSourceToClipboard(),
    },
    {
      key: "c",
      ctrl: true,
      description: "Copy bar source",
      handler: () => void copyBarSourceToClipboard(),
    },
    // Toggles
    { key: "Tab", handler: () => setAutoAdvance((v) => !v) },
    { key: "Delete", handler: () => clearCursorSlot() },
    { key: "Backspace", handler: () => clearCursorSlot() },
    {
      key: "[",
      description: "Previous bar",
      handler: () => onPrevBar?.(),
    },
    {
      key: "]",
      description: "Next bar (append when at the end)",
      // On the last bar ']' appends so continuous entry doesn't stall.
      handler: () => {
        if (barIndex >= totalBars - 1) onInsertAfter?.();
        else onNextBar?.();
      },
    },
    {
      key: "Enter",
      meta: true,
      description: "Insert bar after",
      handler: () => onInsertAfter?.(),
    },
    {
      key: "Enter",
      ctrl: true,
      description: "Insert bar after",
      handler: () => onInsertAfter?.(),
    },
    // Instrument digits
    ...Object.entries(INSTRUMENT_BY_DIGIT).map(([digit, instrument]) => ({
      key: digit,
      handler: () => toggleAtCursor(instrument),
    })),
    ...(currentInstrument
      ? [
          {
            key: "0",
            description: "Insert explicit rest",
            handler: () => restAtCursor(),
          },
        ]
      : []),
    // These all operate on the current lane, so skip registration on
    // an empty bar — their helpers take Instrument, not undefined.
    ...(currentInstrument
      ? [
          {
            key: ">",
            shift: true,
            handler: () => applyModifierAtCursor(currentInstrument, "accent"),
          },
          {
            key: "g",
            handler: () => applyModifierAtCursor(currentInstrument, "ghost"),
          },
          {
            key: "(",
            shift: true,
            handler: () => applyModifierAtCursor(currentInstrument, "ghost"),
          },
          {
            key: "f",
            handler: () => applyModifierAtCursor(currentInstrument, "flam"),
          },
          {
            key: "r",
            handler: () => applyModifierAtCursor(currentInstrument, "roll"),
          },
          {
            key: "~",
            shift: true,
            handler: () => applyModifierAtCursor(currentInstrument, "roll"),
          },
          {
            key: "!",
            shift: true,
            handler: () => applyModifierAtCursor(currentInstrument, "choke"),
          },
          {
            key: "R",
            shift: true,
            handler: () => setStickingAtCursor(currentInstrument, "R"),
          },
          {
            key: "L",
            shift: true,
            handler: () => setStickingAtCursor(currentInstrument, "L"),
          },
          {
            key: ".",
            description: "Cycle dotted value (0 → 1 → 2 → 0)",
            handler: () => cycleDotsAtCursor(currentInstrument),
          },
        ]
      : []),
    // Division: Alt/Option + digit sets the current beat's lane division.
    // Alt is chosen over Shift because Shift+1 collides with `!` (choke).
    ...(
      [
        ["Digit1", 1], // 1/4 (whole beat)
        ["Digit2", 2], // 1/8
        ["Digit3", 3], // triplet
        ["Digit4", 4], // 1/16
        ["Digit6", 6], // sextuplet
        ["Digit8", 8], // 1/32
      ] as Array<[string, number]>
    ).map(([code, d]) => ({
      code,
      alt: true,
      handler: () => {
        if (!currentInstrument) return;
        onSetDivision(clampedCursor.beatIndex, currentInstrument, d);
      },
    })),
  ].map((hk) => ({ ...hk, scope: "editor" }));

  // Digit keys need to fire on an empty bar to add the instrument.
  useHotkeys(editorHotkeys);

  return (
    <div className="flex flex-col gap-4" data-drumit-scope="editor">
      <SectionStrip
        label={sectionLabel}
        isFirstBarOfSection={isFirstBarOfSection}
        onRename={onRenameSection}
        onInsertAfter={onInsertSectionAfter}
        onDelete={onDeleteSection}
      />
      <BarHeader
        bar={bar}
        barResolution={barResolution}
        onChangeResolution={setBarResolution}
        onSetRepeat={onSetRepeat}
        onClearBar={onClearBar}
        onToggleRepeatStart={onToggleRepeatStart}
        onToggleRepeatEnd={onToggleRepeatEnd}
        onCycleEnding={onCycleEnding}
        onSetNavigation={onSetNavigation}
        onInsertAfter={onInsertAfter}
        onDelete={onDelete}
      />

      {bar.repeatPrevious ? (
        <div className="rounded-lg border border-dashed border-stone-300 bg-stone-50 p-6 text-center text-sm text-stone-500">
          {t("editor.bar_repeats_prev_pre")}
          <b>{t("editor.pattern")}</b>
          {t("editor.bar_repeats_prev_post")}
        </div>
      ) : (
        <>
          <CursorStatusBar
            cursor={clampedCursor}
            beatsPerBar={beatsPerBar}
            currentInstrument={currentInstrument}
            autoAdvance={autoAdvance}
            onToggleAutoAdvance={() => setAutoAdvance((v) => !v)}
          />
        {isDesktop ? (
          <StepGrid
            bar={bar}
            beatsPerBar={beatsPerBar}
            barResolution={barResolution}
            presentInstruments={presentInstruments}
            availableInstruments={ALL_INSTRUMENTS.filter(
              (i) => !presentInstruments.includes(i),
            )}
            cursor={clampedCursor}
            onAddInstrument={(i) =>
              setExtraInstruments((prev) =>
                prev.includes(i) ? prev : [...prev, i],
              )
            }
            onSetDivision={onSetDivision}
            onSetGroupDivision={onSetGroupDivision}
            onSplitBeat={onSplitBeat}
            onToggleSlot={onToggleSlot}
            onToggleArticulation={onToggleArticulation}
            onSetSticking={onSetSticking}
            onCycleDots={onCycleDots}
          />
        ) : (
          <LanePager
            bar={bar}
            beatsPerBar={beatsPerBar}
            barResolution={barResolution}
            presentInstruments={presentInstruments}
            availableInstruments={ALL_INSTRUMENTS.filter(
              (i) => !presentInstruments.includes(i),
            )}
            cursor={clampedCursor}
            onLaneChange={(laneIdx) =>
              setCursor((c) => ({ ...c, laneIdx, slotIndex: 0 }))
            }
            onAddInstrument={(i) =>
              setExtraInstruments((prev) =>
                prev.includes(i) ? prev : [...prev, i],
              )
            }
            onSetDivision={onSetDivision}
            onSetGroupDivision={onSetGroupDivision}
            onSplitBeat={onSplitBeat}
            onToggleSlot={onToggleSlot}
            onToggleArticulation={onToggleArticulation}
            onSetSticking={onSetSticking}
            onCycleDots={onCycleDots}
          />
        )}
        </>
      )}

      <div className="flex items-center justify-between gap-3">
        <div className={cn("flex gap-1", isOverlay ? "" : "hidden")}>
          <IconButton
            onClick={onUndo}
            disabled={!canUndo || !onUndo}
            title={t("editor.undo")}
            aria-label={t("editor.undo")}
          >
            ↶
          </IconButton>
          <IconButton
            onClick={onRedo}
            disabled={!canRedo || !onRedo}
            title={t("editor.redo")}
            aria-label={t("editor.redo")}
          >
            ↷
          </IconButton>
          <IconButton
            onClick={onInsertAfter}
            title={t("editor.insert_after")}
            aria-label={t("editor.insert_after")}
          >
            ＋
          </IconButton>
          <IconButton
            onClick={onClearBar}
            title={t("editor.clear_bar_tip")}
            aria-label={t("editor.clear_bar")}
          >
            ⌫
          </IconButton>
          <IconButton
            tone="danger"
            onClick={onDelete}
            title={t("editor.delete_bar")}
            aria-label={t("editor.delete_bar")}
          >
            ✕
          </IconButton>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onPrevBar}
            disabled={barIndex === 0 || !onPrevBar}
            aria-label={t("editor.prev_bar")}
            title={t("editor.prev_bar")}
            className="motion-press flex size-8 items-center justify-center rounded-full text-base text-stone-600 hover:bg-stone-100 disabled:opacity-30"
          >
            ‹
          </button>
          <div className="min-w-[4.5rem] text-center">
            <div className="text-[10px] font-bold tracking-[0.14em] text-stone-400 uppercase">
              Bar {barIndex + 1} / {totalBars}
            </div>
            <div className="mt-0.5 font-mono text-xs text-stone-600">
              {bar.repeatPrevious
                ? `${t("editor.bar_repeat_label")}${bar.repeatHint && bar.repeatHint !== "plain" ? ` · ${bar.repeatHint}` : ""}`
                : t("editor.bar_count_beats", { count: bar.beats.length })}
            </div>
          </div>
          <button
            type="button"
            onClick={onNextBar}
            disabled={barIndex >= totalBars - 1 || !onNextBar}
            aria-label={t("editor.next_bar")}
            title={t("editor.next_bar")}
            className="motion-press flex size-8 items-center justify-center rounded-full text-base text-stone-600 hover:bg-stone-100 disabled:opacity-30"
          >
            ›
          </button>
        </div>
      </div>

      <details className="text-xs text-stone-500">
        <summary className="cursor-pointer font-extrabold text-stone-700">
          {t("editor.drumtab_source")}
        </summary>
        <pre className="mt-2 overflow-auto rounded bg-[#1c1917] p-2 font-mono text-amber-100">
          {serialized}
        </pre>
      </details>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Bar header                                                          */
/* ------------------------------------------------------------------ */

/**
 * Pill above BarHeader showing the current section label with quick
 * actions to rename, split (create a new section starting at the next
 * bar), or delete. Only the label is always visible; actions live in
 * a small toolbar next to it.
 */
function SectionStrip({
  label,
  isFirstBarOfSection,
  onRename,
  onInsertAfter,
  onDelete,
}: {
  label: string;
  isFirstBarOfSection: boolean;
  onRename: (label: string) => void;
  onInsertAfter: (label: string) => void;
  onDelete: () => void;
}) {
  const dialog = useDialog();
  const { t } = useI18n();
  async function promptRename() {
    const next = await dialog.prompt({
      title: t("editor.rename_section_title"),
      message: t("editor.rename_section_message"),
      defaultValue: label,
      placeholder: "A / Verse / Chorus …",
      validate: (v) => (v.trim() === "" ? t("editor.name_required") : null),
    });
    if (next !== null && next.trim() !== label) onRename(next.trim());
  }
  async function promptSplit() {
    const next = await dialog.prompt({
      title: t("editor.new_section_title"),
      message: t("editor.new_section_message"),
      placeholder: t("editor.section_name_placeholder"),
      validate: (v) => (v.trim() === "" ? t("editor.name_required") : null),
    });
    if (next !== null && next.trim() !== "") onInsertAfter(next.trim());
  }
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-stone-200 bg-stone-50 px-3 py-1.5">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "rounded bg-stone-900 px-2 py-0.5 font-mono text-[11px] font-bold text-amber-100 dark:text-amber-800 cyber:bg-stone-50 cyber:text-amber-500",
            !isFirstBarOfSection && "opacity-60",
          )}
          title={
            isFirstBarOfSection
              ? t("editor.section_first_bar")
              : t("editor.section_other_bar")
          }
        >
          [{label || "—"}]
        </span>
        <span className="text-[10px] font-semibold tracking-wide text-stone-500 uppercase">
          {t("editor.section")}
        </span>
      </div>
      <div className="flex gap-1">
        <Button
          size="xs"
          onClick={promptRename}
          title={t("editor.rename_section_tip")}
          aria-label={t("editor.rename_section_tip")}
        >
          <span className="sm:hidden text-base leading-none">✎</span>
          <span className="hidden sm:inline">{t("editor.rename")}</span>
        </Button>
        <Button
          size="xs"
          onClick={promptSplit}
          title={t("editor.new_section_tip")}
          aria-label={t("editor.new_section_tip")}
        >
          <span className="sm:hidden text-base leading-none">+</span>
          <span className="hidden sm:inline">{t("editor.split")}</span>
        </Button>
        <Button
          size="xs"
          variant="danger"
          onClick={onDelete}
          title={t("editor.delete_section_tip")}
          aria-label={t("editor.delete_section_tip")}
        >
          <span className="sm:hidden text-base leading-none">×</span>
          <span className="hidden sm:inline">{t("editor.section_delete")}</span>
        </Button>
      </div>
    </div>
  );
}

function BarHeader({
  bar,
  barResolution,
  onChangeResolution,
  onSetRepeat,
  onClearBar,
  onToggleRepeatStart,
  onToggleRepeatEnd,
  onCycleEnding,
  onSetNavigation,
  onInsertAfter,
  onDelete,
}: {
  bar: Bar;
  barResolution: Resolution;
  onChangeResolution: (r: Resolution) => void;
  onSetRepeat: (hint: RepeatHint | null) => void;
  onClearBar: () => void;
  onToggleRepeatStart: () => void;
  onToggleRepeatEnd: () => void;
  onCycleEnding: () => void;
  onSetNavigation: (nav: NavigationMarker | null) => void;
  onInsertAfter: () => void;
  onDelete: () => void;
}) {
  const { t } = useI18n();
  return (
    <header className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-3">
      {/* Row 1: bar attributes — pattern / repeats / endings / nav. */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <ChipGroup>
          <Chip
            active={!bar.repeatPrevious}
            onClick={() => onSetRepeat(null)}
          >
            {t("editor.pattern")}
          </Chip>
          <Chip
            active={bar.repeatPrevious}
            onClick={() => onSetRepeat("plain")}
          >
            %
          </Chip>
        </ChipGroup>

        <ChipGroup>
          <Chip
            active={!!bar.repeatStart}
            onClick={onToggleRepeatStart}
            title={t("editor.repeat_start_tip")}
          >
            |:
          </Chip>
          <Chip
            active={!!bar.repeatEnd}
            onClick={onToggleRepeatEnd}
            title={t("editor.repeat_end_tip")}
          >
            :|
          </Chip>
          <Chip
            active={!!bar.ending}
            onClick={onCycleEnding}
            title={t("editor.ending_cycle_tip")}
          >
            {bar.ending ? `[${bar.ending}.]` : t("editor.ending_none")}
          </Chip>
        </ChipGroup>

        <NavigationPicker
          nav={bar.navigation ?? null}
          onChange={onSetNavigation}
        />
      </div>

      <div className="flex items-center gap-3">
        <ChipGroup>
          {RESOLUTIONS.map((r) => (
            <Chip
              key={r.label}
              active={
                barResolution.kind === r.kind &&
                barResolution.slotsPerBeat === r.slotsPerBeat
              }
              onClick={() => onChangeResolution(r)}
              title={r.label}
            >
              {r.shortLabel ? (
                <>
                  <span className="sm:hidden">{r.shortLabel}</span>
                  <span className="hidden sm:inline">{r.label}</span>
                </>
              ) : (
                r.label
              )}
            </Chip>
          ))}
        </ChipGroup>

        <div className="hidden gap-1 lg:flex">
          <Button
            onClick={onInsertAfter}
            title={t("editor.insert_after")}
          >
            {t("editor.insert_after")}
          </Button>
          <Button onClick={onClearBar} title={t("editor.clear_bar_tip")}>
            {t("editor.clear_bar")}
          </Button>
          <Button
            variant="danger"
            onClick={onDelete}
            title={t("editor.delete_bar")}
          >
            {t("editor.delete_bar")}
          </Button>
        </div>

      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* Step grid                                                           */
/* ------------------------------------------------------------------ */

function StepGrid({
  bar,
  beatsPerBar,
  barResolution,
  presentInstruments,
  availableInstruments,
  cursor,
  onAddInstrument,
  onSetDivision,
  onSetGroupDivision,
  onSplitBeat,
  onToggleSlot,
  onToggleArticulation,
  onSetSticking,
  onCycleDots,
}: {
  bar: Bar;
  beatsPerBar: number;
  barResolution: Resolution;
  presentInstruments: Instrument[];
  availableInstruments: Instrument[];
  cursor: { beatIndex: number; slotIndex: number; laneIdx: number };
  onAddInstrument: (i: Instrument) => void;
  onSetDivision: Props["onSetDivision"];
  onSetGroupDivision: Props["onSetGroupDivision"];
  onSplitBeat: Props["onSplitBeat"];
  onToggleSlot: Props["onToggleSlot"];
  onToggleArticulation: Props["onToggleArticulation"];
  onSetSticking: Props["onSetSticking"];
  onCycleDots: Props["onCycleDots"];
}) {
  const { t } = useI18n();
  return (
    <div className="mobile-safe-scroll-x overflow-x-auto rounded-xl border border-stone-200 bg-white">
      <div
        className="grid min-w-max"
        style={{
          gridTemplateColumns: `140px repeat(${beatsPerBar}, minmax(160px, 1fr))`,
        }}
      >
        {/* Top-left corner */}
        <div className="flex h-8 items-center border-r border-b border-stone-200 bg-stone-50 px-2 text-[10px] font-bold tracking-wide text-stone-500 uppercase">
          {t("editor.instrument")}
        </div>
        {/* Beat header labels */}
        {Array.from({ length: beatsPerBar }, (_, i) => (
          <div
            key={`bh-${i}`}
            className={cn(
              "flex h-8 items-center justify-center border-r border-b border-stone-200 bg-stone-50 text-[11px] font-extrabold tracking-wide text-stone-500",
              i === 0 && "border-l-2 border-l-stone-400",
            )}
          >
            Beat {i + 1}
          </div>
        ))}

        {/* Instrument rows */}
        {presentInstruments.map((instrument, laneIdx) => (
          <InstrumentRow
            key={instrument}
            bar={bar}
            beatsPerBar={beatsPerBar}
            barResolution={barResolution}
            instrument={instrument}
            cursorLaneMatch={cursor.laneIdx === laneIdx}
            cursorBeatIndex={cursor.beatIndex}
            cursorSlotIndex={cursor.slotIndex}
            onSetDivision={onSetDivision}
            onSetGroupDivision={onSetGroupDivision}
            onSplitBeat={onSplitBeat}
            onToggleSlot={onToggleSlot}
            onToggleArticulation={onToggleArticulation}
            onSetSticking={onSetSticking}
            onCycleDots={onCycleDots}
          />
        ))}

        {/* Add instrument row */}
        <div className="flex h-10 items-center border-t border-r border-stone-200 bg-white px-2">
          <AddInstrumentMenu
            options={availableInstruments}
            onPick={onAddInstrument}
          />
        </div>
        <div
          className="h-10 border-t border-stone-200"
          style={{ gridColumn: `span ${beatsPerBar}` }}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Instrument row                                                      */
/* ------------------------------------------------------------------ */

function InstrumentRow({
  bar,
  beatsPerBar,
  barResolution,
  instrument,
  cursorLaneMatch,
  cursorBeatIndex,
  cursorSlotIndex,
  onSetDivision,
  onSetGroupDivision,
  onSplitBeat,
  onToggleSlot,
  onToggleArticulation,
  onSetSticking,
  onCycleDots,
}: {
  bar: Bar;
  beatsPerBar: number;
  barResolution: Resolution;
  instrument: Instrument;
  cursorLaneMatch?: boolean;
  cursorBeatIndex?: number;
  cursorSlotIndex?: number;
  onSetDivision: Props["onSetDivision"];
  onSetGroupDivision: Props["onSetGroupDivision"];
  onSplitBeat: Props["onSplitBeat"];
  onToggleSlot: Props["onToggleSlot"];
  onToggleArticulation: Props["onToggleArticulation"];
  onSetSticking: Props["onSetSticking"];
  onCycleDots: Props["onCycleDots"];
}) {
  return (
    <>
      <div
        className={cn(
          "flex h-11 items-center gap-2 border-r border-b border-stone-200 px-2",
          cursorLaneMatch ? "bg-sky-50 dark:bg-sky-950/60" : "bg-white",
        )}
      >
        <InstrumentIcon
          instrument={instrument}
          className="size-5 shrink-0 text-stone-700"
        />
        <div className="flex min-w-0 flex-col leading-tight">
          <span className="truncate text-[11px] font-bold text-stone-700">
            {instrumentLabels[instrument]}
          </span>
          <span className="truncate font-mono text-[9px] text-stone-500">
            {canonicalAlias[instrument]}
          </span>
        </div>
        {DIGIT_BY_INSTRUMENT[instrument] ? (
          <span
            className="ml-auto flex size-5 shrink-0 items-center justify-center rounded-md border border-stone-300 bg-white font-mono text-[10px] font-bold text-stone-700"
            title={`Press ${DIGIT_BY_INSTRUMENT[instrument]} to toggle this instrument at the cursor`}
          >
            {DIGIT_BY_INSTRUMENT[instrument]}
          </span>
        ) : null}
      </div>
      {Array.from({ length: beatsPerBar }, (_, beatIndex) => {
        const lane = bar.beats[beatIndex]?.lanes.find(
          (l) => l.instrument === instrument,
        );
        const plan = planLaneBeat(lane, beatIndex, barResolution);

        const cursorBeatMatch = cursorBeatIndex === beatIndex;
        return (
          <LaneBeatCell
            key={`${instrument}-${beatIndex}`}
            plan={plan}
            bar={bar}
            instrument={instrument}
            isFirstBeat={beatIndex === 0}
            cursorBeatMatch={cursorBeatMatch}
            cursorLaneMatch={cursorLaneMatch}
            cursorSlotIndex={
              cursorBeatMatch && cursorLaneMatch ? cursorSlotIndex : undefined
            }
            onSetDivision={onSetDivision}
            onSetGroupDivision={onSetGroupDivision}
            onSplitBeat={onSplitBeat}
            onToggleSlot={onToggleSlot}
            onToggleArticulation={onToggleArticulation}
            onSetSticking={onSetSticking}
            onCycleDots={onCycleDots}
            barResolution={barResolution}
          />
        );
      })}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Mobile: one lane at a time + lane switcher                         */
/* ------------------------------------------------------------------ */

function LanePager({
  bar,
  beatsPerBar,
  barResolution,
  presentInstruments,
  availableInstruments,
  cursor,
  onLaneChange,
  onAddInstrument,
  onSetDivision,
  onSetGroupDivision,
  onSplitBeat,
  onToggleSlot,
  onToggleArticulation,
  onSetSticking,
  onCycleDots,
}: {
  bar: Bar;
  beatsPerBar: number;
  barResolution: Resolution;
  presentInstruments: Instrument[];
  availableInstruments: Instrument[];
  cursor: { beatIndex: number; slotIndex: number; laneIdx: number };
  onLaneChange: (laneIdx: number) => void;
  onAddInstrument: (i: Instrument) => void;
  onSetDivision: Props["onSetDivision"];
  onSetGroupDivision: Props["onSetGroupDivision"];
  onSplitBeat: Props["onSplitBeat"];
  onToggleSlot: Props["onToggleSlot"];
  onToggleArticulation: Props["onToggleArticulation"];
  onSetSticking: Props["onSetSticking"];
  onCycleDots: Props["onCycleDots"];
}) {
  const { t } = useI18n();
  const currentInstrument = presentInstruments[cursor.laneIdx];
  const canPrev = cursor.laneIdx > 0;
  const canNext = cursor.laneIdx < presentInstruments.length - 1;

  // Horizontal swipe on the nav strip → previous / next lane. Stays
  // off vertical gestures so page-scroll still works, and drops any
  // drag that uses a button (scroll-wheel presses, context-menus).
  const swipeRef = useSwipeLane({
    onPrev: () => canPrev && onLaneChange(cursor.laneIdx - 1),
    onNext: () => canNext && onLaneChange(cursor.laneIdx + 1),
  });

  if (!currentInstrument) {
    // No instruments in this bar yet. Surface the add menu directly.
    return (
      <div className="rounded-xl border border-stone-200 bg-white p-4">
        <AddInstrumentMenu
          options={availableInstruments}
          onPick={onAddInstrument}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        ref={swipeRef}
        className="flex touch-pan-y flex-col rounded-xl border border-stone-200 bg-white px-2 pt-2 pb-1.5"
      >
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => canPrev && onLaneChange(cursor.laneIdx - 1)}
            disabled={!canPrev}
            aria-label={t("editor.previous_lane")}
            className="motion-press flex size-9 items-center justify-center rounded-full text-lg text-stone-600 hover:bg-stone-100 disabled:opacity-30"
          >
            ‹
          </button>
          <div className="flex min-w-0 flex-1 items-center justify-center gap-2">
            <InstrumentIcon
              instrument={currentInstrument}
              className="size-5 shrink-0 text-stone-700"
            />
            <span className="truncate text-sm font-bold text-stone-900">
              {instrumentLabels[currentInstrument]}
            </span>
            <span className="truncate font-mono text-[10px] text-stone-500">
              {canonicalAlias[currentInstrument]}
            </span>
          </div>
          <button
            type="button"
            onClick={() => canNext && onLaneChange(cursor.laneIdx + 1)}
            disabled={!canNext}
            aria-label={t("editor.next_lane")}
            className="motion-press flex size-9 items-center justify-center rounded-full text-lg text-stone-600 hover:bg-stone-100 disabled:opacity-30"
          >
            ›
          </button>
        </div>

        {/* Dot indicators as part of the lane nav strip — discrete
            progress pips centered under the instrument name. Hit
            target is padded around the dot via px/py so the visible
            pip stays small but the click zone is finger-friendly. */}
        {presentInstruments.length > 1 ? (
          <div className="-mx-1 mt-1 flex items-center justify-center">
            {presentInstruments.map((ins, idx) => (
              <button
                key={ins}
                type="button"
                onClick={() => onLaneChange(idx)}
                aria-label={t("editor.jump_to_lane", {
                  name: instrumentLabels[ins],
                })}
                className="group flex h-4 items-center justify-center px-1.5"
              >
                <span
                  className={cn(
                    "block size-1.5 rounded-full transition-colors",
                    idx === cursor.laneIdx
                      ? "bg-stone-900"
                      : "bg-stone-300 group-hover:bg-stone-500",
                  )}
                />
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div
        className="grid rounded-xl border border-stone-200 bg-white"
        style={{
          gridTemplateColumns: `repeat(${beatsPerBar}, minmax(0, 1fr))`,
        }}
      >
        {Array.from({ length: beatsPerBar }, (_, beatIndex) => (
          <div
            key={`mbh-${beatIndex}`}
            className={cn(
              "flex h-7 items-center justify-center border-r border-b border-stone-200 bg-stone-50 text-[10px] font-extrabold tracking-wide text-stone-500",
              beatIndex === 0 && "border-l-2 border-l-stone-400",
              beatIndex === beatsPerBar - 1 && "border-r-0",
            )}
          >
            {beatIndex + 1}
          </div>
        ))}
        {Array.from({ length: beatsPerBar }, (_, beatIndex) => {
          const lane = bar.beats[beatIndex]?.lanes.find(
            (l) => l.instrument === currentInstrument,
          );
          const plan = planLaneBeat(lane, beatIndex, barResolution);
          const cursorBeatMatch = cursor.beatIndex === beatIndex;
          return (
            <LaneBeatCell
              key={`${currentInstrument}-${beatIndex}`}
              plan={plan}
              bar={bar}
              instrument={currentInstrument}
              isFirstBeat={beatIndex === 0}
              cursorBeatMatch={cursorBeatMatch}
              cursorLaneMatch
              cursorSlotIndex={cursorBeatMatch ? cursor.slotIndex : undefined}
              onSetDivision={onSetDivision}
              onSetGroupDivision={onSetGroupDivision}
              onSplitBeat={onSplitBeat}
              onToggleSlot={onToggleSlot}
              onToggleArticulation={onToggleArticulation}
              onSetSticking={onSetSticking}
              onCycleDots={onCycleDots}
              barResolution={barResolution}
            />
          );
        })}
      </div>

      <AddInstrumentMenu
        options={availableInstruments}
        onPick={onAddInstrument}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Per-lane per-beat cell: includes the slot grid + a small settings btn */
/* ------------------------------------------------------------------ */

function LaneBeatCell({
  plan,
  bar,
  instrument,
  isFirstBeat,
  barResolution,
  cursorBeatMatch,
  cursorLaneMatch,
  cursorSlotIndex,
  onSetDivision,
  onSetGroupDivision,
  onSplitBeat,
  onToggleSlot,
  onToggleArticulation,
  onSetSticking,
  onCycleDots,
}: {
  plan: LaneBeatPlan;
  bar: Bar;
  instrument: Instrument;
  isFirstBeat: boolean;
  barResolution: Resolution;
  /** True if the edit cursor is in this beat. */
  cursorBeatMatch?: boolean;
  /** True if the edit cursor is on this lane. */
  cursorLaneMatch?: boolean;
  /** Slot index the cursor is on, only when both cursorBeatMatch and cursorLaneMatch are true. */
  cursorSlotIndex?: number;
  onSetDivision: Props["onSetDivision"];
  onSetGroupDivision: Props["onSetGroupDivision"];
  onSplitBeat: Props["onSplitBeat"];
  onToggleSlot: Props["onToggleSlot"];
  onToggleArticulation: Props["onToggleArticulation"];
  onSetSticking: Props["onSetSticking"];
  onCycleDots: Props["onCycleDots"];
}) {
  return (
    <div
      className={cn(
        "group/lane relative h-11 border-r border-b border-stone-200",
        isFirstBeat && "border-l-2 border-l-stone-400",
      )}
    >
      <div
        className="grid h-full w-full"
        style={{
          gridTemplateColumns: plan.columns
            .map((c) => `minmax(${minColumnWidth(c)}px, ${c.widthUnits}fr)`)
            .join(" "),
        }}
      >
        {plan.columns.map((col, i) => {
          const isCursorCell =
            cursorBeatMatch && cursorLaneMatch && cursorSlotIndex === i;
          const cursorState: "cell" | "beat" | "lane" | null = isCursorCell
            ? "cell"
            : cursorLaneMatch && cursorBeatMatch
              ? "beat"
              : cursorLaneMatch
                ? "lane"
                : null;
          return (
            <StepCell
              key={i}
              bar={bar}
              instrument={instrument}
              plan={plan}
              column={col}
              columnIndex={i}
              cursorState={cursorState}
              onSetDivision={onSetDivision}
              onToggleSlot={onToggleSlot}
              onToggleArticulation={onToggleArticulation}
              onSetSticking={onSetSticking}
              onCycleDots={onCycleDots}
            />
          );
        })}
      </div>

      {/* Per-lane settings button, top-right overlay */}
      <LaneSettingsButton
        plan={plan}
        instrument={instrument}
        barResolution={barResolution}
        onSetDivision={onSetDivision}
        onSetGroupDivision={onSetGroupDivision}
        onSplitBeat={onSplitBeat}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Step cell                                                           */
/* ------------------------------------------------------------------ */

function StepCell({
  bar,
  instrument,
  plan,
  column,
  columnIndex,
  cursorState,
  onSetDivision,
  onToggleSlot,
  onToggleArticulation,
  onSetSticking,
  onCycleDots,
}: {
  bar: Bar;
  instrument: Instrument;
  plan: LaneBeatPlan;
  column: CellPlan;
  columnIndex: number;
  onSetDivision: Props["onSetDivision"];
  onToggleSlot: Props["onToggleSlot"];
  onToggleArticulation: Props["onToggleArticulation"];
  onSetSticking: Props["onSetSticking"];
  onCycleDots: Props["onCycleDots"];
  cursorState?: "cell" | "beat" | "lane" | null;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [cellAnchor, setCellAnchor] = useState<HTMLButtonElement | null>(null);

  const hit = resolveHit(bar, instrument, plan, column);

  const handleClick = () => {
    // Before writing, ensure the lane's division matches this beat's display
    // resolution so `slot[slotIndex]` points to the column the user clicked.
    // This is the bridge between "user sees N equal columns in this beat"
    // and the lane's data model.
    if (column.kind === "beat-slot") {
      const lane = bar.beats[plan.beatIndex]?.lanes.find(
        (l) => l.instrument === instrument,
      );
      const needsResize =
        !lane ||
        (!lane.groups && lane.division !== column.slotsPerBeat);
      if (needsResize) {
        onSetDivision(plan.beatIndex, instrument, column.slotsPerBeat);
      }
    }
    const address = slotAddressFromColumn(column);
    onToggleSlot(
      plan.beatIndex,
      instrument,
      address.slotIndex,
      address.groupIndex,
    );
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setMenuOpen(true);
  };

  const isGroupStart =
    column.kind === "group-slot" && column.slotIndex === 0;
  const isBeatStart =
    column.kind === "beat-slot"
      ? column.slotIndex === 0
      : column.groupIndex === 0 && column.slotIndex === 0;

  return (
    <>
      <button
        ref={setCellAnchor}
        type="button"
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        title={hit ? describeHit(hit) : "Click to toggle · Right-click for more"}
        className={cn(
          "relative flex h-full items-center justify-center text-[13px] transition select-none",
          columnIndex > 0 && "border-l border-stone-100",
          isBeatStart && !isGroupStart && "border-l border-stone-300",
          isGroupStart &&
            !isBeatStart &&
            "border-l border-dashed border-amber-400",
          hit
            ? hitBgClass(hit)
            : "bg-white text-stone-200 hover:bg-amber-50/60 hover:text-stone-400",
          cursorState === "lane" && !hit && "bg-sky-50",
          cursorState === "beat" && !hit && "bg-sky-50/60",
          cursorState === "cell" &&
            "outline outline-2 outline-sky-500 outline-offset-[-2px] z-10",
        )}
      >
        <AnimatePresence mode="popLayout">
          {hit ? (
            <motion.span
              key="hit"
              className="pointer-events-none flex flex-col items-center justify-center"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{
                type: "spring",
                stiffness: 520,
                damping: 30,
                mass: 0.6,
              }}
            >
              {renderHitBadge(hit)}
            </motion.span>
          ) : null}
        </AnimatePresence>
      </button>

      <FloatingMenu
        anchor={cellAnchor}
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
      >
        <StepContextMenuContent
          hit={hit}
          onToggle={() => {
            handleClick();
            setMenuOpen(false);
          }}
          onToggleArticulation={(art) => {
            if (!hit) handleClick();
            const address = slotAddressFromColumn(column);
            onToggleArticulation(
              plan.beatIndex,
              instrument,
              address.slotIndex,
              art,
              address.groupIndex,
            );
          }}
          onSetSticking={(s) => {
            if (!hit) handleClick();
            const address = slotAddressFromColumn(column);
            onSetSticking(
              plan.beatIndex,
              instrument,
              address.slotIndex,
              s,
              address.groupIndex,
            );
          }}
          onCycleDots={() => {
            if (!hit) return;
            if (column.kind !== "beat-slot") return;
            onCycleDots(plan.beatIndex, instrument, column.slotIndex);
          }}
          canDot={!!hit && column.kind === "beat-slot"}
          currentDots={hit?.dots ?? 0}
        />
      </FloatingMenu>
    </>
  );
}

function StepContextMenuContent({
  hit,
  onToggle,
  onToggleArticulation,
  onSetSticking,
  onCycleDots,
  canDot,
  currentDots,
}: {
  hit: Hit | null;
  onToggle: () => void;
  onToggleArticulation: (art: Articulation) => void;
  onSetSticking: (s: "R" | "L" | null) => void;
  onCycleDots: () => void;
  canDot: boolean;
  currentDots: number;
}) {
  const { t } = useI18n();
  return (
    <div className="min-w-[200px] text-left">
      <button
        type="button"
        onClick={onToggle}
        className="mb-2 block w-full rounded-md border border-stone-200 px-2 py-1 text-[11px] font-bold text-stone-700 hover:bg-stone-900 hover:text-white"
      >
        {hit ? t("editor.remove_hit") : t("editor.add_hit")}
      </button>
      <div className="mb-1 text-[10px] font-extrabold tracking-wide text-stone-500 uppercase">
        {t("editor.articulations")}
      </div>
      <div className="mb-3 flex gap-1">
        {(
          [
            { label: ">", value: "accent" },
            { label: "()", value: "ghost" },
            { label: "f", value: "flam" },
            { label: "~", value: "roll" },
          ] as const
        ).map(({ label, value }) => (
          <button
            key={value}
            type="button"
            onClick={() => onToggleArticulation(value)}
            className={cn(
              "flex-1 rounded border px-2 py-1 text-[11px] font-bold transition",
              hit?.articulations.includes(value)
                ? "border-amber-500 bg-amber-100 text-stone-900 dark:bg-amber-500/30 dark:text-amber-50"
                : "border-stone-200 bg-white text-stone-600 hover:border-stone-500",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {canDot ? (
        <>
          <div className="mb-1 text-[10px] font-extrabold tracking-wide text-stone-500 uppercase">
            {t("editor.dots")}
          </div>
          <button
            type="button"
            onClick={onCycleDots}
            className={cn(
              "mb-3 block w-full rounded border px-2 py-1 text-[11px] font-bold transition",
              currentDots > 0
                ? "border-amber-500 bg-amber-100 text-stone-900 dark:bg-amber-500/30 dark:text-amber-50"
                : "border-stone-200 bg-white text-stone-600 hover:border-stone-500",
            )}
          >
            {currentDots === 1
              ? t("editor.dot_dotted")
              : currentDots === 2
                ? t("editor.dot_double")
                : t("editor.dot_add")}
          </button>
        </>
      ) : null}
      <div className="mb-1 text-[10px] font-extrabold tracking-wide text-stone-500 uppercase">
        {t("editor.sticking")}
      </div>
      <div className="flex gap-1">
        {(["R", "L", null] as const).map((s) => (
          <button
            key={s ?? "none"}
            type="button"
            onClick={() => onSetSticking(s)}
            className={cn(
              "flex-1 rounded border px-2 py-1 text-[11px] font-bold transition",
              hit?.sticking === s || (s === null && !hit?.sticking)
                ? "border-amber-500 bg-amber-100 text-stone-900 dark:bg-amber-500/30 dark:text-amber-50"
                : "border-stone-200 bg-white text-stone-600 hover:border-stone-500",
            )}
          >
            {s ?? "—"}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Per-lane settings popover: Split / Merge / Division                 */
/* ------------------------------------------------------------------ */

function LaneSettingsButton({
  plan,
  instrument,
  barResolution,
  onSetDivision,
  onSetGroupDivision,
  onSplitBeat,
}: {
  plan: LaneBeatPlan;
  instrument: Instrument;
  barResolution: Resolution;
  onSetDivision: Props["onSetDivision"];
  onSetGroupDivision: Props["onSetGroupDivision"];
  onSplitBeat: Props["onSplitBeat"];
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);

  const indicator = plan.split
    ? `${countGroups(plan)}g`
    : plan.usesBarResolution
      ? ""
      : `/${plan.columns.length}`;

  const customized = plan.split || !plan.usesBarResolution;

  return (
    <>
      <button
        ref={setAnchor}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className={cn(
          "absolute top-0 right-0 z-10 flex h-4 items-center gap-0.5 rounded-bl-md rounded-tr-md border-b border-l px-1 text-[9px] font-bold leading-none transition",
          customized
            ? "border-amber-500 bg-amber-500 text-white"
            : "border-stone-200 bg-white text-stone-400 opacity-60 hover:bg-stone-900 hover:text-white hover:opacity-100 group-hover/lane:opacity-100",
        )}
        title={t("editor.customize_beat_tip")}
      >
        <span className="text-[10px]">⚙</span>
        {indicator ? <span>{indicator}</span> : null}
      </button>
      <FloatingMenu
        anchor={anchor}
        open={open}
        onClose={() => setOpen(false)}
      >
        <LaneSettingsPopover
          plan={plan}
          instrument={instrument}
          barResolution={barResolution}
          onSetDivision={onSetDivision}
          onSetGroupDivision={onSetGroupDivision}
          onSplitBeat={onSplitBeat}
          onClose={() => setOpen(false)}
        />
      </FloatingMenu>
    </>
  );
}

function LaneSettingsPopover({
  plan,
  instrument,
  barResolution,
  onSetDivision,
  onSetGroupDivision,
  onSplitBeat,
  onClose,
}: {
  plan: LaneBeatPlan;
  instrument: Instrument;
  barResolution: Resolution;
  onSetDivision: Props["onSetDivision"];
  onSetGroupDivision: Props["onSetGroupDivision"];
  onSplitBeat: Props["onSplitBeat"];
  onClose: () => void;
}) {
  const { t } = useI18n();
  const groupCount = countGroups(plan);

  return (
    <div className="min-w-[240px] text-left">
      <div className="mb-1 text-[10px] font-extrabold tracking-wide text-stone-500 uppercase">
        {instrumentLabels[instrument]} · Beat {plan.beatIndex + 1}
      </div>
      <div className="mb-3 text-[10px] text-stone-500">{t("editor.lane_tip")}</div>

      <div className="mb-1 text-[10px] font-extrabold tracking-wide text-stone-500 uppercase">
        {t("editor.split_label")}
      </div>
      <div className="mb-3 flex gap-1">
        {[1, 2, 3, 4].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => {
              onSplitBeat(plan.beatIndex, instrument, n);
              if (n === 1) onClose();
            }}
            className={cn(
              "flex-1 rounded-md border px-2 py-1 text-[11px] font-bold transition",
              groupCount === n
                ? "border-stone-900 bg-stone-900 text-stone-50"
                : "border-stone-200 bg-white text-stone-700 hover:border-stone-500",
            )}
          >
            {n === 1 ? t("editor.merge") : t("editor.split_n", { n })}
          </button>
        ))}
      </div>

      {plan.split ? (
        <>
          <div className="mb-1 text-[10px] font-extrabold tracking-wide text-stone-500 uppercase">
            {t("editor.division_per_group")}
          </div>
          <div className="flex flex-col gap-1">
            {Array.from({ length: groupCount }, (_, gi) => {
              const current = divisionForGroup(plan, gi);
              return (
                <div
                  key={gi}
                  className="flex items-center gap-2 rounded-md bg-stone-50 px-2 py-1"
                >
                  <span className="min-w-[48px] text-[10px] font-bold text-stone-500">
                    {t("editor.group_n", { n: gi + 1 })}
                  </span>
                  <div className="flex flex-1 gap-1">
                    {[1, 2, 3, 4].map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() =>
                          onSetGroupDivision(
                            plan.beatIndex,
                            instrument,
                            gi,
                            d,
                          )
                        }
                        className={cn(
                          "flex-1 rounded border px-1.5 py-0.5 text-[11px] font-bold transition",
                          current === d
                            ? "border-amber-500 bg-amber-100 text-stone-900 dark:bg-amber-500/30 dark:text-amber-50"
                            : "border-stone-200 bg-white text-stone-600 hover:border-stone-500",
                        )}
                      >
                        /{d}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <>
          <div className="mb-1 text-[10px] font-extrabold tracking-wide text-stone-500 uppercase">
            Override grid ({plan.usesBarResolution ? "using bar grid" : "custom"})
          </div>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 6, 8].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => onSetDivision(plan.beatIndex, instrument, d)}
                className={cn(
                  "flex-1 rounded border px-1.5 py-0.5 text-[11px] font-bold transition",
                  plan.columns.length === d && !plan.usesBarResolution
                    ? "border-amber-500 bg-amber-100 text-stone-900 dark:bg-amber-500/30 dark:text-amber-50"
                    : "border-stone-200 bg-white text-stone-600 hover:border-stone-500",
                )}
              >
                /{d}
              </button>
            ))}
          </div>
        </>
      )}

      {!plan.usesBarResolution || plan.split ? (
        <div className="mt-3 border-t border-stone-200 pt-2">
          <button
            type="button"
            onClick={() => {
              // Reset: force lane.division to match the bar-level resolution.
              // Hits already on aligned slot indices are preserved by the
              // growLane/shrink logic in edit.ts; extra slots get added or
              // trimmed accordingly.
              const barSlots = barResolution.slotsPerBeat;
              onSetDivision(plan.beatIndex, instrument, barSlots);
              onClose();
            }}
            className="w-full rounded-md border border-stone-200 bg-white px-2 py-1 text-[11px] font-bold text-stone-600 hover:border-amber-400 hover:bg-amber-50 hover:text-amber-700"
            title={`Re-align this lane's beat to the bar-level grid (currently ${barResolution.label})`}
          >
            ↺ Reset to {barResolution.label}
          </button>
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Add instrument menu                                                 */
/* ------------------------------------------------------------------ */

const NAV_OPTIONS: Array<{
  key: string;
  nav: NavigationMarker | null;
  label: string;
}> = [
  { key: "none", nav: null, label: "—" },
  { key: "segno", nav: { kind: "segno" }, label: "Segno 𝄋" },
  { key: "coda", nav: { kind: "coda" }, label: "Coda 𝄌" },
  { key: "toCoda", nav: { kind: "toCoda" }, label: "To Coda" },
  { key: "fine", nav: { kind: "fine" }, label: "Fine" },
  { key: "dc", nav: { kind: "dc" }, label: "D.C." },
  { key: "dc-fine", nav: { kind: "dc", target: "fine" }, label: "D.C. al Fine" },
  { key: "dc-coda", nav: { kind: "dc", target: "coda" }, label: "D.C. al Coda" },
  { key: "ds", nav: { kind: "ds" }, label: "D.S." },
  { key: "ds-fine", nav: { kind: "ds", target: "fine" }, label: "D.S. al Fine" },
  { key: "ds-coda", nav: { kind: "ds", target: "coda" }, label: "D.S. al Coda" },
];

function navKey(nav: NavigationMarker | null): string {
  if (!nav) return "none";
  if (nav.kind === "dc" || nav.kind === "ds") {
    return nav.target ? `${nav.kind}-${nav.target}` : nav.kind;
  }
  return nav.kind;
}

function NavigationPicker({
  nav,
  onChange,
}: {
  nav: NavigationMarker | null;
  onChange: (nav: NavigationMarker | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const active = NAV_OPTIONS.find((o) => o.key === navKey(nav)) ?? NAV_OPTIONS[0];
  return (
    <>
      <button
        ref={setAnchor}
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Navigation marker"
        className={cn(
          "flex h-6 items-center gap-1 rounded-full border px-2 text-[11px] font-bold transition",
          nav
            ? "border-amber-500 bg-amber-100 text-stone-900 dark:bg-amber-500/30 dark:text-amber-50"
            : "border-stone-200 bg-white text-stone-600 hover:bg-stone-50",
        )}
      >
        <span className="tracking-wide">{active.label}</span>
        <svg
          viewBox="0 0 12 12"
          className="size-3 opacity-60"
          fill="currentColor"
          aria-hidden
        >
          <path d="M2 4 L6 8 L10 4 Z" />
        </svg>
      </button>
      <FloatingMenu anchor={anchor} open={open} onClose={() => setOpen(false)}>
        <div className="w-[200px]">
          <div className="mb-1.5 text-[10px] font-extrabold tracking-wide text-stone-500 uppercase">
            Navigation
          </div>
          <div className="flex flex-col gap-0.5">
            {NAV_OPTIONS.map((opt) => {
              const isActive = opt.key === active.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => {
                    onChange(opt.nav);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex items-center justify-between rounded-md px-2 py-1 text-left text-[12px] font-medium",
                    isActive
                      ? "bg-stone-900 text-stone-50"
                      : "text-stone-700 hover:bg-stone-100",
                  )}
                >
                  <span>{opt.label}</span>
                  {isActive ? <span className="opacity-60">✓</span> : null}
                </button>
              );
            })}
          </div>
        </div>
      </FloatingMenu>
    </>
  );
}

function AddInstrumentMenu({
  options,
  onPick,
}: {
  options: Instrument[];
  onPick: (i: Instrument) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);

  if (!options.length)
    return (
      <div className="text-[10px] text-stone-300">
        {t("editor.all_instruments_added")}
      </div>
    );

  return (
    <>
      <button
        ref={setAnchor}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-md border border-dashed border-stone-300 bg-white px-2 py-1.5 text-[11px] font-bold text-stone-600 hover:border-stone-500 hover:bg-stone-50"
      >
        {t("editor.add")}
        <svg
          viewBox="0 0 12 12"
          className="size-3 opacity-60"
          fill="currentColor"
          aria-hidden
        >
          <path d="M2 4 L6 8 L10 4 Z" />
        </svg>
      </button>
      <FloatingMenu anchor={anchor} open={open} onClose={() => setOpen(false)}>
        <div className="w-[260px]">
          <div className="mb-2 text-[10px] font-extrabold tracking-wide text-stone-500 uppercase">
            {t("editor.add_instrument")}
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {options.map((i) => {
              const digit = DIGIT_BY_INSTRUMENT[i];
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    onPick(i);
                    setOpen(false);
                  }}
                  className="motion-press group relative flex flex-col items-center gap-1 rounded-lg border border-stone-200 bg-white p-2 text-[10px] font-bold text-stone-700 transition-[background-color,color,border-color,transform] duration-150 ease-out hover:border-stone-900 hover:bg-stone-900 hover:text-amber-100"
                  title={`${instrumentLabels[i]} (${canonicalAlias[i]})${digit ? ` — press ${digit}` : ""}`}
                >
                  {digit ? (
                    <span className="absolute top-1 right-1 flex size-4 items-center justify-center rounded-sm bg-stone-100 font-mono text-[9px] text-stone-700 group-hover:bg-stone-700 group-hover:text-amber-100">
                      {digit}
                    </span>
                  ) : null}
                  <InstrumentIcon instrument={i} className="size-6" />
                  <span className="truncate text-center leading-tight">
                    {instrumentLabels[i]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </FloatingMenu>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Small UI primitives                                                 */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/**
 * Lower bound on a cell's rendered width. 16th-note cells compress to ~16px
 * but 32nd / sextuplet cells can go smaller; keep at least 12px so hit marks
 * remain clickable and readable.
 */
function minColumnWidth(column: CellPlan): number {
  // 1/4 full-beat (widthUnits=1): ≥ 44px
  // 1/8 half-beat (0.5): ≥ 32px
  // 1/16 (0.25): ≥ 24px
  // 1/32 (0.125): ≥ 14px
  // sextuplet (~0.167): ≥ 18px
  const u = column.widthUnits;
  if (u >= 0.9) return 60;
  if (u >= 0.45) return 40;
  if (u >= 0.3) return 28;
  if (u >= 0.2) return 22;
  if (u >= 0.14) return 16;
  return 12;
}

function inferBarResolution(bar: Bar): Resolution | null {
  let maxBinary = 0;
  let maxTriplet = 0;
  bar.beats.forEach((beat) =>
    beat.lanes.forEach((lane) => {
      if (lane.groups && lane.groups.length > 1) return; // skip split lanes
      const isTriplet = !!lane.tuplet;
      if (isTriplet) maxTriplet = Math.max(maxTriplet, lane.division);
      else maxBinary = Math.max(maxBinary, lane.division);
    }),
  );
  if (maxTriplet && !maxBinary) {
    return (
      RESOLUTIONS.find(
        (r) =>
          r.kind === "triplet" && r.slotsPerBeat === (maxTriplet === 6 ? 6 : 3),
      ) ?? null
    );
  }
  if (maxBinary >= 8) return RESOLUTIONS.find((r) => r.slotsPerBeat === 8)!;
  if (maxBinary >= 4) return RESOLUTIONS.find((r) => r.slotsPerBeat === 4)!;
  if (maxBinary >= 2) return RESOLUTIONS.find((r) => r.slotsPerBeat === 2)!;
  return null;
}

function resolveHit(
  bar: Bar,
  instrument: Instrument,
  plan: LaneBeatPlan,
  column: CellPlan,
): Hit | null {
  const beat = bar.beats[plan.beatIndex];
  if (!beat) return null;
  const lane = beat.lanes.find((l) => l.instrument === instrument);
  if (!lane) return null;

  if (column.kind === "group-slot") {
    if (!lane.groups) return null;
    const g = lane.groups[column.groupIndex];
    if (!g) return null;
    return g.slots[column.slotIndex] ?? null;
  }

  // beat-slot on a dot-expanded lane: each group owns one slot.
  if (
    lane.groups &&
    lane.groups.length > 1 &&
    lane.groups.every((g) => g.division === 1 && g.slots.length === 1)
  ) {
    const g = lane.groups[column.slotIndex];
    return g?.slots[0] ?? null;
  }

  // beat-slot: map display slots → lane.slots
  if (lane.groups) return null; // lane is split but column is not — do not render
  const laneSlot = Math.floor(
    (column.slotIndex * lane.division) / column.slotsPerBeat,
  );
  if (laneSlot >= lane.slots.length) return null;
  // Require an exact alignment: the display slot must map to the same lane
  // slot only if the display resolution is a multiple/divisor of lane div.
  // Otherwise we show empty for off-grid cells.
  if (
    (column.slotIndex * lane.division) % column.slotsPerBeat !== 0 &&
    lane.division !== column.slotsPerBeat
  ) {
    return null;
  }
  return lane.slots[laneSlot] ?? null;
}

function slotAddressFromColumn(column: CellPlan): {
  slotIndex: number;
  groupIndex?: number;
} {
  if (column.kind === "beat-slot")
    return { slotIndex: column.slotIndex };
  return { slotIndex: column.slotIndex, groupIndex: column.groupIndex };
}

function countGroups(plan: LaneBeatPlan): number {
  if (!plan.split) return 1;
  const ids = new Set<number>();
  plan.columns.forEach((c) => {
    if (c.kind === "group-slot") ids.add(c.groupIndex);
  });
  return ids.size;
}

function divisionForGroup(plan: LaneBeatPlan, groupIndex: number): number {
  for (const c of plan.columns) {
    if (c.kind === "group-slot" && c.groupIndex === groupIndex)
      return c.slotsInGroup;
  }
  return 1;
}

/* ------------------------------------------------------------------ */
/* Hit visuals                                                         */
/* ------------------------------------------------------------------ */

/**
 * Per-row-group background so each voice family has a recognisable
 * colour in the editor. Accent keeps the existing amber emphasis;
 * ghost stays dim. Matches the rest of the app's stone + amber palette.
 */
function hitBgClass(hit: Hit): string {
  if (hit.articulations.includes("accent"))
    return "bg-amber-500 text-white shadow-sm ring-1 ring-amber-600/30";
  if (hit.articulations.includes("ghost"))
    return "bg-stone-400 text-white shadow-sm";
  const group = rowGroupFor(hit.instrument);
  switch (group) {
    case "cymbals":
      return "bg-yellow-700 text-amber-50 shadow-sm";
    case "toms":
      return "bg-orange-800 text-orange-50 shadow-sm";
    case "snare":
      return "bg-rose-700 text-rose-50 shadow-sm";
    case "kick":
      return "bg-[#1c1917] text-amber-100 shadow-sm cyber:text-amber-500";
  }
}

function renderHitBadge(hit: Hit): React.ReactNode {
  const icon = hit.articulations.includes("ghost")
    ? "()"
    : hit.articulations.includes("accent")
      ? ">"
      : "●";
  const subs: string[] = [];
  if (hit.articulations.includes("roll")) subs.push("~");
  if (hit.articulations.includes("flam")) subs.push("f");
  if (hit.sticking) subs.push(hit.sticking);
  return (
    <>
      <span className="font-bold leading-none">{icon}</span>
      {subs.length ? (
        <span className="text-[8px] font-bold opacity-80">
          {subs.join("")}
        </span>
      ) : null}
    </>
  );
}

function describeHit(hit: Hit): string {
  const parts: string[] = [instrumentLabels[hit.instrument]];
  if (hit.articulations.length) parts.push(hit.articulations.join("+"));
  if (hit.sticking) parts.push(hit.sticking);
  return parts.join(" · ");
}

function CursorStatusBar({
  cursor,
  beatsPerBar,
  currentInstrument,
  autoAdvance,
  onToggleAutoAdvance,
}: {
  cursor: { beatIndex: number; slotIndex: number; laneIdx: number };
  beatsPerBar: number;
  currentInstrument: Instrument | undefined;
  autoAdvance: boolean;
  onToggleAutoAdvance: () => void;
}) {
  const { t } = useI18n();
  const instLabel = currentInstrument
    ? instrumentLabels[currentInstrument]
    : "—";
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-stone-200 bg-stone-50 px-2.5 py-1 text-[10px] text-stone-600">
      <span className="font-bold text-stone-700">
        {t("editor.cursor_status", {
          beat: cursor.beatIndex + 1,
          total: beatsPerBar,
          slot: cursor.slotIndex + 1,
          inst: instLabel,
        })}
      </span>
      <button
        type="button"
        onClick={onToggleAutoAdvance}
        className={cn(
          "rounded-full border px-2 py-0.5 font-bold",
          autoAdvance
            ? "border-sky-500 bg-sky-100 text-sky-900"
            : "border-stone-200 bg-white text-stone-500",
        )}
        title={t("editor.tab_autoadvance_hint")}
      >
        {autoAdvance ? t("editor.autoadvance_on") : t("editor.autoadvance_off")}
      </button>
    </div>
  );
}

function IconButton({
  onClick,
  disabled,
  title,
  tone = "neutral",
  children,
  ...rest
}: {
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
  tone?: "neutral" | "danger";
  children: React.ReactNode;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onClick">) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "motion-press flex size-9 flex-none items-center justify-center rounded-full border text-base leading-none transition",
        "disabled:cursor-not-allowed disabled:opacity-30",
        tone === "danger"
          ? "border-red-200 bg-white text-red-600 hover:border-red-600 hover:bg-red-600 hover:text-white"
          : "border-stone-200 bg-white text-stone-700 hover:bg-stone-50",
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
