import type { Score } from "../types";

interface Props {
  score: Score;
  width?: number;
}

/**
 * Standard-notation (five-line staff) renderer. Hand-rolled, no third-party
 * engraving library — the whole staff layout and glyph set lives under
 * `src/notation/staff/`.
 *
 * MVP scope (tracked in .kiro/specs/staff-view/IMPLEMENTATION.md): staff
 * lines, percussion clef, time signature, basic drum map, stems/flags,
 * beams, rests, tuplets, barlines, automatic system wrapping. Everything
 * else (repeat signs, endings, D.C./D.S., articulations) is future work.
 */
export function StaffView({ score, width = 980 }: Props) {
  return (
    <svg
      viewBox={`0 0 ${width} 200`}
      className="h-auto w-full"
      role="img"
      aria-label="Standard notation drum chart"
    >
      <rect
        x={0}
        y={0}
        width={width}
        height={200}
        rx={16}
        className="fill-stone-50"
      />
      <text
        x={width / 2}
        y={100}
        textAnchor="middle"
        className="fill-stone-500 text-[14px] italic"
      >
        Staff view — {score.title || "untitled"} (coming soon)
      </text>
    </svg>
  );
}
