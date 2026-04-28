import { instrumentCategory } from "./instruments";
import type {
  Bar,
  Hit,
  InstrumentCategory,
  LaneGroup,
  Score,
} from "./types";

export interface LaidOutHit {
  x: number;
  y: number;
  hit: Hit;
  category: InstrumentCategory;
}

export interface LaidOutLane {
  instrument: string;
  category: InstrumentCategory;
  division: number;
  tuplet?: number;
  /** Center x of each slot. */
  tickXs: number[];
  /** Y of the underline beam group (under the hit row). */
  beamY: number;
  /** 1 = 8th (single underline), 2 = 16th (two lines), 3 = 32nd. */
  beamDepth: number;
  /** Beam segments span; empty when division <= 1 (no underline). */
  beamSegments: { x1: number; x2: number }[];
}

export interface LaidOutBeat {
  index: number;
  x: number;
  width: number;
  lanes: LaidOutLane[];
  tuplet?: number;
}

export interface LaidOutBar {
  index: number;
  x: number;
  y: number;
  width: number;
  height: number;
  cymbalY: number;
  drumY: number;
  beats: LaidOutBeat[];
  hits: LaidOutHit[];
  repeatPrevious: boolean;
  repeatCount: number;
}

export interface LaidOutLayout {
  width: number;
  height: number;
  rows: LaidOutBar[][];
  title: string;
  tempo?: string;
  meter: string;
  sectionHeaders: Array<{ label: string; y: number }>;
}

export interface LayoutOptions {
  /** Display labels column to the left of bars. */
  showLabels: boolean;
  /** Use expanded, one-lane-per-instrument layout. */
  expanded: boolean;
  /** Target width in px; the layout fits bars responsively. */
  width: number;
}

export const CYMBAL_ROW_Y = 26;
export const DRUM_ROW_Y = 58;
export const BAR_HEIGHT = 84;
export const ROW_GAP = 28;
export const SECTION_GAP = 44;
export const SECTION_HEAD_OFFSET = 20;

const MIN_BEAT_WIDTH = 44;
const BAR_GAP_X = 18;

export function layoutScore(score: Score, options: LayoutOptions): LaidOutLayout {
  const beatsPerBar = score.meter.beats;
  const availableWidth = options.width - (options.showLabels ? 96 : 32);
  const barMinWidth = MIN_BEAT_WIDTH * beatsPerBar + 20;
  const barsPerRow = Math.max(
    1,
    Math.floor((availableWidth + BAR_GAP_X) / (barMinWidth + BAR_GAP_X)),
  );
  const barWidth = Math.max(
    barMinWidth,
    (availableWidth - BAR_GAP_X * (barsPerRow - 1)) / barsPerRow,
  );
  const leftMargin = options.showLabels ? 80 : 16;

  const rows: LaidOutBar[][] = [];
  const sectionHeaders: Array<{ label: string; y: number }> = [];
  let y = 10;
  let barIndex = 1;

  score.sections.forEach((section) => {
    sectionHeaders.push({ label: section.label, y: y + SECTION_HEAD_OFFSET });
    y += SECTION_GAP;

    let rowBars: LaidOutBar[] = [];
    section.bars.forEach((bar, idx) => {
      const col = idx % barsPerRow;
      if (col === 0 && rowBars.length) {
        rows.push(rowBars);
        rowBars = [];
        y += BAR_HEIGHT + ROW_GAP;
      }
      const x = leftMargin + col * (barWidth + BAR_GAP_X);
      rowBars.push(layoutBar(bar, barIndex, x, y, barWidth, beatsPerBar));
      barIndex += 1;
    });
    if (rowBars.length) {
      rows.push(rowBars);
      rowBars = [];
      y += BAR_HEIGHT + ROW_GAP;
    }
  });

  return {
    width: options.width,
    height: y + 8,
    rows,
    title: score.title,
    tempo: score.tempo ? `♩ = ${score.tempo.bpm}` : undefined,
    meter: `${score.meter.beats}/${score.meter.beatUnit}`,
    sectionHeaders,
  };
}

function layoutBar(
  bar: Bar,
  index: number,
  x: number,
  y: number,
  width: number,
  beatsPerBar: number,
): LaidOutBar {
  const cymbalY = y + CYMBAL_ROW_Y;
  const drumY = y + DRUM_ROW_Y;
  const innerLeft = x + 12;
  const innerRight = x + width - 12;
  const beatWidth = (innerRight - innerLeft) / beatsPerBar;
  const hits: LaidOutHit[] = [];
  const beats: LaidOutBeat[] = [];

  bar.beats.forEach((beat, beatIndex) => {
    const beatX = innerLeft + beatIndex * beatWidth;
    const laidLanes: LaidOutLane[] = [];

    beat.lanes.forEach((lane) => {
      const category = instrumentCategory[lane.instrument];
      const rowY = category === "cymbal" ? cymbalY : drumY;

      const groups = lane.groups ?? [
        {
          ratio: 1,
          division: lane.division,
          tuplet: lane.tuplet,
          slots: lane.slots,
        } satisfies LaneGroup,
      ];

      let groupX = beatX;
      groups.forEach((group) => {
        const groupWidth = beatWidth * group.ratio;
        const tickXs = evenTicks(groupX, groupWidth, group.division);
        const beamDepth = beamDepthForGroup(group);
        const beamSegments =
          group.division > 1
            ? [
                {
                  x1: groupX + 3,
                  x2: groupX + groupWidth - 3,
                },
              ]
            : [];

        laidLanes.push({
          instrument: lane.instrument,
          category,
          division: group.division,
          tuplet: group.tuplet,
          tickXs,
          beamY: rowY + 12,
          beamDepth,
          beamSegments,
        });

        group.slots.forEach((hit, slotIndex) => {
          if (!hit) return;
          hits.push({
            x: tickXs[slotIndex],
            y: rowY,
            hit,
            category,
          });
        });

        groupX += groupWidth;
      });
    });

    beats.push({
      index: beatIndex,
      x: beatX,
      width: beatWidth,
      lanes: laidLanes,
      tuplet: beat.tuplet,
    });
  });

  return {
    index,
    x,
    y,
    width,
    height: BAR_HEIGHT,
    cymbalY,
    drumY,
    beats,
    hits,
    repeatPrevious: bar.repeatPrevious,
    repeatCount: bar.repeatCount,
  };
}

function evenTicks(beatX: number, beatWidth: number, division: number): number[] {
  const n = Math.max(1, division);
  return Array.from(
    { length: n },
    (_, i) => beatX + (i + 0.5) * (beatWidth / n),
  );
}

/**
 * Number of underline stripes under the beat group (8th = 1 stripe,
 * 16th = 2 stripes, 32nd = 3 stripes). In jianpu-style drum notation every
 * note shorter than a quarter gets an underline even if it stands alone, so
 * we look at *effective subdivision per beat* (division / ratio) rather than
 * division alone.
 */
function beamDepthForGroup(group: {
  division: number;
  tuplet?: number;
  ratio: number;
}): number {
  // Effective subdivision across a full beat: a half-beat group with
  // division=1 behaves like an 8th note (effective = 2).
  const durationScale = group.ratio > 0 ? 1 / group.ratio : 1;
  const effective = group.division * durationScale;

  if (group.tuplet) {
    // A triplet lives under one beam when it spans a quarter-note (effective
    // subdivision ~3), adds another beam when compressed to a half-beat
    // (effective ~6 → 16th triplet), and so on.
    const base =
      group.tuplet === 6 || group.tuplet === 5 || group.tuplet === 7 ? 2 : 1;
    // Each doubling of effective subdivision over the "normal" range adds a
    // beam. Normal span for a 3-tuplet is effective≈3, for 6-tuplet ≈6.
    const normal = group.tuplet === 6 ? 6 : 3;
    if (effective >= normal * 4) return base + 2;
    if (effective >= normal * 2) return base + 1;
    return base;
  }

  if (effective >= 8) return 3; // 32nds
  if (effective >= 4) return 2; // 16ths
  if (effective >= 2) return 1; // 8ths
  return 0; // quarter or longer: no beam
}
