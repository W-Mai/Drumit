import type { ReactNode } from "react";
import { STAFF_SPACE } from "./geometry";

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
