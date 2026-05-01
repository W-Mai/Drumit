import type { ReactNode } from "react";
import { STAFF_SPACE, stepToY } from "./geometry";
import type { NoteheadShape } from "./types";

interface StaffLinesProps {
  x: number;
  y: number;
  width: number;
}

export function StaffLines({ x, y, width }: StaffLinesProps): ReactNode {
  const lines = [];
  for (let i = 0; i < 5; i += 1) {
    const ly = y + i * STAFF_SPACE;
    lines.push(
      <line
        key={i}
        x1={x}
        x2={x + width}
        y1={ly}
        y2={ly}
        className="stroke-stone-700"
        strokeWidth={1}
      />,
    );
  }
  return <g>{lines}</g>;
}

/** Two vertical bars centred on the middle line. Matches DrumChart's hand-drawn feel. */
export function PercussionClef({
  x,
  y,
}: {
  x: number;
  y: number;
}): ReactNode {
  const top = y + STAFF_SPACE * 1;
  const bottom = y + STAFF_SPACE * 3;
  const spacing = STAFF_SPACE * 0.55;
  return (
    <g>
      <line
        x1={x}
        x2={x}
        y1={top}
        y2={bottom}
        className="stroke-stone-900"
        strokeWidth={4}
        strokeLinecap="butt"
      />
      <line
        x1={x + spacing}
        x2={x + spacing}
        y1={top}
        y2={bottom}
        className="stroke-stone-900"
        strokeWidth={4}
        strokeLinecap="butt"
      />
    </g>
  );
}

/** Small grace notehead to the left of the main note, with a slash
 *  through its stem — the standard flam glyph. */
export function FlamGrace({
  x,
  staffY,
  step,
  direction,
}: {
  x: number;
  staffY: number;
  step: number;
  direction: "up" | "down";
}): ReactNode {
  const graceX = x - STAFF_SPACE * 1.4;
  const graceY = staffY + stepToY(step);
  const rx = STAFF_SPACE * 0.3;
  const ry = STAFF_SPACE * 0.22;
  const stemLen = STAFF_SPACE * 2.2;
  const sign = direction === "up" ? -1 : 1;
  const stemX = graceX + (direction === "up" ? rx : -rx);
  const stemTipY = graceY + sign * stemLen;
  return (
    <g>
      <ellipse
        cx={graceX}
        cy={graceY}
        rx={rx}
        ry={ry}
        className="fill-stone-900"
      />
      <line
        x1={stemX}
        x2={stemX}
        y1={graceY}
        y2={stemTipY}
        className="stroke-stone-900"
        strokeWidth={1}
      />
      <line
        x1={stemX - STAFF_SPACE * 0.55}
        x2={stemX + STAFF_SPACE * 0.55}
        y1={stemTipY + sign * STAFF_SPACE * 0.3}
        y2={stemTipY - sign * STAFF_SPACE * 0.3}
        className="stroke-stone-900"
        strokeWidth={1}
        strokeLinecap="round"
      />
    </g>
  );
}

/** Tremolo slashes across the stem for a drum roll. */
export function RollSlashes({
  x,
  staffY,
  topStep,
  bottomStep,
  direction,
  count = 2,
}: {
  x: number;
  staffY: number;
  topStep: number;
  bottomStep: number;
  direction: "up" | "down";
  count?: number;
}): ReactNode {
  const stemX = direction === "up" ? x + STAFF_SPACE * 0.58 : x - STAFF_SPACE * 0.58;
  const baseY =
    direction === "up"
      ? staffY + stepToY(topStep) - STAFF_SPACE * 1.6
      : staffY + stepToY(bottomStep) + STAFF_SPACE * 1.6;
  const slashes: ReactNode[] = [];
  for (let i = 0; i < count; i += 1) {
    const y = baseY + i * STAFF_SPACE * 0.55 * (direction === "up" ? -1 : 1);
    slashes.push(
      <line
        key={i}
        x1={stemX - STAFF_SPACE * 0.45}
        x2={stemX + STAFF_SPACE * 0.45}
        y1={y + STAFF_SPACE * 0.25}
        y2={y - STAFF_SPACE * 0.25}
        className="stroke-stone-900"
        strokeWidth={1.8}
        strokeLinecap="round"
      />,
    );
  }
  return <g>{slashes}</g>;
}

/** Small `+` above a cymbal note to indicate a choke / dampen. */
export function ChokeMark({
  x,
  y,
}: {
  x: number;
  y: number;
}): ReactNode {
  const r = STAFF_SPACE * 0.35;
  return (
    <g>
      <line
        x1={x - r}
        x2={x + r}
        y1={y}
        y2={y}
        className="stroke-stone-900"
        strokeWidth={1.4}
        strokeLinecap="round"
      />
      <line
        x1={x}
        x2={x}
        y1={y - r}
        y2={y + r}
        className="stroke-stone-900"
        strokeWidth={1.4}
        strokeLinecap="round"
      />
    </g>
  );
}

/** Accent wedge `>` above or below a notehead. */
export function AccentMark({
  x,
  y,
  direction,
}: {
  x: number;
  y: number;
  direction: "up" | "down";
}): ReactNode {
  const sign = direction === "up" ? -1 : 1;
  const tipY = y + sign * STAFF_SPACE * 1.6;
  const r = STAFF_SPACE * 0.55;
  return (
    <path
      d={`M ${x - r} ${tipY - sign * r * 0.8} L ${x + r} ${tipY} L ${x - r} ${tipY + sign * r * 0.8}`}
      className="fill-none stroke-stone-900"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}

/** Ghost note parentheses hugging a notehead. */
export function GhostParens({
  x,
  y,
}: {
  x: number;
  y: number;
}): ReactNode {
  const dx = STAFF_SPACE * 0.68;
  const dy = STAFF_SPACE * 0.5;
  return (
    <g>
      <path
        d={`M ${x - dx} ${y - dy} Q ${x - dx * 1.5} ${y} ${x - dx} ${y + dy}`}
        className="fill-none stroke-stone-700"
        strokeWidth={1.2}
        strokeLinecap="round"
      />
      <path
        d={`M ${x + dx} ${y - dy} Q ${x + dx * 1.5} ${y} ${x + dx} ${y + dy}`}
        className="fill-none stroke-stone-700"
        strokeWidth={1.2}
        strokeLinecap="round"
      />
    </g>
  );
}

/** First / second ending bracket above a bar. */
export function EndingBracket({
  x,
  y,
  width,
  label,
}: {
  x: number;
  y: number;
  width: number;
  label: string;
}): ReactNode {
  const tickLen = STAFF_SPACE * 0.8;
  return (
    <g>
      <line
        x1={x}
        x2={x + width}
        y1={y}
        y2={y}
        className="stroke-stone-700"
        strokeWidth={1.2}
      />
      <line
        x1={x}
        x2={x}
        y1={y}
        y2={y + tickLen}
        className="stroke-stone-700"
        strokeWidth={1.2}
      />
      <text
        x={x + 4}
        y={y + STAFF_SPACE * 1.15}
        className="fill-stone-900 font-bold italic"
        style={{ fontSize: 11 }}
      >
        {label}
      </text>
    </g>
  );
}

/**
 * Repeat barline: a thin line + a thick line + two dots on the mid-third
 * of the staff. `side="start"` paints thick-thin with dots on the right,
 * `side="end"` is the mirror (dots-thin-thick).
 */
export function RepeatBarline({
  x,
  staffY,
  side,
  times,
}: {
  x: number;
  staffY: number;
  side: "start" | "end";
  times?: number;
}): ReactNode {
  const top = staffY;
  const bottom = staffY + STAFF_SPACE * 4;
  const thin = 1.2;
  const thick = 4;
  const gap = 3;
  const dotOffset = 6;
  const dotTopY = staffY + stepToY(-1);
  const dotBotY = staffY + stepToY(1);

  const isStart = side === "start";
  const thickX = isStart ? x + thick / 2 : x - thick / 2;
  const thinX = isStart ? thickX + thick / 2 + gap : thickX - thick / 2 - gap;
  const dotsX = isStart ? thinX + dotOffset : thinX - dotOffset;

  return (
    <g>
      <line
        x1={thickX}
        x2={thickX}
        y1={top}
        y2={bottom}
        className="stroke-stone-900"
        strokeWidth={thick}
        strokeLinecap="butt"
      />
      <line
        x1={thinX}
        x2={thinX}
        y1={top}
        y2={bottom}
        className="stroke-stone-900"
        strokeWidth={thin}
      />
      <circle cx={dotsX} cy={dotTopY} r={1.5} className="fill-stone-900" />
      <circle cx={dotsX} cy={dotBotY} r={1.5} className="fill-stone-900" />
      {side === "end" && times && times > 2 ? (
        <text
          x={x - thick / 2 - gap - dotOffset - 10}
          y={top - 4}
          textAnchor="end"
          className="fill-stone-700 font-bold italic"
          style={{ fontSize: 11 }}
        >
          ×{times}
        </text>
      ) : null}
    </g>
  );
}

interface NoteheadProps {
  x: number;
  staffY: number;
  step: number;
  shape: NoteheadShape;
  /** Filled heads (solid) are used for quarter notes and shorter; half and
   *  whole notes use an open head. Callers decide based on Duration. */
  open?: boolean;
}

const NOTEHEAD_RX = STAFF_SPACE * 0.58;
const NOTEHEAD_RY = STAFF_SPACE * 0.42;

/**
 * One notehead centred at (x, staffY + stepToY(step)). Shape follows the
 * drum map (solid/open ellipse, x-cross, circled x, triangle, slash).
 */
export function Notehead({
  x,
  staffY,
  step,
  shape,
  open = false,
}: NoteheadProps): ReactNode {
  const y = staffY + stepToY(step);
  if (shape === "x") {
    const r = STAFF_SPACE * 0.42;
    return (
      <g>
        <line
          x1={x - r}
          x2={x + r}
          y1={y - r}
          y2={y + r}
          className="stroke-stone-900"
          strokeWidth={1.6}
          strokeLinecap="round"
        />
        <line
          x1={x - r}
          x2={x + r}
          y1={y + r}
          y2={y - r}
          className="stroke-stone-900"
          strokeWidth={1.6}
          strokeLinecap="round"
        />
      </g>
    );
  }
  if (shape === "circle-x") {
    const r = STAFF_SPACE * 0.48;
    return (
      <g>
        <circle
          cx={x}
          cy={y}
          r={r}
          className="fill-none stroke-stone-900"
          strokeWidth={1.2}
        />
        <line
          x1={x - r * 0.6}
          x2={x + r * 0.6}
          y1={y - r * 0.6}
          y2={y + r * 0.6}
          className="stroke-stone-900"
          strokeWidth={1.4}
          strokeLinecap="round"
        />
        <line
          x1={x - r * 0.6}
          x2={x + r * 0.6}
          y1={y + r * 0.6}
          y2={y - r * 0.6}
          className="stroke-stone-900"
          strokeWidth={1.4}
          strokeLinecap="round"
        />
      </g>
    );
  }
  if (shape === "triangle") {
    const r = STAFF_SPACE * 0.55;
    return (
      <polygon
        points={`${x},${y - r} ${x + r},${y + r * 0.8} ${x - r},${y + r * 0.8}`}
        className="fill-stone-900"
      />
    );
  }
  if (shape === "slash") {
    const r = STAFF_SPACE * 0.6;
    return (
      <line
        x1={x - r}
        x2={x + r}
        y1={y + r}
        y2={y - r}
        className="stroke-stone-900"
        strokeWidth={2.5}
        strokeLinecap="round"
      />
    );
  }
  // solid / open
  return (
    <ellipse
      cx={x}
      cy={y}
      rx={NOTEHEAD_RX}
      ry={NOTEHEAD_RY}
      className={
        shape === "open" || open
          ? "fill-none stroke-stone-900"
          : "fill-stone-900"
      }
      strokeWidth={1.4}
    />
  );
}

export function TimeSignature({
  x,
  y,
  beats,
  beatUnit,
}: {
  x: number;
  y: number;
  beats: number;
  beatUnit: number;
}): ReactNode {
  const numeratorY = y + STAFF_SPACE * 1.5 + 1;
  const denomY = y + STAFF_SPACE * 3.5 + 1;
  return (
    <g>
      <text
        x={x}
        y={numeratorY}
        textAnchor="middle"
        className="fill-stone-900 font-serif font-black"
        style={{ fontSize: STAFF_SPACE * 2.2 }}
      >
        {beats}
      </text>
      <text
        x={x}
        y={denomY}
        textAnchor="middle"
        className="fill-stone-900 font-serif font-black"
        style={{ fontSize: STAFF_SPACE * 2.2 }}
      >
        {beatUnit}
      </text>
    </g>
  );
}

/**
 * Hand-drawn rests for each duration. Positions follow standard
 * conventions (whole rest hangs from line 4, half rest sits on line 3).
 *
 * - whole / half: a small filled rectangle on the appropriate line
 * - quarter:      a zig-zag "squiggle" centred on the middle of the staff
 * - 8th / 16th:   vertical stroke + 1 or 2 small flags at the top
 */
export function Rest({
  x,
  staffY,
  duration,
}: {
  x: number;
  staffY: number;
  duration: import("./types").Duration;
}): ReactNode {
  if (duration === "w") {
    const y = staffY + stepToY(-2) - STAFF_SPACE * 0.18;
    return (
      <rect
        x={x - STAFF_SPACE * 0.55}
        y={y}
        width={STAFF_SPACE * 1.1}
        height={STAFF_SPACE * 0.5}
        className="fill-stone-900"
      />
    );
  }
  if (duration === "h") {
    const y = staffY + stepToY(0) - STAFF_SPACE * 0.5;
    return (
      <rect
        x={x - STAFF_SPACE * 0.55}
        y={y}
        width={STAFF_SPACE * 1.1}
        height={STAFF_SPACE * 0.5}
        className="fill-stone-900"
      />
    );
  }
  if (duration === "q") {
    // Unicode musical symbol U+1D13D (QUARTER REST). Text rendering gives
    // the correct three-stroke squiggle shape without hand-drawing all
    // the curves; every modern OS font (incl. fallback) ships it.
    const midY = staffY + stepToY(0);
    return (
      <text
        x={x}
        y={midY + STAFF_SPACE * 1.2}
        textAnchor="middle"
        className="fill-stone-900"
        style={{ fontSize: STAFF_SPACE * 3.2 }}
      >
        𝄽
      </text>
    );
  }
  // 8th / 16th / 32nd rests via SMuFL-compatible Unicode glyphs.
  const midY = staffY + stepToY(0);
  const glyph =
    duration === "8" ? "𝄾" : duration === "16" ? "𝄿" : "𝅀";
  return (
    <text
      x={x}
      y={midY + STAFF_SPACE * 1.2}
      textAnchor="middle"
      className="fill-stone-900"
      style={{ fontSize: STAFF_SPACE * 3.2 }}
    >
      {glyph}
    </text>
  );
}

const STEM_LENGTH = STAFF_SPACE * 3.5;
const STEM_THICKNESS = Math.max(1, STAFF_SPACE * 0.12); // SMuFL default 0.12 × space
const NOTEHEAD_HALF_WIDTH = STAFF_SPACE * 0.58;

/**
 * Vertical stem attached to a note's glyphs. Stem direction is supplied
 * (up / down) by layout.ts based on whether the chord contains a cymbal
 * voice. Stem length spans from the topmost glyph down by STEM_LENGTH
 * (stems up) or from the bottommost glyph up (stems down).
 */
export function NoteheadStem({
  x,
  staffY,
  topStep,
  bottomStep,
  direction,
  tipY,
}: {
  x: number;
  staffY: number;
  topStep: number;
  bottomStep: number;
  direction: "up" | "down";
  /** Override the stem's far end (used when a beam pins all stems to the same y). */
  tipY?: number;
}): ReactNode {
  if (direction === "up") {
    const baseY = staffY + stepToY(bottomStep);
    const y = tipY ?? staffY + stepToY(topStep) - STEM_LENGTH;
    const stemX = x + NOTEHEAD_HALF_WIDTH;
    return (
      <line
        x1={stemX}
        x2={stemX}
        y1={baseY}
        y2={y}
        className="stroke-stone-900"
        strokeWidth={STEM_THICKNESS}
        strokeLinecap="round"
      />
    );
  }
  const baseY = staffY + stepToY(topStep);
  const y = tipY ?? staffY + stepToY(bottomStep) + STEM_LENGTH;
  const stemX = x - NOTEHEAD_HALF_WIDTH;
  return (
    <line
      x1={stemX}
      x2={stemX}
      y1={baseY}
      y2={y}
      className="stroke-stone-900"
      strokeWidth={STEM_THICKNESS}
      strokeLinecap="round"
    />
  );
}

/**
 * Filled flag shapes at the stem tip. Each flag is a small curved
 * triangle hanging off the stem — thicker and more readable than a
 * plain stroke. Multiple flags stack inward toward the notehead.
 */
export function NoteheadFlags({
  x,
  staffY,
  topStep,
  bottomStep,
  direction,
  count,
  tipYOverride,
}: {
  x: number;
  staffY: number;
  topStep: number;
  bottomStep: number;
  direction: "up" | "down";
  count: number;
  /** When the stem is pinned by a beam, supply the stem's actual tip Y. */
  tipYOverride?: number;
}): ReactNode {
  if (count <= 0) return null;
  const stemX =
    direction === "up"
      ? x + NOTEHEAD_HALF_WIDTH
      : x - NOTEHEAD_HALF_WIDTH;
  const tipY =
    tipYOverride ??
    (direction === "up"
      ? staffY + stepToY(topStep) - STEM_LENGTH
      : staffY + stepToY(bottomStep) + STEM_LENGTH);
  const flagReach = STAFF_SPACE * 1.3;
  const flagDrop = STAFF_SPACE * 1.4;
  const sign = direction === "up" ? 1 : -1;
  const paths: ReactNode[] = [];
  for (let i = 0; i < count; i += 1) {
    const y = tipY + i * STAFF_SPACE * 0.85 * sign;
    // Filled teardrop: stem tip → curve out and down → curve back toward stem
    const p1x = stemX;
    const p1y = y;
    const p2x = stemX + flagReach;
    const p2y = y + flagDrop * 0.35 * sign;
    const p3x = stemX + flagReach * 0.7;
    const p3y = y + flagDrop * 1.1 * sign;
    const p4x = stemX;
    const p4y = y + flagDrop * 0.55 * sign;
    paths.push(
      <path
        key={i}
        d={`M ${p1x} ${p1y} Q ${p2x} ${p2y} ${p3x} ${p3y} Q ${p4x + flagReach * 0.2} ${p4y} ${p1x} ${p1y + flagDrop * 0.15 * sign} Z`}
        className="fill-stone-900"
      />,
    );
  }
  return <g>{paths}</g>;
}
