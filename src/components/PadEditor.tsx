import { useMemo, useState } from "react";
import { serializeBar } from "../notation/serialize";
import { cn } from "../lib/utils";
import { instrumentLabels } from "../notation/instruments";
import type {
  Articulation,
  Bar,
  Hit,
  Instrument,
  RepeatHint,
} from "../notation/types";

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
  onToggleSlot: (
    beatIndex: number,
    instrument: Instrument,
    slotIndex: number,
  ) => void;
  onToggleArticulation: (
    beatIndex: number,
    instrument: Instrument,
    slotIndex: number,
    articulation: Articulation,
  ) => void;
  onSetSticking: (
    beatIndex: number,
    instrument: Instrument,
    slotIndex: number,
    sticking: "R" | "L" | null,
  ) => void;
}

/** Instruments that are practical to pick from the pad palette. */
const PAD_INSTRUMENTS: Instrument[] = [
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

type Resolution = { kind: "binary" | "triplet"; slotsPerBeat: number };

const RESOLUTIONS: { label: string; value: Resolution }[] = [
  { label: "1/8", value: { kind: "binary", slotsPerBeat: 2 } },
  { label: "1/16", value: { kind: "binary", slotsPerBeat: 4 } },
  { label: "1/32", value: { kind: "binary", slotsPerBeat: 8 } },
  { label: "Triplet", value: { kind: "triplet", slotsPerBeat: 3 } },
  { label: "Sextuplet", value: { kind: "triplet", slotsPerBeat: 6 } },
];

const ARTICULATION_PRESETS: { label: string; value: Articulation }[] = [
  { label: ">", value: "accent" },
  { label: "( )", value: "ghost" },
  { label: "f", value: "flam" },
  { label: "~", value: "roll" },
];

export function PadEditor({
  bar,
  barIndex,
  totalBars,
  beatsPerBar,
  onSetRepeat,
  onInsertAfter,
  onDelete,
  onSetDivision,
  onToggleSlot,
  onToggleArticulation,
  onSetSticking,
}: Props) {
  const [selectedInstrument, setSelectedInstrument] =
    useState<Instrument>("snare");
  const [resolution, setResolution] = useState<Resolution>(RESOLUTIONS[1].value);
  const [pendingArticulations, setPendingArticulations] = useState<
    Set<Articulation>
  >(new Set());
  const [pendingSticking, setPendingSticking] = useState<"R" | "L" | null>(
    null,
  );

  const serialized = useMemo(() => serializeBar(bar), [bar]);

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-xs tracking-wide text-stone-500 uppercase">
            Bar {barIndex + 1} / {totalBars}
          </p>
          <p className="mt-0.5 font-mono text-xs text-stone-600">
            {bar.repeatPrevious
              ? "repeat previous"
              : `${bar.beats.length} beats`}
          </p>
        </div>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={onInsertAfter}
            className="rounded-full border border-stone-200 bg-white px-2.5 py-1 text-xs font-bold text-stone-700 hover:bg-stone-900 hover:text-white"
          >
            + Insert
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="rounded-full border border-red-200 bg-white px-2.5 py-1 text-xs font-bold text-red-600 hover:bg-red-600 hover:text-white"
          >
            Delete
          </button>
        </div>
      </header>

      <div className="flex flex-wrap gap-1.5">
        <RepeatButton
          active={!bar.repeatPrevious}
          label="Pattern"
          onClick={() => onSetRepeat(null)}
        />
        <RepeatButton
          active={bar.repeatPrevious && bar.repeatHint === "plain"}
          label="%"
          onClick={() => onSetRepeat("plain")}
        />
        <RepeatButton
          active={bar.repeatPrevious && bar.repeatHint === "dot"}
          label="%."
          onClick={() => onSetRepeat("dot")}
        />
        <RepeatButton
          active={bar.repeatPrevious && bar.repeatHint === "dash"}
          label="%-"
          onClick={() => onSetRepeat("dash")}
        />
        <RepeatButton
          active={bar.repeatPrevious && bar.repeatHint === "comma"}
          label="%,"
          onClick={() => onSetRepeat("comma")}
        />
      </div>

      {bar.repeatPrevious ? (
        <div className="rounded-lg border border-dashed border-stone-300 bg-stone-50 p-6 text-center text-stone-500">
          This bar repeats the previous one. Click <b>Pattern</b> to add
          content.
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold tracking-wide text-stone-500 uppercase">
              Grid
            </span>
            {RESOLUTIONS.map((r) => (
              <button
                key={r.label}
                type="button"
                onClick={() => setResolution(r.value)}
                className={cn(
                  "rounded-full border px-3 py-0.5 text-xs font-bold",
                  resolution.kind === r.value.kind &&
                    resolution.slotsPerBeat === r.value.slotsPerBeat
                    ? "border-stone-900 bg-stone-900 text-white"
                    : "border-stone-200 bg-white text-stone-600 hover:border-stone-500",
                )}
              >
                {r.label}
              </button>
            ))}
          </div>

          <InstrumentPalette
            selected={selectedInstrument}
            onSelect={setSelectedInstrument}
          />

          <ArticulationPalette
            articulations={pendingArticulations}
            sticking={pendingSticking}
            onToggleArticulation={(art) =>
              setPendingArticulations((set) => {
                const next = new Set(set);
                if (next.has(art)) next.delete(art);
                else next.add(art);
                return next;
              })
            }
            onCycleSticking={() =>
              setPendingSticking((current) =>
                current === null ? "R" : current === "R" ? "L" : null,
              )
            }
          />

          <Grid
            bar={bar}
            beatsPerBar={beatsPerBar}
            resolution={resolution}
            selectedInstrument={selectedInstrument}
            pendingArticulations={pendingArticulations}
            pendingSticking={pendingSticking}
            onSetDivision={onSetDivision}
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

function RepeatButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-bold transition",
        active
          ? "border-stone-900 bg-stone-900 text-white"
          : "border-stone-200 bg-white text-stone-700 hover:bg-stone-900 hover:text-white",
      )}
    >
      {label}
    </button>
  );
}

function InstrumentPalette({
  selected,
  onSelect,
}: {
  selected: Instrument;
  onSelect: (i: Instrument) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {PAD_INSTRUMENTS.map((i) => (
        <button
          key={i}
          type="button"
          onClick={() => onSelect(i)}
          className={cn(
            "min-w-[70px] rounded-lg border px-2 py-1 text-[11px] font-bold transition",
            selected === i
              ? "border-amber-500 bg-amber-100 text-stone-900 shadow-sm"
              : "border-stone-200 bg-white text-stone-700 hover:border-stone-500",
          )}
        >
          {instrumentLabels[i]}
        </button>
      ))}
    </div>
  );
}

function ArticulationPalette({
  articulations,
  sticking,
  onToggleArticulation,
  onCycleSticking,
}: {
  articulations: Set<Articulation>;
  sticking: "R" | "L" | null;
  onToggleArticulation: (art: Articulation) => void;
  onCycleSticking: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-stone-200 bg-stone-50/50 px-2 py-1.5">
      <span className="text-[10px] font-bold tracking-wide text-stone-500 uppercase">
        Modifiers
      </span>
      {ARTICULATION_PRESETS.map(({ label, value }) => (
        <button
          key={value}
          type="button"
          onClick={() => onToggleArticulation(value)}
          title={value}
          className={cn(
            "rounded border px-2 py-0.5 text-[11px] font-bold",
            articulations.has(value)
              ? "border-amber-500 bg-amber-100 text-stone-900"
              : "border-stone-200 bg-white text-stone-500 hover:border-stone-500",
          )}
        >
          {label}
        </button>
      ))}
      <button
        type="button"
        onClick={onCycleSticking}
        title="Sticking: none / R / L"
        className={cn(
          "rounded border px-2 py-0.5 text-[11px] font-bold",
          sticking
            ? "border-sky-500 bg-sky-100 text-stone-900"
            : "border-stone-200 bg-white text-stone-500 hover:border-stone-500",
        )}
      >
        {sticking ? sticking : "R/L"}
      </button>
    </div>
  );
}

interface GridProps {
  bar: Bar;
  beatsPerBar: number;
  resolution: Resolution;
  selectedInstrument: Instrument;
  pendingArticulations: Set<Articulation>;
  pendingSticking: "R" | "L" | null;
  onSetDivision: (
    beatIndex: number,
    instrument: Instrument,
    division: number,
  ) => void;
  onToggleSlot: (
    beatIndex: number,
    instrument: Instrument,
    slotIndex: number,
  ) => void;
  onToggleArticulation: (
    beatIndex: number,
    instrument: Instrument,
    slotIndex: number,
    articulation: Articulation,
  ) => void;
  onSetSticking: (
    beatIndex: number,
    instrument: Instrument,
    slotIndex: number,
    sticking: "R" | "L" | null,
  ) => void;
}

function Grid({
  bar,
  beatsPerBar,
  resolution,
  selectedInstrument,
  pendingArticulations,
  pendingSticking,
  onSetDivision,
  onToggleSlot,
  onToggleArticulation,
  onSetSticking,
}: GridProps) {
  const slotsPerBeat = resolution.slotsPerBeat;

  // Instruments shown as rows: at least the selected one; plus all already
  // used in this bar so the user always sees existing content.
  const lanesInBar = new Set<Instrument>();
  bar.beats.forEach((b) =>
    b.lanes.forEach((l) => lanesInBar.add(l.instrument)),
  );
  lanesInBar.add(selectedInstrument);
  const rowInstruments = PAD_INSTRUMENTS.filter((i) => lanesInBar.has(i));

  return (
    <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
      <div className="grid" style={{ gridTemplateColumns: `90px 1fr` }}>
        <div className="border-b border-r border-stone-200 bg-stone-50 px-2 py-1.5 text-[10px] font-bold tracking-wide text-stone-400 uppercase">
          Lane
        </div>
        <BeatHeader beatsPerBar={beatsPerBar} slotsPerBeat={slotsPerBeat} />

        {rowInstruments.map((instrument) => (
          <LaneRow
            key={instrument}
            bar={bar}
            beatsPerBar={beatsPerBar}
            slotsPerBeat={slotsPerBeat}
            instrument={instrument}
            selected={instrument === selectedInstrument}
            pendingArticulations={pendingArticulations}
            pendingSticking={pendingSticking}
            onSetDivision={onSetDivision}
            onToggleSlot={onToggleSlot}
            onToggleArticulation={onToggleArticulation}
            onSetSticking={onSetSticking}
          />
        ))}
      </div>
    </div>
  );
}

function BeatHeader({
  beatsPerBar,
  slotsPerBeat,
}: {
  beatsPerBar: number;
  slotsPerBeat: number;
}) {
  return (
    <div
      className="grid border-b border-stone-200 bg-stone-50 text-[10px] font-bold text-stone-500"
      style={{
        gridTemplateColumns: `repeat(${beatsPerBar * slotsPerBeat}, minmax(0, 1fr))`,
      }}
    >
      {Array.from({ length: beatsPerBar }, (_, beat) =>
        Array.from({ length: slotsPerBeat }, (_, slot) => (
          <div
            key={`${beat}-${slot}`}
            className={cn(
              "border-r border-stone-200 px-1 py-1 text-center tabular-nums last:border-r-0",
              slot === 0 && "border-l-2 border-l-stone-400",
            )}
          >
            {slot === 0 ? beat + 1 : ""}
          </div>
        )),
      )}
    </div>
  );
}

function LaneRow({
  bar,
  beatsPerBar,
  slotsPerBeat,
  instrument,
  selected,
  pendingArticulations,
  pendingSticking,
  onSetDivision,
  onToggleSlot,
  onToggleArticulation,
  onSetSticking,
}: {
  bar: Bar;
  beatsPerBar: number;
  slotsPerBeat: number;
  instrument: Instrument;
  selected: boolean;
  pendingArticulations: Set<Articulation>;
  pendingSticking: "R" | "L" | null;
  onSetDivision: (
    beatIndex: number,
    instrument: Instrument,
    division: number,
  ) => void;
  onToggleSlot: (
    beatIndex: number,
    instrument: Instrument,
    slotIndex: number,
  ) => void;
  onToggleArticulation: (
    beatIndex: number,
    instrument: Instrument,
    slotIndex: number,
    articulation: Articulation,
  ) => void;
  onSetSticking: (
    beatIndex: number,
    instrument: Instrument,
    slotIndex: number,
    sticking: "R" | "L" | null,
  ) => void;
}) {
  return (
    <>
      <div
        className={cn(
          "flex items-center border-r border-b border-stone-200 px-2 py-2 text-[11px] font-bold",
          selected ? "bg-amber-50 text-stone-900" : "bg-white text-stone-600",
        )}
      >
        {instrumentLabels[instrument]}
      </div>
      <div
        className="grid border-b border-stone-200"
        style={{
          gridTemplateColumns: `repeat(${beatsPerBar * slotsPerBeat}, minmax(0, 1fr))`,
        }}
      >
        {Array.from({ length: beatsPerBar }, (_, beatIndex) =>
          Array.from({ length: slotsPerBeat }, (_, displaySlot) => (
            <GridCell
              key={`${beatIndex}-${displaySlot}`}
              bar={bar}
              beatIndex={beatIndex}
              slotsPerBeat={slotsPerBeat}
              displaySlot={displaySlot}
              instrument={instrument}
              isBeatStart={displaySlot === 0}
              pendingArticulations={pendingArticulations}
              pendingSticking={pendingSticking}
              onSetDivision={onSetDivision}
              onToggleSlot={onToggleSlot}
              onToggleArticulation={onToggleArticulation}
              onSetSticking={onSetSticking}
            />
          )),
        )}
      </div>
    </>
  );
}

function GridCell({
  bar,
  beatIndex,
  slotsPerBeat,
  displaySlot,
  instrument,
  isBeatStart,
  pendingArticulations,
  pendingSticking,
  onSetDivision,
  onToggleSlot,
  onToggleArticulation,
  onSetSticking,
}: {
  bar: Bar;
  beatIndex: number;
  slotsPerBeat: number;
  displaySlot: number;
  instrument: Instrument;
  isBeatStart: boolean;
  pendingArticulations: Set<Articulation>;
  pendingSticking: "R" | "L" | null;
  onSetDivision: (
    beatIndex: number,
    instrument: Instrument,
    division: number,
  ) => void;
  onToggleSlot: (
    beatIndex: number,
    instrument: Instrument,
    slotIndex: number,
  ) => void;
  onToggleArticulation: (
    beatIndex: number,
    instrument: Instrument,
    slotIndex: number,
    articulation: Articulation,
  ) => void;
  onSetSticking: (
    beatIndex: number,
    instrument: Instrument,
    slotIndex: number,
    sticking: "R" | "L" | null,
  ) => void;
}) {
  const lane = bar.beats[beatIndex]?.lanes.find(
    (l) => l.instrument === instrument,
  );
  const hit = resolveHitAt(lane, slotsPerBeat, displaySlot);

  return (
    <button
      type="button"
      onClick={() =>
        handleClick({
          bar,
          beatIndex,
          slotsPerBeat,
          displaySlot,
          instrument,
          pendingArticulations,
          pendingSticking,
          onSetDivision,
          onToggleSlot,
          onToggleArticulation,
          onSetSticking,
        })
      }
      className={cn(
        "group relative aspect-square min-h-[34px] border-r border-stone-200 text-[10px] transition last:border-r-0",
        isBeatStart && "border-l-2 border-l-stone-400",
        hit
          ? "bg-stone-900 text-amber-100 hover:bg-stone-800"
          : "bg-white text-stone-300 hover:bg-stone-100",
      )}
      title={hit ? describeHit(hit) : "empty"}
    >
      {hit ? renderHitBadge(hit) : null}
    </button>
  );
}

/**
 * Given a lane with its own (possibly different) division, find the hit that
 * covers the given display slot of slotsPerBeat grid.
 */
function resolveHitAt(
  lane: Bar["beats"][number]["lanes"][number] | undefined,
  slotsPerBeat: number,
  displaySlot: number,
): Hit | null {
  if (!lane) return null;
  // Triplet displays only pair with triplet lanes, binary with binary.
  const isTripletDisplay = slotsPerBeat === 3 || slotsPerBeat === 6;
  const isTripletLane =
    lane.division === 3 || lane.division === 6 || !!lane.tuplet;
  if (isTripletDisplay !== isTripletLane) return null;
  const laneSlot = Math.floor((displaySlot * lane.division) / slotsPerBeat);
  if (laneSlot >= lane.slots.length) return null;
  return lane.slots[laneSlot] ?? null;
}

function handleClick(args: {
  bar: Bar;
  beatIndex: number;
  slotsPerBeat: number;
  displaySlot: number;
  instrument: Instrument;
  pendingArticulations: Set<Articulation>;
  pendingSticking: "R" | "L" | null;
  onSetDivision: (
    beatIndex: number,
    instrument: Instrument,
    division: number,
  ) => void;
  onToggleSlot: (
    beatIndex: number,
    instrument: Instrument,
    slotIndex: number,
  ) => void;
  onToggleArticulation: (
    beatIndex: number,
    instrument: Instrument,
    slotIndex: number,
    articulation: Articulation,
  ) => void;
  onSetSticking: (
    beatIndex: number,
    instrument: Instrument,
    slotIndex: number,
    sticking: "R" | "L" | null,
  ) => void;
}) {
  const {
    bar,
    beatIndex,
    slotsPerBeat,
    displaySlot,
    instrument,
    pendingArticulations,
    pendingSticking,
    onSetDivision,
    onToggleSlot,
    onToggleArticulation,
    onSetSticking,
  } = args;

  const lane = bar.beats[beatIndex]?.lanes.find(
    (l) => l.instrument === instrument,
  );
  const isTripletDisplay = slotsPerBeat === 3 || slotsPerBeat === 6;
  const isTripletLane = lane
    ? lane.division === 3 || lane.division === 6 || !!lane.tuplet
    : false;

  // Case 1: no lane yet → create one at display resolution.
  if (!lane) {
    onSetDivision(beatIndex, instrument, slotsPerBeat);
    onToggleSlot(beatIndex, instrument, displaySlot);
    applyPendingModifiers({
      beatIndex,
      instrument,
      slotIndex: displaySlot,
      pendingArticulations,
      pendingSticking,
      onToggleArticulation,
      onSetSticking,
    });
    return;
  }

  // Case 2: lane kind (binary vs triplet) differs from grid → reset to match.
  if (isTripletDisplay !== isTripletLane) {
    onSetDivision(beatIndex, instrument, slotsPerBeat);
    onToggleSlot(beatIndex, instrument, displaySlot);
    applyPendingModifiers({
      beatIndex,
      instrument,
      slotIndex: displaySlot,
      pendingArticulations,
      pendingSticking,
      onToggleArticulation,
      onSetSticking,
    });
    return;
  }

  // Case 3: need to upgrade lane division to fit the click position.
  if (slotsPerBeat > lane.division && slotsPerBeat % lane.division === 0) {
    onSetDivision(beatIndex, instrument, slotsPerBeat);
    onToggleSlot(beatIndex, instrument, displaySlot);
    applyPendingModifiers({
      beatIndex,
      instrument,
      slotIndex: displaySlot,
      pendingArticulations,
      pendingSticking,
      onToggleArticulation,
      onSetSticking,
    });
    return;
  }

  // Case 4: display is coarser than lane division → map back to lane slot.
  const laneSlot = Math.floor((displaySlot * lane.division) / slotsPerBeat);
  onToggleSlot(beatIndex, instrument, laneSlot);
  applyPendingModifiers({
    beatIndex,
    instrument,
    slotIndex: laneSlot,
    pendingArticulations,
    pendingSticking,
    onToggleArticulation,
    onSetSticking,
  });
}

function applyPendingModifiers(args: {
  beatIndex: number;
  instrument: Instrument;
  slotIndex: number;
  pendingArticulations: Set<Articulation>;
  pendingSticking: "R" | "L" | null;
  onToggleArticulation: (
    beatIndex: number,
    instrument: Instrument,
    slotIndex: number,
    articulation: Articulation,
  ) => void;
  onSetSticking: (
    beatIndex: number,
    instrument: Instrument,
    slotIndex: number,
    sticking: "R" | "L" | null,
  ) => void;
}) {
  const {
    beatIndex,
    instrument,
    slotIndex,
    pendingArticulations,
    pendingSticking,
    onToggleArticulation,
    onSetSticking,
  } = args;
  pendingArticulations.forEach((art) =>
    onToggleArticulation(beatIndex, instrument, slotIndex, art),
  );
  if (pendingSticking !== null) {
    onSetSticking(beatIndex, instrument, slotIndex, pendingSticking);
  }
}

function describeHit(hit: Hit): string {
  const parts: string[] = [instrumentLabels[hit.instrument]];
  if (hit.articulations.length) parts.push(hit.articulations.join("+"));
  if (hit.sticking) parts.push(hit.sticking);
  return parts.join(" · ");
}

function renderHitBadge(hit: Hit): React.ReactNode {
  const badges: string[] = [];
  if (hit.articulations.includes("ghost")) badges.push("()");
  if (hit.articulations.includes("accent")) badges.push(">");
  if (hit.articulations.includes("roll")) badges.push("~");
  if (hit.articulations.includes("flam")) badges.push("f");
  if (hit.sticking) badges.push(hit.sticking);
  return (
    <span className="pointer-events-none flex flex-col items-center">
      <span>●</span>
      {badges.length ? (
        <span className="text-[8px] font-bold text-amber-200/80">
          {badges.join("")}
        </span>
      ) : null}
    </span>
  );
}
