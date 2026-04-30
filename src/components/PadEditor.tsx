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
  RepeatHint,
} from "../notation/types";
import { FloatingMenu } from "./FloatingMenu";
import { InstrumentIcon } from "./InstrumentIcon";
import { Button, Chip, ChipGroup } from "./ui";
import { useHotkeys } from "../lib/useHotkeys";
import {
  DIGIT_BY_INSTRUMENT,
  INSTRUMENT_BY_DIGIT,
} from "../notation/hotkeyMap";
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
  onSetEmpty: (empty: boolean) => void;
  onToggleRepeatStart: () => void;
  onToggleRepeatEnd: () => void;
  onCycleEnding: () => void;
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
  onToggleArticulation: (
    beatIndex: number,
    instrument: Instrument,
    slotIndex: number,
    articulation: Articulation,
    groupIndex?: number,
  ) => void;
  /** Called when cursor crosses past the end of this bar. */
  onNextBar?: () => void;
  /** Called when cursor crosses before the start of this bar. */
  onPrevBar?: () => void;
  onSetSticking: (
    beatIndex: number,
    instrument: Instrument,
    slotIndex: number,
    sticking: "R" | "L" | null,
    groupIndex?: number,
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
};

const RESOLUTIONS: Resolution[] = [
  { kind: "binary", slotsPerBeat: 1, label: "1/4" },
  { kind: "binary", slotsPerBeat: 2, label: "1/8" },
  { kind: "binary", slotsPerBeat: 4, label: "1/16" },
  { kind: "binary", slotsPerBeat: 8, label: "1/32" },
  { kind: "triplet", slotsPerBeat: 3, label: "Triplet" },
  { kind: "triplet", slotsPerBeat: 6, label: "Sextuplet" },
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

  // Un-split lane:
  //   A lane "locks in" its own division only once the user has committed
  //   to it — concretely, when any slot carries a hit. A lane that exists
  //   but is all-rest is treated as "free": it follows the bar-level
  //   resolution so changing the global grid re-slices it.
  const laneHasHit = !!lane?.slots.some((s) => s !== null);
  const laneDiv = lane?.division ?? 1;
  const slotsPerBeat = laneHasHit
    ? Math.max(1, laneDiv)
    : barResolution.slotsPerBeat;
  // `custom` here means "this lane's grid deviates from the bar-level grid"
  // — used by the ⚙ button to decide whether to look amber.
  const custom =
    laneHasHit && slotsPerBeat !== barResolution.slotsPerBeat;

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
  onSetEmpty,
  onToggleRepeatStart,
  onToggleRepeatEnd,
  onCycleEnding,
  onInsertAfter,
  onDelete,
  onSetDivision,
  onSetGroupDivision,
  onSplitBeat,
  onToggleSlot,
  onToggleArticulation,
  onSetSticking,
  onNextBar,
  onPrevBar,
}: Props) {
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

  useHotkeys(
    [
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
      // Toggles
      { key: "Tab", handler: () => setAutoAdvance((v) => !v) },
      { key: "Delete", handler: () => clearCursorSlot() },
      { key: "Backspace", handler: () => clearCursorSlot() },
      // Instrument digits
      ...Object.entries(INSTRUMENT_BY_DIGIT).map(([digit, instrument]) => ({
        key: digit,
        handler: () => toggleAtCursor(instrument),
      })),
      // Articulation modifiers — apply to each present instrument's hit at
      // this slot if any. In practice the common case is the current lane.
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
      // Division: Alt/Option + digit sets the current beat's lane division.
      // Alt is chosen over Shift because Shift+1 collides with `!` (choke).
      ...([
        ["Digit1", 1], // 1/4 (whole beat)
        ["Digit2", 2], // 1/8
        ["Digit3", 3], // triplet
        ["Digit4", 4], // 1/16
        ["Digit6", 6], // sextuplet
        ["Digit8", 8], // 1/32
      ] as Array<[string, number]>).map(([code, d]) => ({
        code,
        alt: true,
        handler: () =>
          onSetDivision(clampedCursor.beatIndex, currentInstrument, d),
      })),
    ],
    currentInstrument !== undefined,
  );

  return (
    <div className="flex flex-col gap-4">
      <SectionStrip
        label={sectionLabel}
        isFirstBarOfSection={isFirstBarOfSection}
        onRename={onRenameSection}
        onInsertAfter={onInsertSectionAfter}
        onDelete={onDeleteSection}
      />
      <BarHeader
        barIndex={barIndex}
        totalBars={totalBars}
        bar={bar}
        barResolution={barResolution}
        onChangeResolution={setBarResolution}
        onSetRepeat={onSetRepeat}
        onSetEmpty={onSetEmpty}
        onToggleRepeatStart={onToggleRepeatStart}
        onToggleRepeatEnd={onToggleRepeatEnd}
        onCycleEnding={onCycleEnding}
        onInsertAfter={onInsertAfter}
        onDelete={onDelete}
      />

      {bar.empty ? (
        <div className="rounded-lg border border-dashed border-stone-300 bg-stone-50 p-6 text-center text-sm text-stone-500">
          This bar is silent. Click <b>Pattern</b> to add notes.
        </div>
      ) : bar.repeatPrevious ? (
        <div className="rounded-lg border border-dashed border-stone-300 bg-stone-50 p-6 text-center text-sm text-stone-500">
          This bar repeats the previous one. Click <b>Pattern</b> to add
          content.
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
        />
        </>
      )}

      <details className="text-xs text-stone-500">
        <summary className="cursor-pointer font-extrabold text-stone-700">
          Drumtab source
        </summary>
        <pre className="mt-2 overflow-auto rounded bg-stone-900 p-2 font-mono text-amber-100">
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
  function promptRename() {
    const next = window.prompt("Section name", label);
    if (next !== null && next.trim() !== "" && next !== label) {
      onRename(next.trim());
    }
  }
  function promptSplit() {
    const next = window.prompt(
      "Start a new section after this bar.\nName for the new section:",
      "",
    );
    if (next !== null && next.trim() !== "") {
      onInsertAfter(next.trim());
    }
  }
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-stone-200 bg-stone-50 px-3 py-1.5">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "rounded bg-stone-900 px-2 py-0.5 font-mono text-[11px] font-bold text-amber-100",
            !isFirstBarOfSection && "opacity-60",
          )}
          title={
            isFirstBarOfSection
              ? "First bar of this section"
              : "Section this bar belongs to (first bar elsewhere)"
          }
        >
          [{label || "—"}]
        </span>
        <span className="text-[10px] font-semibold tracking-wide text-stone-500 uppercase">
          Section
        </span>
      </div>
      <div className="flex gap-1">
        <Button size="xs" onClick={promptRename} title="Rename this section">
          ✎ Rename
        </Button>
        <Button
          size="xs"
          onClick={promptSplit}
          title="Start a new section at the next bar"
        >
          + Split
        </Button>
        <Button
          size="xs"
          variant="danger"
          onClick={onDelete}
          title="Merge this section's bars into the previous one"
        >
          × Section
        </Button>
      </div>
    </div>
  );
}

function BarHeader({
  barIndex,
  totalBars,
  bar,
  barResolution,
  onChangeResolution,
  onSetRepeat,
  onSetEmpty,
  onToggleRepeatStart,
  onToggleRepeatEnd,
  onCycleEnding,
  onInsertAfter,
  onDelete,
}: {
  barIndex: number;
  totalBars: number;
  bar: Bar;
  barResolution: Resolution;
  onChangeResolution: (r: Resolution) => void;
  onSetRepeat: (hint: RepeatHint | null) => void;
  onSetEmpty: (empty: boolean) => void;
  onToggleRepeatStart: () => void;
  onToggleRepeatEnd: () => void;
  onCycleEnding: () => void;
  onInsertAfter: () => void;
  onDelete: () => void;
}) {
  const isPattern = !bar.repeatPrevious && !bar.empty;
  return (
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <div>
          <div className="text-[10px] font-bold tracking-[0.14em] text-stone-400 uppercase">
            Bar {barIndex + 1} / {totalBars}
          </div>
          <div className="mt-0.5 font-mono text-xs text-stone-600">
            {bar.empty
              ? "silent"
              : bar.repeatPrevious
                ? `repeat${bar.repeatHint && bar.repeatHint !== "plain" ? ` · ${bar.repeatHint}` : ""}`
                : `${bar.beats.length} beats`}
          </div>
        </div>

        <ChipGroup>
          <Chip
            active={isPattern}
            onClick={() => {
              if (bar.empty) onSetEmpty(false);
              else if (bar.repeatPrevious) onSetRepeat(null);
            }}
          >
            Pattern
          </Chip>
          <Chip
            active={bar.repeatPrevious}
            onClick={() => onSetRepeat("plain")}
          >
            %
          </Chip>
          <Chip
            active={!!bar.empty}
            onClick={() => onSetEmpty(true)}
            title="Explicit whole-bar rest"
          >
            Silent
          </Chip>
        </ChipGroup>

        <ChipGroup>
          <Chip
            active={!!bar.repeatStart}
            onClick={onToggleRepeatStart}
            title="Mark this bar as the start of a repeat section (|:)"
          >
            |:
          </Chip>
          <Chip
            active={!!bar.repeatEnd}
            onClick={onToggleRepeatEnd}
            title="Mark this bar as the end of a repeat section (:|)"
          >
            :|
          </Chip>
          <Chip
            active={!!bar.ending}
            onClick={onCycleEnding}
            title="Cycle: no ending → [1.] → [2.] → none"
          >
            {bar.ending ? `[${bar.ending}.]` : "[1./2.]"}
          </Chip>
        </ChipGroup>
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
            >
              {r.label}
            </Chip>
          ))}
        </ChipGroup>

        <div className="flex gap-1">
          <Button onClick={onInsertAfter}>+ Insert</Button>
          <Button variant="danger" onClick={onDelete}>
            Delete
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
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
      <div
        className="grid min-w-max"
        style={{
          gridTemplateColumns: `140px repeat(${beatsPerBar}, minmax(160px, 1fr))`,
        }}
      >
        {/* Top-left corner */}
        <div className="flex h-8 items-center border-r border-b border-stone-200 bg-stone-50 px-2 text-[10px] font-bold tracking-wide text-stone-500 uppercase">
          Instrument
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
}) {
  return (
    <>
      <div
        className={cn(
          "flex h-11 items-center gap-2 border-r border-b border-stone-200 px-2",
          cursorLaneMatch ? "bg-sky-50" : "bg-white",
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
          <span className="truncate font-mono text-[9px] text-stone-400">
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
            barResolution={barResolution}
          />
        );
      })}
    </>
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
            : "bg-white text-stone-200 hover:bg-stone-100",
          cursorState === "lane" && !hit && "bg-sky-50",
          cursorState === "beat" && !hit && "bg-sky-50/60",
          cursorState === "cell" &&
            "outline outline-2 outline-sky-500 outline-offset-[-2px] z-10",
        )}
      >
        {hit ? renderHitBadge(hit) : null}
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
}: {
  hit: Hit | null;
  onToggle: () => void;
  onToggleArticulation: (art: Articulation) => void;
  onSetSticking: (s: "R" | "L" | null) => void;
}) {
  return (
    <div className="min-w-[200px] text-left">
      <button
        type="button"
        onClick={onToggle}
        className="mb-2 block w-full rounded-md border border-stone-200 px-2 py-1 text-[11px] font-bold text-stone-700 hover:bg-stone-900 hover:text-white"
      >
        {hit ? "Remove hit" : "Add hit"}
      </button>
      <div className="mb-1 text-[10px] font-extrabold tracking-wide text-stone-500 uppercase">
        Articulations
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
                ? "border-amber-500 bg-amber-100 text-stone-900"
                : "border-stone-200 bg-white text-stone-600 hover:border-stone-500",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="mb-1 text-[10px] font-extrabold tracking-wide text-stone-500 uppercase">
        Sticking
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
                ? "border-amber-500 bg-amber-100 text-stone-900"
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
        title="Customize this beat's subdivision / split"
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
  const groupCount = countGroups(plan);

  return (
    <div className="min-w-[240px] text-left">
      <div className="mb-1 text-[10px] font-extrabold tracking-wide text-stone-500 uppercase">
        {instrumentLabels[instrument]} · Beat {plan.beatIndex + 1}
      </div>
      <div className="mb-3 text-[10px] text-stone-500">
        Tip: Leave untouched to follow the bar-level grid. Customize only this
        lane / beat if you need a different subdivision.
      </div>

      <div className="mb-1 text-[10px] font-extrabold tracking-wide text-stone-500 uppercase">
        Split
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
                ? "border-stone-900 bg-stone-900 text-white"
                : "border-stone-200 bg-white text-stone-700 hover:border-stone-500",
            )}
          >
            {n === 1 ? "Merge" : `Split ${n}`}
          </button>
        ))}
      </div>

      {plan.split ? (
        <>
          <div className="mb-1 text-[10px] font-extrabold tracking-wide text-stone-500 uppercase">
            Division per group
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
                    Grp {gi + 1}
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
                            ? "border-amber-500 bg-amber-100 text-stone-900"
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
                    ? "border-amber-500 bg-amber-100 text-stone-900"
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

function AddInstrumentMenu({
  options,
  onPick,
}: {
  options: Instrument[];
  onPick: (i: Instrument) => void;
}) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);

  if (!options.length)
    return (
      <div className="text-[10px] text-stone-300">All instruments added</div>
    );

  return (
    <>
      <button
        ref={setAnchor}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-md border border-dashed border-stone-300 bg-white px-2 py-1.5 text-[11px] font-bold text-stone-600 hover:border-stone-500 hover:bg-stone-50"
      >
        + Add
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
            Add instrument
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
                  className="group relative flex flex-col items-center gap-1 rounded-lg border border-stone-200 bg-white p-2 text-[10px] font-bold text-stone-700 transition hover:border-stone-900 hover:bg-stone-900 hover:text-amber-100"
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

function hitBgClass(hit: Hit): string {
  if (hit.articulations.includes("accent"))
    return "bg-amber-500 text-white shadow-sm";
  if (hit.articulations.includes("ghost")) return "bg-stone-400 text-white";
  return "bg-stone-900 text-amber-100";
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
    <span className="pointer-events-none flex flex-col items-center justify-center">
      <span className="font-bold leading-none">{icon}</span>
      {subs.length ? (
        <span className="text-[8px] font-bold opacity-80">
          {subs.join("")}
        </span>
      ) : null}
    </span>
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
  const instLabel = currentInstrument
    ? instrumentLabels[currentInstrument]
    : "—";
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-stone-200 bg-stone-50 px-2.5 py-1 text-[10px] text-stone-600">
      <span className="font-bold text-stone-700">
        Beat {cursor.beatIndex + 1}/{beatsPerBar} · Slot {cursor.slotIndex + 1} · {instLabel}
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
        title="Tab to toggle auto-advance after entering a hit"
      >
        Tab: Auto-advance {autoAdvance ? "ON" : "OFF"}
      </button>
      <span className="text-stone-400">
        Shortcuts in the Shortcuts panel →
      </span>
    </div>
  );
}
