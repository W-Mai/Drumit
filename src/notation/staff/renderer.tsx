import type { Score } from "../types";
import {
  PERCUSSION_CLEF_WIDTH,
  STAFF_SPACE,
  TIME_SIG_WIDTH,
  flagsFor,
  stepToY,
} from "./geometry";
import {
  AccentMark,
  ChokeMark,
  EndingBracket,
  FlamGrace,
  GhostParens,
  Notehead,
  NoteheadFlags,
  NoteheadStem,
  PercussionClef,
  RepeatBarline,
  Rest,
  RollSlashes,
  StaffLines,
  TimeSignature,
} from "./glyphs";
import { layoutStaff } from "./layout";
import type {
  StaffBar,
  StaffBeam,
  StaffNote,
  StaffSystem,
  StaffTupletBracket,
} from "./types";

interface Props {
  score: Score;
  width?: number;
}

const SYSTEM_PAD_X = 20;
const LEDGER_WIDTH = STAFF_SPACE * 0.8;

export function StaffView({ score, width = 980 }: Props) {
  const actualWidth = Math.max(400, width);
  const layout = layoutStaff(score, { width: actualWidth });
  const height = layout.height;

  const clefX = SYSTEM_PAD_X + 4;
  const timeSigX = clefX + PERCUSSION_CLEF_WIDTH + 12;
  const staffLinesX = SYSTEM_PAD_X;
  const staffLinesWidth = actualWidth - SYSTEM_PAD_X * 2;

  return (
    <svg
      viewBox={`0 0 ${actualWidth} ${height}`}
      className="h-auto w-full"
      role="img"
      aria-label="Standard notation drum chart"
    >
      <rect
        x={0}
        y={0}
        width={actualWidth}
        height={height}
        rx={16}
        className="fill-stone-50"
      />

      <g>
        <text
          x={24}
          y={22}
          className="fill-stone-900 font-bold"
          style={{ fontSize: 16 }}
        >
          {score.title}
        </text>
        <text
          x={actualWidth - 24}
          y={22}
          textAnchor="end"
          className="fill-stone-500"
          style={{ fontSize: 12 }}
        >
          {layout.meter}
          {layout.tempo ? `  ${layout.tempo}` : ""}
        </text>
      </g>

      {layout.systems.map((system, index) => (
        <g key={index}>
          <StaffLines x={staffLinesX} y={system.y} width={staffLinesWidth} />
          {index === 0 ? (
            <>
              <PercussionClef x={clefX} y={system.y} />
              <TimeSignature
                x={timeSigX + TIME_SIG_WIDTH / 2}
                y={system.y}
                beats={score.meter.beats}
                beatUnit={score.meter.beatUnit}
              />
            </>
          ) : (
            <PercussionClef x={clefX} y={system.y} />
          )}
          <SystemNotes system={system} />
        </g>
      ))}
    </svg>
  );
}

function SystemNotes({ system }: { system: StaffSystem }) {
  const staffY = system.y;
  return (
    <>
      {system.bars.map((bar) => (
        <BarNotes key={bar.index} bar={bar} staffY={staffY} />
      ))}
    </>
  );
}

function BarNotes({ bar, staffY }: { bar: StaffBar; staffY: number }) {
  const beamedNoteIndices = new Set<number>();
  for (const beam of bar.beams) {
    for (let i = beam.start; i <= beam.end; i += 1) beamedNoteIndices.add(i);
  }
  return (
    <g>
      {bar.repeatStart ? (
        <RepeatBarline x={bar.x} staffY={staffY} side="start" />
      ) : null}
      {bar.ending ? (
        <EndingBracket
          x={bar.x + 4}
          y={staffY - STAFF_SPACE * 1.8}
          width={bar.width - 8}
          label={`${bar.ending}.`}
        />
      ) : null}
      {bar.navigationLabel ? (
        <text
          x={bar.x + bar.width - 4}
          y={staffY - 4}
          textAnchor="end"
          className="fill-stone-900 font-bold italic"
          style={{ fontSize: 12 }}
        >
          {bar.navigationLabel}
        </text>
      ) : null}
      {bar.endBarline === "repeat-end" ? (
        <RepeatBarline
          x={bar.barlineX}
          staffY={staffY}
          side="end"
          times={bar.repeatTimes}
        />
      ) : (
        <line
          x1={bar.barlineX}
          x2={bar.barlineX}
          y1={staffY}
          y2={staffY + STAFF_SPACE * 4}
          className="stroke-stone-900"
          strokeWidth={1}
        />
      )}
      {bar.notes.map((note, i) => (
        <NoteMarker
          key={i}
          note={note}
          staffY={staffY}
          suppressFlag={beamedNoteIndices.has(i)}
        />
      ))}
      {bar.rests.map((rest, i) => (
        <Rest key={`r${i}`} x={rest.x} staffY={staffY} duration={rest.duration} />
      ))}
      {bar.beams.map((beam, i) => (
        <BeamLine key={i} beam={beam} bar={bar} staffY={staffY} />
      ))}
      {bar.tuplets.map((t, i) => (
        <TupletBracket key={`t${i}`} tuplet={t} bar={bar} staffY={staffY} />
      ))}
    </g>
  );
}

function TupletBracket({
  tuplet,
  bar,
  staffY,
}: {
  tuplet: StaffTupletBracket;
  bar: StaffBar;
  staffY: number;
}) {
  const start = bar.notes[tuplet.start];
  const end = bar.notes[tuplet.end];
  if (!start || !end) return null;
  // Place the bracket above stem-up notes and below stem-down notes.
  // A run should already be homogeneous in stem direction since they
  // share a beat, but fall back to "up" if unclear.
  const direction = start.stem ?? "up";
  const topStepOf = (n: StaffNote) => Math.min(...n.glyphs.map((g) => g.step));
  const bottomStepOf = (n: StaffNote) =>
    Math.max(...n.glyphs.map((g) => g.step));
  const sign = direction === "up" ? -1 : 1;
  const outerY =
    direction === "up"
      ? Math.min(
          ...bar.notes
            .slice(tuplet.start, tuplet.end + 1)
            .map((n) => staffY + stepToY(topStepOf(n)) - STAFF_SPACE * 4.5),
        )
      : Math.max(
          ...bar.notes
            .slice(tuplet.start, tuplet.end + 1)
            .map((n) => staffY + stepToY(bottomStepOf(n)) + STAFF_SPACE * 4.5),
        );
  const leftX = start.x;
  const rightX = end.x;
  const midX = (leftX + rightX) / 2;
  const tickLen = STAFF_SPACE * 0.6;
  const gapHalf = STAFF_SPACE * 0.8;
  return (
    <g>
      <line
        x1={leftX}
        x2={midX - gapHalf}
        y1={outerY}
        y2={outerY}
        className="stroke-stone-700"
        strokeWidth={1}
      />
      <line
        x1={midX + gapHalf}
        x2={rightX}
        y1={outerY}
        y2={outerY}
        className="stroke-stone-700"
        strokeWidth={1}
      />
      <line
        x1={leftX}
        x2={leftX}
        y1={outerY}
        y2={outerY - sign * tickLen}
        className="stroke-stone-700"
        strokeWidth={1}
      />
      <line
        x1={rightX}
        x2={rightX}
        y1={outerY}
        y2={outerY - sign * tickLen}
        className="stroke-stone-700"
        strokeWidth={1}
      />
      <text
        x={midX}
        y={outerY + STAFF_SPACE * 0.3}
        textAnchor="middle"
        className="fill-stone-900 font-bold italic"
        style={{ fontSize: STAFF_SPACE * 1.1 }}
      >
        {tuplet.count}
      </text>
    </g>
  );
}

function NoteMarker({
  note,
  staffY,
  suppressFlag,
}: {
  note: StaffNote;
  staffY: number;
  suppressFlag?: boolean;
}) {
  const steps = note.glyphs.map((g) => g.step);
  const topStep = Math.min(...steps);
  const bottomStep = Math.max(...steps);
  const open = note.duration === "h" || note.duration === "w";
  return (
    <g>
      {note.glyphs.map((g, i) => (
        <g key={i}>
          <LedgerLines x={note.x} staffY={staffY} step={g.step} />
          <Notehead
            x={note.x}
            staffY={staffY}
            step={g.step}
            shape={g.head}
            open={open}
          />
        </g>
      ))}
      {note.stem ? (
        <NoteheadStem
          x={note.x}
          staffY={staffY}
          topStep={topStep}
          bottomStep={bottomStep}
          direction={note.stem}
        />
      ) : null}
      {note.stem && !suppressFlag ? (
        <NoteheadFlags
          x={note.x}
          staffY={staffY}
          topStep={topStep}
          bottomStep={bottomStep}
          direction={note.stem}
          count={flagsFor(note.duration)}
        />
      ) : null}
      {note.articulations.includes("accent") ? (
        <AccentMark
          x={note.x}
          y={
            note.stem === "up"
              ? staffY + stepToY(topStep)
              : staffY + stepToY(bottomStep)
          }
          direction={note.stem === "up" ? "up" : "down"}
        />
      ) : null}
      {note.articulations.includes("ghost")
        ? note.glyphs.map((g, i) => (
            <GhostParens
              key={`gh-${i}`}
              x={note.x}
              y={staffY + stepToY(g.step)}
            />
          ))
        : null}
      {note.articulations.includes("flam")
        ? note.glyphs.map((g, i) => (
            <FlamGrace
              key={`fl-${i}`}
              x={note.x}
              staffY={staffY}
              step={g.step}
              direction={note.stem === "up" ? "up" : "down"}
            />
          ))
        : null}
      {note.articulations.includes("roll") && note.stem ? (
        <RollSlashes
          x={note.x}
          staffY={staffY}
          topStep={topStep}
          bottomStep={bottomStep}
          direction={note.stem}
          count={2}
        />
      ) : null}
      {note.articulations.includes("choke")
        ? note.glyphs.map((g, i) => (
            <ChokeMark
              key={`ch-${i}`}
              x={note.x}
              y={staffY + stepToY(g.step) - STAFF_SPACE * 1.6}
            />
          ))
        : null}
      {note.sticking ? (
        <text
          x={note.x}
          y={staffY + STAFF_SPACE * 6.2}
          textAnchor="middle"
          className="fill-stone-600 font-bold italic"
          style={{ fontSize: 10 }}
        >
          {note.sticking}
        </text>
      ) : null}
    </g>
  );
}

const STEM_LENGTH_SCREEN = STAFF_SPACE * 3.5;
const BEAM_THICKNESS = STAFF_SPACE * 0.55;
const BEAM_GAP = STAFF_SPACE * 0.4;

function BeamLine({
  beam,
  bar,
  staffY,
}: {
  beam: StaffBeam;
  bar: StaffBar;
  staffY: number;
}) {
  const start = bar.notes[beam.start];
  const end = bar.notes[beam.end];
  if (!start || !end || !start.stem) return null;
  const direction = start.stem;
  const stemXOffset =
    direction === "up"
      ? STAFF_SPACE * 0.58
      : -STAFF_SPACE * 0.58;
  const topStepOf = (n: StaffNote) =>
    Math.min(...n.glyphs.map((g) => g.step));
  const bottomStepOf = (n: StaffNote) =>
    Math.max(...n.glyphs.map((g) => g.step));
  const tipY = (n: StaffNote) =>
    direction === "up"
      ? staffY + stepToY(topStepOf(n)) - STEM_LENGTH_SCREEN
      : staffY + stepToY(bottomStepOf(n)) + STEM_LENGTH_SCREEN;
  const x1 = start.x + stemXOffset;
  const x2 = end.x + stemXOffset;
  const y1 = tipY(start);
  const y2 = tipY(end);
  const beams: React.ReactNode[] = [];
  for (let i = 0; i < beam.depth; i += 1) {
    const dy = direction === "up" ? i * BEAM_GAP : -i * BEAM_GAP;
    beams.push(
      <line
        key={i}
        x1={x1}
        x2={x2}
        y1={y1 + dy}
        y2={y2 + dy}
        className="stroke-stone-900"
        strokeWidth={BEAM_THICKNESS}
        strokeLinecap="butt"
      />,
    );
  }
  return <g>{beams}</g>;
}

/**
 * Lines extending the staff above or below for notes that fall outside
 * the five-line range. Each ledger is a short horizontal segment on the
 * staff-line positions between the note and the staff.
 */
function LedgerLines({
  x,
  staffY,
  step,
}: {
  x: number;
  staffY: number;
  step: number;
}) {
  // Staff lines live at even integer steps from -4 to 4.
  const needLedgers: number[] = [];
  if (step >= 5) {
    for (let s = 6; s <= step; s += 2) needLedgers.push(s);
  } else if (step <= -5) {
    for (let s = -6; s >= step; s -= 2) needLedgers.push(s);
  }
  if (needLedgers.length === 0) return null;
  return (
    <g>
      {needLedgers.map((s) => (
        <line
          key={s}
          x1={x - LEDGER_WIDTH}
          x2={x + LEDGER_WIDTH}
          y1={staffY + stepToY(s)}
          y2={staffY + stepToY(s)}
          className="stroke-stone-700"
          strokeWidth={1}
        />
      ))}
    </g>
  );
}
