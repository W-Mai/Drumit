import { useMemo, useState } from "react";
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

/* ------------------------------------------------------------------ */
/* Props                                                               */
/* ------------------------------------------------------------------ */

interface Props {
  bar: Bar;
  barIndex: number; // global
  totalBars: number;
  beatsPerBar: number;
  onSetRepeat: (hint: RepeatHint | null) => void;
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
  { kind: "binary", slotsPerBeat: 2, label: "1/8" },
  { kind: "binary", slotsPerBeat: 4, label: "1/16" },
  { kind: "binary", slotsPerBeat: 8, label: "1/32" },
  { kind: "triplet", slotsPerBeat: 3, label: "Triplet" },
  { kind: "triplet", slotsPerBeat: 6, label: "Sextuplet" },
];

const DEFAULT_RESOLUTION: Resolution = RESOLUTIONS[1]; // 1/16

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
    }
  | {
      kind: "group-slot";
      groupIndex: number;
      slotIndex: number;
      slotsInGroup: number;
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
      for (let slotIndex = 0; slotIndex < g.division; slotIndex += 1) {
        columns.push({
          kind: "group-slot",
          groupIndex,
          slotIndex,
          slotsInGroup: g.division,
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

  // Un-split lane: follow bar-level resolution unless the lane's own
  // division is finer. If the lane was triplet and bar is binary (or vice
  // versa), the lane's setting takes precedence since it's musically
  // different.
  const laneDiv = lane?.division ?? 1;
  const laneIsTriplet = !!lane?.tuplet;
  const barIsTriplet = barResolution.kind === "triplet";
  const mismatch = lane ? laneIsTriplet !== barIsTriplet : false;
  const custom = mismatch || laneDiv > barResolution.slotsPerBeat;
  const slotsPerBeat = custom
    ? Math.max(1, laneDiv)
    : barResolution.slotsPerBeat;

  const columns: CellPlan[] = Array.from({ length: slotsPerBeat }, (_, i) => ({
    kind: "beat-slot",
    slotIndex: i,
    slotsPerBeat,
    custom,
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
  onSetRepeat,
  onInsertAfter,
  onDelete,
  onSetDivision,
  onSetGroupDivision,
  onSplitBeat,
  onToggleSlot,
  onToggleArticulation,
  onSetSticking,
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

  return (
    <div className="flex flex-col gap-4">
      <BarHeader
        barIndex={barIndex}
        totalBars={totalBars}
        bar={bar}
        barResolution={barResolution}
        onChangeResolution={setBarResolution}
        onSetRepeat={onSetRepeat}
        onInsertAfter={onInsertAfter}
        onDelete={onDelete}
      />

      {bar.repeatPrevious ? (
        <div className="rounded-lg border border-dashed border-stone-300 bg-stone-50 p-6 text-center text-sm text-stone-500">
          This bar repeats the previous one. Click <b>Pattern</b> to add
          content.
        </div>
      ) : (
        <StepGrid
          bar={bar}
          beatsPerBar={beatsPerBar}
          barResolution={barResolution}
          presentInstruments={presentInstruments}
          availableInstruments={ALL_INSTRUMENTS.filter(
            (i) => !presentInstruments.includes(i),
          )}
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

function BarHeader({
  barIndex,
  totalBars,
  bar,
  barResolution,
  onChangeResolution,
  onSetRepeat,
  onInsertAfter,
  onDelete,
}: {
  barIndex: number;
  totalBars: number;
  bar: Bar;
  barResolution: Resolution;
  onChangeResolution: (r: Resolution) => void;
  onSetRepeat: (hint: RepeatHint | null) => void;
  onInsertAfter: () => void;
  onDelete: () => void;
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <div>
          <div className="text-[10px] font-bold tracking-[0.14em] text-stone-400 uppercase">
            Bar {barIndex + 1} / {totalBars}
          </div>
          <div className="mt-0.5 font-mono text-xs text-stone-600">
            {bar.repeatPrevious
              ? `repeat${bar.repeatHint && bar.repeatHint !== "plain" ? ` · ${bar.repeatHint}` : ""}`
              : `${bar.beats.length} beats`}
          </div>
        </div>

        <ChipGroup>
          <Chip active={!bar.repeatPrevious} onClick={() => onSetRepeat(null)}>
            Pattern
          </Chip>
          <Chip
            active={bar.repeatPrevious && bar.repeatHint === "plain"}
            onClick={() => onSetRepeat("plain")}
          >
            %
          </Chip>
          <Chip
            active={bar.repeatPrevious && bar.repeatHint === "dot"}
            onClick={() => onSetRepeat("dot")}
          >
            %.
          </Chip>
          <Chip
            active={bar.repeatPrevious && bar.repeatHint === "dash"}
            onClick={() => onSetRepeat("dash")}
          >
            %-
          </Chip>
          <Chip
            active={bar.repeatPrevious && bar.repeatHint === "comma"}
            onClick={() => onSetRepeat("comma")}
          >
            %,
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
          <button
            type="button"
            onClick={onInsertAfter}
            className="rounded-full border border-stone-200 bg-white px-3 py-1 text-xs font-bold text-stone-700 hover:bg-stone-900 hover:text-white"
          >
            + Insert
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="rounded-full border border-red-200 bg-white px-3 py-1 text-xs font-bold text-red-600 hover:bg-red-600 hover:text-white"
          >
            Delete
          </button>
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
        {presentInstruments.map((instrument) => (
          <InstrumentRow
            key={instrument}
            bar={bar}
            beatsPerBar={beatsPerBar}
            barResolution={barResolution}
            instrument={instrument}
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
  onSetDivision: Props["onSetDivision"];
  onSetGroupDivision: Props["onSetGroupDivision"];
  onSplitBeat: Props["onSplitBeat"];
  onToggleSlot: Props["onToggleSlot"];
  onToggleArticulation: Props["onToggleArticulation"];
  onSetSticking: Props["onSetSticking"];
}) {
  return (
    <>
      <div className="flex h-11 items-center gap-2 border-r border-b border-stone-200 bg-white px-2">
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
      </div>
      {Array.from({ length: beatsPerBar }, (_, beatIndex) => {
        const lane = bar.beats[beatIndex]?.lanes.find(
          (l) => l.instrument === instrument,
        );
        const plan = planLaneBeat(lane, beatIndex, barResolution);

        return (
          <LaneBeatCell
            key={`${instrument}-${beatIndex}`}
            plan={plan}
            bar={bar}
            instrument={instrument}
            isFirstBeat={beatIndex === 0}
            onSetDivision={onSetDivision}
            onSetGroupDivision={onSetGroupDivision}
            onSplitBeat={onSplitBeat}
            onToggleSlot={onToggleSlot}
            onToggleArticulation={onToggleArticulation}
            onSetSticking={onSetSticking}
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
          gridTemplateColumns: `repeat(${plan.columns.length}, minmax(24px, 1fr))`,
        }}
      >
        {plan.columns.map((col, i) => (
          <StepCell
            key={i}
            bar={bar}
            instrument={instrument}
            plan={plan}
            column={col}
            columnIndex={i}
            onToggleSlot={onToggleSlot}
            onToggleArticulation={onToggleArticulation}
            onSetSticking={onSetSticking}
          />
        ))}
      </div>

      {/* Per-lane settings button, top-right overlay */}
      <LaneSettingsButton
        plan={plan}
        instrument={instrument}
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
  onToggleSlot,
  onToggleArticulation,
  onSetSticking,
}: {
  bar: Bar;
  instrument: Instrument;
  plan: LaneBeatPlan;
  column: CellPlan;
  columnIndex: number;
  onToggleSlot: Props["onToggleSlot"];
  onToggleArticulation: Props["onToggleArticulation"];
  onSetSticking: Props["onSetSticking"];
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [cellAnchor, setCellAnchor] = useState<HTMLButtonElement | null>(null);

  const hit = resolveHit(bar, instrument, plan, column);

  const handleClick = () => {
    // Plain set/unset — modifiers are handled via right-click menu.
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
  onSetDivision,
  onSetGroupDivision,
  onSplitBeat,
}: {
  plan: LaneBeatPlan;
  instrument: Instrument;
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
  onSetDivision,
  onSetGroupDivision,
  onSplitBeat,
  onClose,
}: {
  plan: LaneBeatPlan;
  instrument: Instrument;
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
            {options.map((i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  onPick(i);
                  setOpen(false);
                }}
                className="flex flex-col items-center gap-1 rounded-lg border border-stone-200 bg-white p-2 text-[10px] font-bold text-stone-700 transition hover:border-stone-900 hover:bg-stone-900 hover:text-amber-100"
                title={`${instrumentLabels[i]} (${canonicalAlias[i]})`}
              >
                <InstrumentIcon instrument={i} className="size-6" />
                <span className="truncate text-center leading-tight">
                  {instrumentLabels[i]}
                </span>
              </button>
            ))}
          </div>
        </div>
      </FloatingMenu>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Small UI primitives                                                 */
/* ------------------------------------------------------------------ */

function ChipGroup({ children }: { children: React.ReactNode }) {
  return (
    <div className="inline-flex flex-wrap items-center gap-0.5 rounded-full border border-stone-200 bg-stone-50 p-0.5">
      {children}
    </div>
  );
}

function Chip({
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
          ? "bg-stone-900 text-white shadow-sm"
          : "text-stone-600 hover:bg-stone-200",
      )}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

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
