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
  return (
    <g>
      <line
        x1={x}
        x2={x}
        y1={top}
        y2={bottom}
        className="stroke-stone-900"
        strokeWidth={2.5}
        strokeLinecap="round"
      />
      <line
        x1={x + 4}
        x2={x + 4}
        y1={top}
        y2={bottom}
        className="stroke-stone-900"
        strokeWidth={2.5}
        strokeLinecap="round"
      />
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

const STEM_LENGTH = STAFF_SPACE * 3.5;
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
}: {
  x: number;
  staffY: number;
  topStep: number;
  bottomStep: number;
  direction: "up" | "down";
}): ReactNode {
  if (direction === "up") {
    const baseY = staffY + stepToY(bottomStep);
    const tipY = staffY + stepToY(topStep) - STEM_LENGTH;
    const stemX = x + NOTEHEAD_HALF_WIDTH;
    return (
      <line
        x1={stemX}
        x2={stemX}
        y1={baseY}
        y2={tipY}
        className="stroke-stone-900"
        strokeWidth={1.4}
        strokeLinecap="round"
      />
    );
  }
  const baseY = staffY + stepToY(topStep);
  const tipY = staffY + stepToY(bottomStep) + STEM_LENGTH;
  const stemX = x - NOTEHEAD_HALF_WIDTH;
  return (
    <line
      x1={stemX}
      x2={stemX}
      y1={baseY}
      y2={tipY}
      className="stroke-stone-900"
      strokeWidth={1.4}
      strokeLinecap="round"
    />
  );
}

/**
 * Hand-drawn flags at the stem tip. Multiple flags stack with a small
 * vertical offset. Slight S-curve to feel less mechanical than a
 * straight line.
 */
export function NoteheadFlags({
  x,
  staffY,
  topStep,
  bottomStep,
  direction,
  count,
}: {
  x: number;
  staffY: number;
  topStep: number;
  bottomStep: number;
  direction: "up" | "down";
  count: number;
}): ReactNode {
  if (count <= 0) return null;
  const stemX =
    direction === "up"
      ? x + NOTEHEAD_HALF_WIDTH
      : x - NOTEHEAD_HALF_WIDTH;
  const tipY =
    direction === "up"
      ? staffY + stepToY(topStep) - STEM_LENGTH
      : staffY + stepToY(bottomStep) + STEM_LENGTH;
  const flagLen = STAFF_SPACE * 1.6;
  const flagCurve = STAFF_SPACE * 0.9;
  const sign = direction === "up" ? 1 : -1;
  const paths: ReactNode[] = [];
  for (let i = 0; i < count; i += 1) {
    const y = tipY + i * STAFF_SPACE * 0.9 * sign;
    const cx = stemX + flagLen * 0.5;
    const cy = y + flagCurve * 0.4 * sign;
    const endX = stemX + flagLen;
    const endY = y + flagCurve * 1.4 * sign;
    paths.push(
      <path
        key={i}
        d={`M ${stemX} ${y} Q ${cx} ${cy} ${endX} ${endY}`}
        className="fill-none stroke-stone-900"
        strokeWidth={1.6}
        strokeLinecap="round"
      />,
    );
  }
  return <g>{paths}</g>;
}
