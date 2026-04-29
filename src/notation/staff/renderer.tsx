import type { Score } from "../types";
import {
  PERCUSSION_CLEF_WIDTH,
  STAFF_HEIGHT,
  STAFF_SPACE,
  TIME_SIG_WIDTH,
} from "./geometry";
import { PercussionClef, StaffLines, TimeSignature } from "./glyphs";

interface Props {
  score: Score;
  width?: number;
}

const HEADER_H = 42;
const SYSTEM_PAD_X = 20;
const SYSTEM_VERTICAL_PAD = STAFF_SPACE * 4;
const MIN_WIDTH = 400;

export function StaffView({ score, width = 980 }: Props) {
  const actualWidth = Math.max(MIN_WIDTH, width);
  const staffY = HEADER_H + STAFF_SPACE * 2;
  const systemHeight = STAFF_HEIGHT + SYSTEM_VERTICAL_PAD;

  const clefX = SYSTEM_PAD_X + 4;
  const timeSigX = clefX + PERCUSSION_CLEF_WIDTH + 12;
  const staffLinesX = SYSTEM_PAD_X;
  const staffLinesWidth = actualWidth - SYSTEM_PAD_X * 2;

  const totalHeight = HEADER_H + systemHeight;

  return (
    <svg
      viewBox={`0 0 ${actualWidth} ${totalHeight}`}
      className="h-auto w-full"
      role="img"
      aria-label="Standard notation drum chart"
    >
      <rect
        x={0}
        y={0}
        width={actualWidth}
        height={totalHeight}
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
          {score.meter.beats}/{score.meter.beatUnit}
          {score.tempo?.bpm ? `  ♩ = ${score.tempo.bpm}` : ""}
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
    </svg>
  );
}
