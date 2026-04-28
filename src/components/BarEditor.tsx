import { useMemo } from "react";
import { serializeBar } from "../notation/serialize";
import { cn } from "../lib/utils";
import { instrumentLabels } from "../notation/instruments";
import type {
  Articulation,
  Bar,
  Instrument,
  RepeatHint,
} from "../notation/types";

interface Props {
  bar: Bar;
  barIndex: number; // global
  totalBars: number;
  beatsPerBar: number;
  onChange: (update: (bar: Bar) => void) => void;
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

const CYMBAL_INSTRUMENTS: Instrument[] = [
  "hihatClosed",
  "hihatOpen",
  "hihatHalfOpen",
  "hihatFoot",
  "ride",
  "rideBell",
  "crashLeft",
  "crashRight",
];
const DRUM_INSTRUMENTS: Instrument[] = [
  "snare",
  "tomHigh",
  "tomMid",
  "floorTom",
  "kick",
];

const DIVISION_OPTIONS = [1, 2, 3, 4, 6, 8] as const;

export function BarEditor({
  bar,
  barIndex,
  totalBars,
  beatsPerBar,
  onChange: _onChange,
  onSetRepeat,
  onInsertAfter,
  onDelete,
  onSetDivision,
  onToggleSlot,
  onToggleArticulation,
  onSetSticking,
}: Props) {
  // Suppress unused warning; kept in signature for future generic edits.
  void _onChange;
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
          This bar repeats the previous one.
          <br />
          Click <b>Pattern</b> above to add content.
        </div>
      ) : (
        <BeatGrid
          bar={bar}
          beatsPerBar={beatsPerBar}
          onSetDivision={onSetDivision}
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

function BeatGrid({
  bar,
  beatsPerBar,
  onSetDivision,
  onToggleSlot,
  onToggleArticulation,
  onSetSticking,
}: {
  bar: Bar;
  beatsPerBar: number;
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
  // Collect instruments currently used in the bar (keeps user's existing lanes
  // visible even if all slots in a beat happen to be empty).
  const presentInstruments = new Set<Instrument>();
  bar.beats.forEach((beat) =>
    beat.lanes.forEach((l) => presentInstruments.add(l.instrument)),
  );
  if (presentInstruments.size === 0) {
    // Start the user with a sensible default set.
    ["hihatClosed", "snare", "kick"].forEach((i) =>
      presentInstruments.add(i as Instrument),
    );
  }

  const cymbalsUsed = CYMBAL_INSTRUMENTS.filter((i) => presentInstruments.has(i));
  const drumsUsed = DRUM_INSTRUMENTS.filter((i) => presentInstruments.has(i));

  const activeLists = [
    { title: "Cymbals", instruments: cymbalsUsed, empty: CYMBAL_INSTRUMENTS },
    { title: "Drums", instruments: drumsUsed, empty: DRUM_INSTRUMENTS },
  ];

  return (
    <div className="flex flex-col gap-6">
      {activeLists.map((group) => (
        <section key={group.title}>
          <h3 className="mb-2 text-xs font-extrabold tracking-wide text-stone-600 uppercase">
            {group.title}
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr>
                  <th className="w-28 text-left font-normal text-stone-400">
                    Instrument
                  </th>
                  {Array.from({ length: beatsPerBar }, (_, i) => (
                    <th
                      key={i}
                      className="min-w-[120px] font-normal text-stone-400"
                    >
                      Beat {i + 1}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {group.instruments.map((instrument) => (
                  <LaneRow
                    key={instrument}
                    bar={bar}
                    beatsPerBar={beatsPerBar}
                    instrument={instrument}
                    onSetDivision={onSetDivision}
                    onToggleSlot={onToggleSlot}
                    onToggleArticulation={onToggleArticulation}
                    onSetSticking={onSetSticking}
                  />
                ))}
                <tr>
                  <td className="py-1">
                    <AddInstrumentSelect
                      options={group.empty.filter(
                        (i) => !group.instruments.includes(i),
                      )}
                      onPick={(instrument) => onSetDivision(0, instrument, 1)}
                    />
                  </td>
                  <td colSpan={beatsPerBar} />
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}

function LaneRow({
  bar,
  beatsPerBar,
  instrument,
  onSetDivision,
  onToggleSlot,
  onToggleArticulation,
  onSetSticking,
}: {
  bar: Bar;
  beatsPerBar: number;
  instrument: Instrument;
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
    <tr>
      <td className="py-2 font-semibold text-stone-700">
        {instrumentLabels[instrument]}
      </td>
      {Array.from({ length: beatsPerBar }, (_, beatIndex) => {
        const beat = bar.beats[beatIndex];
        const lane = beat?.lanes.find((l) => l.instrument === instrument);
        const division = lane?.division ?? 1;

        return (
          <td key={beatIndex} className="border-l border-stone-200 p-1.5">
            <div className="flex items-center gap-1">
              <select
                value={division}
                onChange={(e) =>
                  onSetDivision(
                    beatIndex,
                    instrument,
                    Number.parseInt(e.target.value, 10),
                  )
                }
                className="rounded border border-stone-200 bg-white px-1 text-[10px]"
                title="Subdivision"
              >
                {DIVISION_OPTIONS.map((d) => (
                  <option key={d} value={d}>
                    /{d}
                  </option>
                ))}
              </select>
              <div className="flex flex-1 gap-0.5">
                {Array.from({ length: division }, (_, slotIndex) => {
                  const hit = lane?.slots[slotIndex] ?? null;
                  return (
                    <SlotButton
                      key={slotIndex}
                      hit={hit}
                      onToggle={() =>
                        onToggleSlot(beatIndex, instrument, slotIndex)
                      }
                      onToggleArticulation={(art) =>
                        onToggleArticulation(
                          beatIndex,
                          instrument,
                          slotIndex,
                          art,
                        )
                      }
                      onSetSticking={(st) =>
                        onSetSticking(beatIndex, instrument, slotIndex, st)
                      }
                    />
                  );
                })}
              </div>
            </div>
          </td>
        );
      })}
    </tr>
  );
}

function SlotButton({
  hit,
  onToggle,
  onToggleArticulation,
  onSetSticking,
}: {
  hit: import("../notation/types").Hit | null;
  onToggle: () => void;
  onToggleArticulation: (art: Articulation) => void;
  onSetSticking: (sticking: "R" | "L" | null) => void;
}) {
  const active = hit !== null;
  return (
    <div className="flex flex-1 flex-col items-center gap-0.5">
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "flex h-7 w-full items-center justify-center rounded border text-[11px] font-bold transition",
          active
            ? "border-stone-900 bg-stone-900 text-amber-100"
            : "border-stone-200 bg-white text-stone-300 hover:border-stone-500",
        )}
      >
        {active ? "●" : "·"}
      </button>
      {active ? (
        <div className="flex w-full flex-wrap items-center justify-center gap-0.5 text-[9px]">
          <button
            type="button"
            onClick={() => onToggleArticulation("accent")}
            className={cn(
              "rounded px-1 font-bold",
              hit!.articulations.includes("accent")
                ? "bg-amber-200 text-stone-900"
                : "text-stone-400 hover:bg-stone-100",
            )}
          >
            &gt;
          </button>
          <button
            type="button"
            onClick={() => onToggleArticulation("ghost")}
            className={cn(
              "rounded px-1 font-bold",
              hit!.articulations.includes("ghost")
                ? "bg-amber-200 text-stone-900"
                : "text-stone-400 hover:bg-stone-100",
            )}
          >
            ( )
          </button>
          <button
            type="button"
            onClick={() => onToggleArticulation("roll")}
            className={cn(
              "rounded px-1 font-bold",
              hit!.articulations.includes("roll")
                ? "bg-amber-200 text-stone-900"
                : "text-stone-400 hover:bg-stone-100",
            )}
          >
            ~
          </button>
          <button
            type="button"
            onClick={() => onToggleArticulation("flam")}
            className={cn(
              "rounded px-1 font-bold",
              hit!.articulations.includes("flam")
                ? "bg-amber-200 text-stone-900"
                : "text-stone-400 hover:bg-stone-100",
            )}
          >
            f
          </button>
          <button
            type="button"
            onClick={() =>
              onSetSticking(
                hit!.sticking === "R"
                  ? "L"
                  : hit!.sticking === "L"
                    ? null
                    : "R",
              )
            }
            className={cn(
              "rounded px-1 font-bold",
              hit!.sticking
                ? "bg-sky-200 text-stone-900"
                : "text-stone-400 hover:bg-stone-100",
            )}
          >
            {hit!.sticking ?? "R/L"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function AddInstrumentSelect({
  options,
  onPick,
}: {
  options: Instrument[];
  onPick: (instrument: Instrument) => void;
}) {
  if (!options.length) return null;
  return (
    <select
      className="rounded border border-stone-200 bg-white px-1 py-0.5 text-[10px] text-stone-600"
      value=""
      onChange={(e) => {
        if (e.target.value) onPick(e.target.value as Instrument);
        e.currentTarget.value = "";
      }}
    >
      <option value="" disabled>
        + Add instrument…
      </option>
      {options.map((i) => (
        <option key={i} value={i}>
          {instrumentLabels[i]}
        </option>
      ))}
    </select>
  );
}
