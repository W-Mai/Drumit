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
  StaffVoice,
} from "./types";

type PlayheadEngine = "synth" | "sample" | "midi";

interface Props {
  score: Score;
  width?: number;
  selectedBarIndex?: number | null;
  selectionEnd?: number | null;
  onSelectBar?: (index: number, shiftKey?: boolean) => void;
  playCursor?: { barIndex: number; beatIndex: number } | null;
  playheadEngine?: PlayheadEngine;
  /** Pass counter shown on the playhead bar; see DrumChart's prop. */
  repeatPass?: { pass: number; total: number } | null;
  /** Accessible name; defaults to the English string so static exports
   *  render stably outside the i18n context. */
  ariaLabel?: string;
}

const PLAYHEAD_PALETTE: Record<PlayheadEngine, { bar: string; beat: string }> =
  {
    synth: {
      bar: "fill-emerald-200/50 dark:fill-emerald-400/55",
      beat: "fill-emerald-300/40 dark:fill-emerald-400/50",
    },
    sample: {
      bar: "fill-sky-200/50 dark:fill-sky-400/55",
      beat: "fill-sky-300/40 dark:fill-sky-400/50",
    },
    midi: {
      bar: "fill-rose-200/50 dark:fill-rose-400/55",
      beat: "fill-rose-300/40 dark:fill-rose-400/50",
    },
  };

const SYSTEM_PAD_X = 20;
const LEDGER_WIDTH = STAFF_SPACE * 0.8;

export function StaffView({
  score,
  width = 980,
  selectedBarIndex = null,
  selectionEnd = null,
  onSelectBar,
  playCursor,
  playheadEngine = "synth",
  repeatPass = null,
  ariaLabel = "Standard notation drum chart",
}: Props) {
  const selectionLo =
    selectedBarIndex === null
      ? null
      : Math.min(selectedBarIndex, selectionEnd ?? selectedBarIndex);
  const selectionHi =
    selectedBarIndex === null
      ? null
      : Math.max(selectedBarIndex, selectionEnd ?? selectedBarIndex);
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
      aria-label={ariaLabel}
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
          <SystemBars
            system={system}
            selectionLo={selectionLo}
            selectionHi={selectionHi}
            onSelectBar={onSelectBar}
            playCursor={playCursor}
            playheadEngine={playheadEngine}
            repeatPass={repeatPass}
          />
        </g>
      ))}
    </svg>
  );
}

function SystemBars({
  system,
  selectionLo,
  selectionHi,
  onSelectBar,
  playCursor,
  playheadEngine,
  repeatPass,
}: {
  system: StaffSystem;
  selectionLo: number | null;
  selectionHi: number | null;
  onSelectBar?: (index: number, shiftKey?: boolean) => void;
  playCursor?: { barIndex: number; beatIndex: number } | null;
  playheadEngine: PlayheadEngine;
  repeatPass: { pass: number; total: number } | null;
}) {
  const staffY = system.y;
  return (
    <>
      {system.bars.map((bar) => {
        const isPlayhead = playCursor?.barIndex === bar.index;
        return (
          <BarShell
            key={bar.index}
            bar={bar}
            staffY={staffY}
            selected={
              selectionLo !== null &&
              selectionHi !== null &&
              bar.index >= selectionLo &&
              bar.index <= selectionHi
            }
            isPlayhead={isPlayhead}
            playBeatIndex={isPlayhead ? playCursor?.beatIndex : undefined}
            playheadEngine={playheadEngine}
            repeatPass={isPlayhead ? repeatPass : null}
            onSelect={
              onSelectBar
                ? (shiftKey) => onSelectBar(bar.index, shiftKey)
                : undefined
            }
          />
        );
      })}
    </>
  );
}

function BarShell({
  bar,
  staffY,
  selected,
  isPlayhead,
  playBeatIndex,
  playheadEngine,
  repeatPass,
  onSelect,
}: {
  bar: StaffBar;
  staffY: number;
  selected?: boolean;
  isPlayhead?: boolean;
  playBeatIndex?: number;
  playheadEngine: PlayheadEngine;
  repeatPass?: { pass: number; total: number } | null;
  onSelect?: (shiftKey: boolean) => void;
}) {
  const barTop = staffY - STAFF_SPACE * 0.5;
  const barHeight = STAFF_SPACE * 5;
  const beatWidth = bar.width / bar.beats;
  const playhead = PLAYHEAD_PALETTE[playheadEngine];
  return (
    <g
      onClick={onSelect ? (e) => onSelect(e.shiftKey) : undefined}
      style={onSelect ? { cursor: "pointer" } : undefined}
      data-bar-index={bar.index}
      className="group/bar"
    >
      <rect
        x={bar.x}
        y={barTop}
        width={bar.width}
        height={barHeight}
        rx={4}
        data-bar-highlight="true"
        className={
          isPlayhead
            ? playhead.bar
            : selected
              ? "fill-amber-300/45 dark:fill-amber-400/60"
              : "fill-transparent group-hover/bar:fill-stone-200/40 dark:group-hover/bar:fill-stone-100/30"
        }
        strokeWidth={0}
      />
      {isPlayhead && typeof playBeatIndex === "number" ? (
        <rect
          x={bar.x + playBeatIndex * beatWidth}
          y={barTop}
          width={beatWidth}
          height={barHeight}
          className={playhead.beat}
        />
      ) : null}
      {isPlayhead && repeatPass && repeatPass.total > 1 ? (
        <g data-transient-badge="pass">
          <rect
            x={bar.x + bar.width - 30}
            y={staffY - STAFF_SPACE * 2.2}
            width={30}
            height={14}
            rx={3}
            fill="#1c1917"
          />
          <text
            x={bar.x + bar.width - 15}
            y={staffY - STAFF_SPACE * 2.2 + 10}
            textAnchor="middle"
            fill="#fde68a"
            fontSize={9}
            fontWeight={700}
            className="tabular-nums"
          >
            ×{repeatPass.pass}/{repeatPass.total}
          </text>
        </g>
      ) : null}
      {Array.from({ length: bar.beats }, (_, i) => (
        <rect
          key={`beat-overlay-${i}`}
          x={bar.x + i * beatWidth}
          y={barTop}
          width={beatWidth}
          height={barHeight}
          className="fill-transparent"
          data-beat-rect="true"
          data-beat-index={i}
        />
      ))}
      {bar.repeatStart ? (
        <RepeatBarline x={bar.x} staffY={staffY} side="start" />
      ) : null}
      {bar.ending ? (
        <EndingBracket
          x={bar.x + 4}
          y={staffY - STAFF_SPACE * 5.5}
          width={bar.width - 8}
          label={`${bar.ending}.`}
        />
      ) : null}
      {bar.navigationLabel ? (
        <text
          x={bar.x + bar.width - 4}
          y={staffY - STAFF_SPACE * 7}
          textAnchor="end"
          className="fill-stone-900 font-bold italic"
          style={{ fontSize: 12 }}
        >
          {splitGlyphLabel(bar.navigationLabel).map((part, i) =>
            part.kind === "glyph" ? (
              <tspan
                key={i}
                style={{ fontSize: 22, fontStyle: "normal" }}
              >
                {part.text}
              </tspan>
            ) : (
              <tspan key={i}>{part.text}</tspan>
            ),
          )}
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
      {bar.repeatPrevious ? (
        <text
          x={bar.x + bar.width / 2}
          y={staffY + stepToY(0) + STAFF_SPACE * 1.2}
          textAnchor="middle"
          className="fill-stone-900"
          style={{ fontSize: STAFF_SPACE * 3.6 }}
        >
          𝄎
        </text>
      ) : bar.upper.notes.length === 0 && bar.lower.notes.length === 0 ? (
        // No notes in either voice → draw a whole-bar rest (space/half/quarter
        // rests would visually lie about the structure). Appears any time a
        // bar has no hits, whether freshly cleared or loaded as |  |.
        <Rest x={bar.x + bar.width / 2} staffY={staffY} duration="w" />
      ) : (
        <>
          <VoicePaint voice={bar.upper} staffY={staffY} />
          <VoicePaint voice={bar.lower} staffY={staffY} />
        </>
      )}
    </g>
  );
}

function VoicePaint({
  voice,
  staffY,
}: {
  voice: StaffVoice;
  staffY: number;
}) {
  const direction: "up" | "down" = voice.position === "upper" ? "up" : "down";
  // Beam y for a primary run. Standard practice: pin the beam near the
  // anchor note's default stem tip and let other stems in the run vary
  // by a small amount, rather than extending every stem to reach the
  // most-outlying note. For drum parts we anchor to the nearest-to-staff
  // note's default tip so beams sit close to the staff, not far below/above it.
  const stemTipY = new Map<number, number>();
  const beamedNoteIndices = new Set<number>();
  for (const beam of voice.beams) {
    for (let i = beam.start; i <= beam.end; i += 1) beamedNoteIndices.add(i);
    if (beam.level !== 1) continue;
    const tipYs: number[] = [];
    for (let i = beam.start; i <= beam.end; i += 1) {
      const n = voice.notes[i];
      if (direction === "up") {
        const topStep = Math.min(...n.glyphs.map((g) => g.step));
        tipYs.push(staffY + stepToY(topStep) - STEM_LENGTH_SCREEN);
      } else {
        const bottomStep = Math.max(...n.glyphs.map((g) => g.step));
        tipYs.push(staffY + stepToY(bottomStep) + STEM_LENGTH_SCREEN);
      }
    }
    // Horizontal beam constrained so every stem in the run reaches
    // at least the default stem length. Stem-up notes have their tips
    // ABOVE the staff, so beam-y is the MINIMUM (highest point); stem-down
    // the opposite. This guarantees MIN_STEM_LENGTH per stem even if
    // one note's default tip is far from the others.
    const beamY =
      direction === "up" ? Math.min(...tipYs) : Math.max(...tipYs);
    for (let i = beam.start; i <= beam.end; i += 1) stemTipY.set(i, beamY);
  }
  return (
    <g>
      {voice.notes.map((note, i) => (
        <NoteMarker
          key={i}
          note={note}
          staffY={staffY}
          direction={direction}
          suppressFlag={beamedNoteIndices.has(i)}
          stemTipY={stemTipY.get(i)}
        />
      ))}
      {voice.rests.map((rest, i) => (
        <Rest key={`r${i}`} x={rest.x} staffY={staffY} duration={rest.duration} />
      ))}
      {voice.beams.map((beam, i) => (
        <BeamLine
          key={i}
          beam={beam}
          notes={voice.notes}
          direction={direction}
          staffY={staffY}
        />
      ))}
      {voice.tuplets.map((t, i) => (
        <TupletBracket
          key={`t${i}`}
          tuplet={t}
          notes={voice.notes}
          direction={direction}
          staffY={staffY}
        />
      ))}
    </g>
  );
}

// Split navigation labels around SMuFL glyphs (𝄋 Segno, 𝄌 Coda) so
// the renderer can upscale only the glyph chars, which otherwise sit
// far smaller than the surrounding Latin text at the same font-size.
function splitGlyphLabel(label: string): Array<{ kind: "text" | "glyph"; text: string }> {
  const parts: Array<{ kind: "text" | "glyph"; text: string }> = [];
  let buf = "";
  for (const ch of label) {
    const isGlyph = ch === "𝄋" || ch === "𝄌";
    if (isGlyph) {
      if (buf) {
        parts.push({ kind: "text", text: buf });
        buf = "";
      }
      parts.push({ kind: "glyph", text: ch });
    } else {
      buf += ch;
    }
  }
  if (buf) parts.push({ kind: "text", text: buf });
  return parts;
}

// Axially-symmetric noteheads (X, slash, triangle, circle-x) look
// wrong with the stem pinned to a side — the stem should pass through
// the glyph's own center line, per standard percussion engraving.
function hasAxialNotehead(note: StaffNote): boolean {
  return note.glyphs.some(
    (g) =>
      g.head === "x" ||
      g.head === "circle-x" ||
      g.head === "triangle" ||
      g.head === "slash",
  );
}

function NoteMarker({
  note,
  staffY,
  direction,
  suppressFlag,
  stemTipY,
}: {
  note: StaffNote;
  staffY: number;
  direction: "up" | "down";
  suppressFlag?: boolean;
  stemTipY?: number;
}) {
  const steps = note.glyphs.map((g) => g.step);
  const topStep = Math.min(...steps);
  const bottomStep = Math.max(...steps);
  const open = note.duration === "h" || note.duration === "w";
  const stemless = note.duration === "w";
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
          {note.dots && i === 0
            ? Array.from({ length: Math.min(2, note.dots) }).map((_, di) => (
                <circle
                  key={`aug-${di}`}
                  cx={note.x + STAFF_SPACE * 0.9 + di * STAFF_SPACE * 0.4}
                  cy={staffY + stepToY(g.step)}
                  r={STAFF_SPACE * 0.18}
                  className="fill-stone-900"
                />
              ))
            : null}
        </g>
      ))}
      {!stemless ? (
        <NoteheadStem
          x={note.x}
          staffY={staffY}
          topStep={topStep}
          bottomStep={bottomStep}
          direction={direction}
          tipY={stemTipY}
          centerStem={hasAxialNotehead(note)}
        />
      ) : null}
      {!stemless && !suppressFlag ? (
        <NoteheadFlags
          x={note.x}
          staffY={staffY}
          topStep={topStep}
          bottomStep={bottomStep}
          direction={direction}
          count={flagsFor(note.duration)}
          centerStem={hasAxialNotehead(note)}
        />
      ) : null}
      {note.articulations.includes("accent") ? (
        <AccentMark
          x={note.x}
          y={
            direction === "up"
              ? staffY + stepToY(topStep)
              : staffY + stepToY(bottomStep)
          }
          direction={direction}
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
              direction={direction}
            />
          ))
        : null}
      {note.articulations.includes("roll") ? (
        <RollSlashes
          x={note.x}
          staffY={staffY}
          topStep={topStep}
          bottomStep={bottomStep}
          direction={direction}
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
// SMuFL engraving-default proportions for beams.
const BEAM_THICKNESS = STAFF_SPACE * 0.5;
const BEAM_GAP = STAFF_SPACE * 0.3;

function BeamLine({
  beam,
  notes,
  direction,
  staffY,
}: {
  beam: StaffBeam;
  notes: StaffNote[];
  direction: "up" | "down";
  staffY: number;
}) {
  const start = notes[beam.start];
  const end = notes[beam.end];
  if (!start || !end) return null;
  const sign = direction === "up" ? 1 : -1;
  const startOffset = hasAxialNotehead(start) ? 0 : STAFF_SPACE * 0.58 * sign;
  const endOffset = hasAxialNotehead(end) ? 0 : STAFF_SPACE * 0.58 * sign;
  // Horizontal beam: pick a single y line that every note in the run
  // can reach with a ≥STEM_LENGTH_SCREEN stem. For stem-up that's the
  // minimum tip-y (the highest point); for stem-down it's the maximum.
  const tipYs = notes
    .slice(beam.start, beam.end + 1)
    .map((n) => {
      if (direction === "up") {
        const topStep = Math.min(...n.glyphs.map((g) => g.step));
        return staffY + stepToY(topStep) - STEM_LENGTH_SCREEN;
      }
      const bottomStep = Math.max(...n.glyphs.map((g) => g.step));
      return staffY + stepToY(bottomStep) + STEM_LENGTH_SCREEN;
    });
  const beamY = direction === "up" ? Math.min(...tipYs) : Math.max(...tipYs);
  const x1 = start.x + startOffset;
  const x2 = end.x + endOffset;
  const baseDy = direction === "up" ? 1 : -1;
  const dy = (beam.level - 1) * BEAM_GAP * baseDy;
  return (
    <line
      x1={x1}
      x2={x2}
      y1={beamY + dy}
      y2={beamY + dy}
      className="stroke-stone-900"
      strokeWidth={BEAM_THICKNESS}
      strokeLinecap="butt"
    />
  );
}

function TupletBracket({
  tuplet,
  notes,
  direction,
  staffY,
}: {
  tuplet: StaffTupletBracket;
  notes: StaffNote[];
  direction: "up" | "down";
  staffY: number;
}) {
  const start = notes[tuplet.start];
  const end = notes[tuplet.end];
  if (!start || !end) return null;
  const topStepOf = (n: StaffNote) => Math.min(...n.glyphs.map((g) => g.step));
  const bottomStepOf = (n: StaffNote) =>
    Math.max(...n.glyphs.map((g) => g.step));
  const sign = direction === "up" ? -1 : 1;
  const outerY =
    direction === "up"
      ? Math.min(
          ...notes
            .slice(tuplet.start, tuplet.end + 1)
            .map((n) => staffY + stepToY(topStepOf(n)) - STAFF_SPACE * 4.5),
        )
      : Math.max(
          ...notes
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

function LedgerLines({
  x,
  staffY,
  step,
}: {
  x: number;
  staffY: number;
  step: number;
}) {
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
