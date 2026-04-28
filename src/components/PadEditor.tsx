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
  LaneGroup,
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

  // Instruments the user has explicitly added beyond what the bar already has.
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

/**
 * Per-beat column plan. If any lane in this beat uses groups, we render the
 * beat as its groups (each group is a sub-cell column). Otherwise the beat
 * expands into `barResolution.slotsPerBeat` equally-spaced step cells.
 */
interface BeatPlan {
  beatIndex: number;
  columns: BeatColumn[];
  /** True if *any* lane in this beat has been split into groups. */
  split: boolean;
}

type BeatColumn =
  | {
      kind: "slot";
      beatIndex: number;
      slotIndex: number;
      slotsPerBeat: number;
      tuplet?: number; // when this beat uses a triplet resolution
    }
  | {
      kind: "group-slot";
      beatIndex: number;
      groupIndex: number;
      slotIndex: number;
      slotsInGroup: number;
      tuplet?: number;
    };

function buildBeatPlans(
  bar: Bar,
  beatsPerBar: number,
  barResolution: Resolution,
): BeatPlan[] {
  return Array.from({ length: beatsPerBar }, (_, beatIndex) => {
    const beat = bar.beats[beatIndex];
    // Does any lane in this beat have groups? If yes, render as groups.
    const lanesWithGroups = beat?.lanes.filter(
      (l) => l.groups && l.groups.length > 1,
    );
    if (lanesWithGroups && lanesWithGroups.length > 0) {
      // Pick the first lane's group structure as the beat's column template.
      // (All lanes that are split in this beat share the same split count via
      //  the current UI, which only splits a single lane at a time.)
      const template = lanesWithGroups[0]!.groups!;
      const columns: BeatColumn[] = [];
      template.forEach((group, groupIndex) => {
        for (let slotIndex = 0; slotIndex < group.division; slotIndex += 1) {
          columns.push({
            kind: "group-slot",
            beatIndex,
            groupIndex,
            slotIndex,
            slotsInGroup: group.division,
            tuplet: group.tuplet,
          });
        }
      });
      return { beatIndex, columns, split: true };
    }

    // Single-group beat → use the bar-wide resolution.
    const slotsPerBeat = barResolution.slotsPerBeat;
    const tuplet =
      barResolution.kind === "triplet" ? slotsPerBeat : undefined;
    const columns: BeatColumn[] = Array.from(
      { length: slotsPerBeat },
      (_, slotIndex) => ({
        kind: "slot",
        beatIndex,
        slotIndex,
        slotsPerBeat,
        tuplet,
      }),
    );
    return { beatIndex, columns, split: false };
  });
}

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
  const plans = useMemo(
    () => buildBeatPlans(bar, beatsPerBar, barResolution),
    [bar, beatsPerBar, barResolution],
  );

  // Total columns across all beats (for stable layout width).
  const totalColumns = plans.reduce((a, p) => a + p.columns.length, 0);

  return (
    <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
      <div
        className="grid min-w-max"
        style={{
          gridTemplateColumns: `minmax(100px, 112px) repeat(${totalColumns}, minmax(28px, 44px))`,
        }}
      >
        {/* Beat header rows (2 rows: wide beat title + sub-column pips). */}
        <div className="sticky left-0 z-10 border-r border-b border-stone-200 bg-stone-50 px-2 py-2 text-[10px] font-bold tracking-wide text-stone-500 uppercase">
          Beat
        </div>
        {plans.map((plan) => (
          <BeatTitleCell
            key={`bt-${plan.beatIndex}`}
            plan={plan}
            presentInstruments={presentInstruments}
            onSplitBeat={onSplitBeat}
            onSetGroupDivision={onSetGroupDivision}
          />
        ))}

        {/* Sub-header row: sub-group labels only needed when a beat is split */}
        <div className="sticky left-0 z-10 border-r border-b border-stone-200 bg-white" />
        {plans.flatMap((plan) =>
          plan.columns.map((col, i) => (
            <SubHeaderCell
              key={`sh-${plan.beatIndex}-${i}`}
              plan={plan}
              column={col}
              localIndex={i}
            />
          )),
        )}

        {/* Instrument rows */}
        {presentInstruments.map((instrument) => (
          <InstrumentRow
            key={instrument}
            bar={bar}
            instrument={instrument}
            plans={plans}
            onSetDivision={onSetDivision}
            onToggleSlot={onToggleSlot}
            onToggleArticulation={onToggleArticulation}
            onSetSticking={onSetSticking}
          />
        ))}

        {/* Add instrument row */}
        <div className="sticky left-0 z-10 border-r border-t border-stone-200 bg-white px-2 py-2">
          <AddInstrumentMenu
            options={availableInstruments}
            onPick={onAddInstrument}
          />
        </div>
        <div
          className="border-t border-stone-200"
          style={{ gridColumn: `span ${totalColumns}` }}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Beat header cells                                                   */
/* ------------------------------------------------------------------ */

function BeatTitleCell({
  plan,
  presentInstruments,
  onSplitBeat,
  onSetGroupDivision,
}: {
  plan: BeatPlan;
  presentInstruments: Instrument[];
  onSplitBeat: Props["onSplitBeat"];
  onSetGroupDivision: Props["onSetGroupDivision"];
}) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);

  const span = plan.columns.length;
  const groupCount = plan.split
    ? new Set(
        plan.columns
          .filter(
            (c): c is Extract<BeatColumn, { kind: "group-slot" }> =>
              c.kind === "group-slot",
          )
          .map((c) => c.groupIndex),
      ).size
    : 1;

  return (
    <>
      <button
        ref={setAnchor}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center justify-center border-r border-b border-stone-200 bg-stone-50 px-2 py-2 text-[11px] font-bold tracking-wide transition select-none",
          "hover:bg-stone-200",
          plan.split && "bg-amber-50 text-stone-900",
          "border-l-2 border-l-stone-400",
        )}
        style={{ gridColumn: `span ${span}` }}
        title="Click to split / merge this beat"
      >
        Beat {plan.beatIndex + 1}
        {plan.split ? ` · ${groupCount} groups` : ""}
        <svg
          viewBox="0 0 12 12"
          className="ml-1 size-3 opacity-60"
          fill="currentColor"
          aria-hidden
        >
          <path d="M2 4 L6 8 L10 4 Z" />
        </svg>
      </button>

      <FloatingMenu
        anchor={anchor}
        open={open}
        onClose={() => setOpen(false)}
      >
        <BeatPopoverContent
          plan={plan}
          groupCount={groupCount}
          onPickSplit={(n) => {
            presentInstruments.forEach((inst) =>
              onSplitBeat(plan.beatIndex, inst, n),
            );
            setOpen(false);
          }}
          onPickGroupDivision={(gi, d) => {
            presentInstruments.forEach((inst) =>
              onSetGroupDivision(plan.beatIndex, inst, gi, d),
            );
          }}
        />
      </FloatingMenu>
    </>
  );
}

function BeatPopoverContent({
  plan,
  groupCount,
  onPickSplit,
  onPickGroupDivision,
}: {
  plan: BeatPlan;
  groupCount: number;
  onPickSplit: (n: number) => void;
  onPickGroupDivision: (groupIndex: number, d: number) => void;
}) {
  // For each group, surface a mini division picker so the user can set
  // (for example) group 1 = 1 slot and group 2 = 3 slots (tripled).
  const groupDivisions: number[] = plan.split
    ? Array.from({ length: groupCount }, (_, gi) => {
        const col = plan.columns.find(
          (c): c is Extract<BeatColumn, { kind: "group-slot" }> =>
            c.kind === "group-slot" && c.groupIndex === gi,
        );
        return col ? col.slotsInGroup : 1;
      })
    : [];

  return (
    <div className="min-w-[220px] text-left">
      <div className="mb-1 text-[10px] font-extrabold tracking-wide text-stone-500 uppercase">
        Beat {plan.beatIndex + 1} · {plan.split ? `${groupCount} groups` : "single"}
      </div>
      <div className="mb-3 flex gap-1">
        {[1, 2, 3, 4].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onPickSplit(n)}
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
      {plan.split && (
        <>
          <div className="mb-1 text-[10px] font-extrabold tracking-wide text-stone-500 uppercase">
            Division per group
          </div>
          <div className="flex flex-col gap-1">
            {groupDivisions.map((current, gi) => (
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
                      onClick={() => onPickGroupDivision(gi, d)}
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
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function SubHeaderCell({
  plan,
  column,
  localIndex,
}: {
  plan: BeatPlan;
  column: BeatColumn;
  localIndex: number;
}) {
  const isBeatStart =
    column.kind === "slot" ? column.slotIndex === 0 : localIndex === 0;
  const isGroupStart =
    column.kind === "group-slot" && column.slotIndex === 0;

  const label =
    plan.split && isGroupStart && column.kind === "group-slot"
      ? `${plan.beatIndex + 1}.${column.groupIndex + 1}`
      : "";

  return (
    <div
      className={cn(
        "flex items-center justify-center border-b border-stone-200 bg-white py-1 text-[9px] font-bold text-stone-400",
        localIndex === 0 && "border-l-2 border-l-stone-400",
        isBeatStart && !isGroupStart && "border-l-2 border-l-stone-400",
        isGroupStart && "border-l border-dashed border-amber-400",
      )}
    >
      {label || <span className="text-stone-200">·</span>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Instrument row                                                      */
/* ------------------------------------------------------------------ */

function InstrumentRow({
  bar,
  instrument,
  plans,
  onSetDivision,
  onToggleSlot,
  onToggleArticulation,
  onSetSticking,
}: {
  bar: Bar;
  instrument: Instrument;
  plans: BeatPlan[];
  onSetDivision: Props["onSetDivision"];
  onToggleSlot: Props["onToggleSlot"];
  onToggleArticulation: Props["onToggleArticulation"];
  onSetSticking: Props["onSetSticking"];
}) {
  return (
    <>
      <div className="sticky left-0 z-10 flex items-center gap-2 border-r border-b border-stone-200 bg-white px-2 py-2">
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
      {plans.flatMap((plan) =>
        plan.columns.map((col, i) => (
          <StepCell
            key={`${instrument}-${plan.beatIndex}-${i}`}
            bar={bar}
            instrument={instrument}
            column={col}
            localIndex={i}
            onSetDivision={onSetDivision}
            onToggleSlot={onToggleSlot}
            onToggleArticulation={onToggleArticulation}
            onSetSticking={onSetSticking}
          />
        )),
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Step cell                                                           */
/* ------------------------------------------------------------------ */

function StepCell({
  bar,
  instrument,
  column,
  localIndex,
  onSetDivision,
  onToggleSlot,
  onToggleArticulation,
  onSetSticking,
}: {
  bar: Bar;
  instrument: Instrument;
  column: BeatColumn;
  localIndex: number;
  onSetDivision: Props["onSetDivision"];
  onToggleSlot: Props["onToggleSlot"];
  onToggleArticulation: Props["onToggleArticulation"];
  onSetSticking: Props["onSetSticking"];
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  const hit = resolveHitForCell(bar, instrument, column);

  const handleClick = () => {
    if (column.kind === "slot") {
      handleWholeBeatCellClick({
        bar,
        instrument,
        column,
        hit,
        onSetDivision,
        onToggleSlot,
        onToggleArticulation,
      });
    } else {
      handleGroupSlotCellClick({
        instrument,
        column,
        hit,
        onToggleSlot,
        onToggleArticulation,
      });
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setMenuOpen(true);
  };

  // Visual cues
  const isBeatStart =
    column.kind === "slot"
      ? column.slotIndex === 0
      : column.slotIndex === 0 && column.groupIndex === 0;
  const isGroupStart =
    column.kind === "group-slot" && column.slotIndex === 0;

  const [cellAnchor, setCellAnchor] = useState<HTMLButtonElement | null>(null);

  return (
    <>
      <button
        ref={setCellAnchor}
        type="button"
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        title={hit ? describeHit(hit) : "Click to fill · Right-click for more"}
        className={cn(
          "relative flex aspect-square items-center justify-center border-b border-stone-200 text-sm transition select-none",
          localIndex === 0 && "border-l-2 border-l-stone-400",
          isBeatStart && !isGroupStart && "border-l-2 border-l-stone-400",
          isGroupStart && "border-l border-dashed border-amber-500",
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
            const { slotIndex, groupIndex } = slotAddressFromColumn(column);
            if (!hit) {
              handleClick();
            }
            onToggleArticulation(
              column.beatIndex,
              instrument,
              slotIndex,
              art,
              groupIndex,
            );
          }}
          onSetSticking={(s) => {
            const { slotIndex, groupIndex } = slotAddressFromColumn(column);
            if (!hit) handleClick();
            onSetSticking(
              column.beatIndex,
              instrument,
              slotIndex,
              s,
              groupIndex,
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
      <FloatingMenu
        anchor={anchor}
        open={open}
        onClose={() => setOpen(false)}
      >
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
/* Logic helpers                                                       */
/* ------------------------------------------------------------------ */

function inferBarResolution(bar: Bar): Resolution | null {
  let maxBinary = 0;
  let maxTriplet = 0;
  bar.beats.forEach((beat) =>
    beat.lanes.forEach((lane) => {
      const groups: Array<LaneGroup | Omit<LaneGroup, "ratio">> =
        lane.groups ?? [
          {
            ratio: 1,
            division: lane.division,
            tuplet: lane.tuplet,
            slots: lane.slots,
          },
        ];
      groups.forEach((g) => {
        const isTriplet =
          g.division === 3 || g.division === 6 || !!g.tuplet;
        if (isTriplet) {
          maxTriplet = Math.max(maxTriplet, g.division);
        } else {
          maxBinary = Math.max(maxBinary, g.division);
        }
      });
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

function resolveHitForCell(
  bar: Bar,
  instrument: Instrument,
  column: BeatColumn,
): Hit | null {
  const beat = bar.beats[column.beatIndex];
  if (!beat) return null;
  const lane = beat.lanes.find((l) => l.instrument === instrument);
  if (!lane) return null;

  if (column.kind === "group-slot") {
    if (!lane.groups) return null;
    const g = lane.groups[column.groupIndex];
    if (!g) return null;
    // Map lane's group division → displayed group slot count.
    // When display division > lane division, show hit only on cells that
    // coincide with lane slots.
    const laneSlot = Math.floor(
      (column.slotIndex * g.division) / column.slotsInGroup,
    );
    if (laneSlot >= g.slots.length) return null;
    return g.slots[laneSlot] ?? null;
  }

  // Whole-beat slot.
  if (lane.groups) return null; // mismatch — lane is split but col isn't
  const laneSlot = Math.floor(
    (column.slotIndex * lane.division) / column.slotsPerBeat,
  );
  if (laneSlot >= lane.slots.length) return null;
  return lane.slots[laneSlot] ?? null;
}

function handleWholeBeatCellClick(args: {
  bar: Bar;
  instrument: Instrument;
  column: Extract<BeatColumn, { kind: "slot" }>;
  hit: Hit | null;
  onSetDivision: Props["onSetDivision"];
  onToggleSlot: Props["onToggleSlot"];
  onToggleArticulation: Props["onToggleArticulation"];
}) {
  const { bar, instrument, column, hit, onSetDivision, onToggleSlot, onToggleArticulation } = args;
  const { beatIndex, slotIndex, slotsPerBeat, tuplet } = column;
  const beat = bar.beats[beatIndex];
  const lane = beat?.lanes.find((l) => l.instrument === instrument);

  // If lane is currently on a different kind (binary vs triplet), reset it.
  const needsReset =
    !lane ||
    lane.groups ||
    lane.division !== slotsPerBeat ||
    (tuplet ? !lane.tuplet : !!lane.tuplet);

  if (needsReset) {
    onSetDivision(beatIndex, instrument, slotsPerBeat);
    onToggleSlot(beatIndex, instrument, slotIndex);
    return;
  }

  // Cycle: off → on → accent → ghost → off
  if (!hit) {
    onToggleSlot(beatIndex, instrument, slotIndex);
    return;
  }
  const isAccent = hit.articulations.includes("accent");
  const isGhost = hit.articulations.includes("ghost");

  if (!isAccent && !isGhost) {
    onToggleArticulation(beatIndex, instrument, slotIndex, "accent");
    return;
  }
  if (isAccent && !isGhost) {
    // Remove accent, add ghost.
    onToggleArticulation(beatIndex, instrument, slotIndex, "accent");
    onToggleArticulation(beatIndex, instrument, slotIndex, "ghost");
    return;
  }
  // Off.
  if (isGhost) onToggleArticulation(beatIndex, instrument, slotIndex, "ghost");
  onToggleSlot(beatIndex, instrument, slotIndex);
}

function handleGroupSlotCellClick(args: {
  instrument: Instrument;
  column: Extract<BeatColumn, { kind: "group-slot" }>;
  hit: Hit | null;
  onToggleSlot: Props["onToggleSlot"];
  onToggleArticulation: Props["onToggleArticulation"];
}) {
  const { instrument, column, hit, onToggleSlot, onToggleArticulation } = args;
  const { beatIndex, groupIndex, slotIndex } = column;
  if (!hit) {
    onToggleSlot(beatIndex, instrument, slotIndex, groupIndex);
    return;
  }
  const isAccent = hit.articulations.includes("accent");
  const isGhost = hit.articulations.includes("ghost");
  if (!isAccent && !isGhost) {
    onToggleArticulation(beatIndex, instrument, slotIndex, "accent", groupIndex);
    return;
  }
  if (isAccent && !isGhost) {
    onToggleArticulation(beatIndex, instrument, slotIndex, "accent", groupIndex);
    onToggleArticulation(beatIndex, instrument, slotIndex, "ghost", groupIndex);
    return;
  }
  if (isGhost) onToggleArticulation(beatIndex, instrument, slotIndex, "ghost", groupIndex);
  onToggleSlot(beatIndex, instrument, slotIndex, groupIndex);
}

function slotAddressFromColumn(column: BeatColumn): {
  slotIndex: number;
  groupIndex?: number;
} {
  if (column.kind === "slot") return { slotIndex: column.slotIndex };
  return { slotIndex: column.slotIndex, groupIndex: column.groupIndex };
}

/* ------------------------------------------------------------------ */
/* Hit visuals                                                         */
/* ------------------------------------------------------------------ */

function hitBgClass(hit: Hit): string {
  if (hit.articulations.includes("accent"))
    return "bg-amber-500 text-white shadow-sm";
  if (hit.articulations.includes("ghost"))
    return "bg-stone-400 text-white";
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
