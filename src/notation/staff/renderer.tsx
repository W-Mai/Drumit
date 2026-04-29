import type { Score } from "../types";
import {
  PERCUSSION_CLEF_WIDTH,
  STAFF_SPACE,
  TIME_SIG_WIDTH,
  flagsFor,
  stepToY,
} from "./geometry";
import {
  Notehead,
  NoteheadFlags,
  NoteheadStem,
  PercussionClef,
  StaffLines,
  TimeSignature,
} from "./glyphs";
import { layoutStaff } from "./layout";
import type { StaffBar, StaffBeam, StaffNote, StaffSystem } from "./types";

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

  const system = layout.systems[0];
  const staffY = system.y;
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

      <StaffLines x={staffLinesX} y={staffY} width={staffLinesWidth} />
      <PercussionClef x={clefX} y={staffY} />
      <TimeSignature
        x={timeSigX + TIME_SIG_WIDTH / 2}
        y={staffY}
        beats={score.meter.beats}
        beatUnit={score.meter.beatUnit}
      />

      <SystemNotes system={system} />
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
      {bar.notes.map((note, i) => (
        <NoteMarker
          key={i}
          note={note}
          staffY={staffY}
          suppressFlag={beamedNoteIndices.has(i)}
        />
      ))}
      {bar.beams.map((beam, i) => (
        <BeamLine key={i} beam={beam} bar={bar} staffY={staffY} />
      ))}
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
