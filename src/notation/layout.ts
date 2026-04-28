import { instrumentCategory } from "./instruments";
import type {
  Bar,
  Hit,
  Instrument,
  InstrumentCategory,
  LaneGroup,
  Score,
} from "./types";

export interface LaidOutHit {
  x: number;
  y: number;
  hit: Hit;
  category: InstrumentCategory;
  rowGroup: RowGroup;
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
  /** Y for every row group actually used in this bar. */
  rowY: Partial<Record<RowGroup, number>>;
  /** Ordered list of row groups used in this bar, from top to bottom. */
  rowGroups: RowGroup[];
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

export const BAR_CONTENT_TOP = 20;
export const ROW_HEIGHT = 26; // vertical space per voicing row (note head + beam band)
export const ROW_GAP = 28;
export const SECTION_GAP = 44;
export const SECTION_HEAD_OFFSET = 20;

const MIN_BEAT_WIDTH = 44;
const BAR_GAP_X = 18;

/**
 * Fixed top-to-bottom order of voicing rows (the "lanes" visible in a bar).
 * Only rows that are actually used in a given bar are rendered, but they are
 * always laid out in this order so the chart is readable at a glance.
 */
export type RowGroup = "cymbals" | "toms" | "snare" | "kick";

export const ROW_GROUP_ORDER: RowGroup[] = [
  "cymbals",
  "toms",
  "snare",
  "kick",
];

export function rowGroupFor(instrument: Instrument): RowGroup {
  switch (instrument) {
    case "hihatClosed":
    case "hihatOpen":
    case "hihatHalfOpen":
    case "hihatFoot":
    case "ride":
    case "rideBell":
    case "crashLeft":
    case "crashRight":
      return "cymbals";
    case "tomHigh":
    case "tomMid":
    case "floorTom":
      return "toms";
    case "snare":
      return "snare";
    case "kick":
      return "kick";
  }
}

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
    const flushRow = () => {
      if (!rowBars.length) return;
      const rowMaxHeight = Math.max(...rowBars.map((b) => b.height));
      rows.push(rowBars);
      rowBars = [];
      y += rowMaxHeight + ROW_GAP;
    };
    section.bars.forEach((bar, idx) => {
      const col = idx % barsPerRow;
      if (col === 0) flushRow();
      const x = leftMargin + col * (barWidth + BAR_GAP_X);
      rowBars.push(layoutBar(bar, barIndex, x, y, barWidth, beatsPerBar));
      barIndex += 1;
    });
    flushRow();
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
  // Pre-pass: discover which row groups this bar actually uses.
  const usedGroups = new Set<RowGroup>();
  bar.beats.forEach((beat) =>
    beat.lanes.forEach((lane) => usedGroups.add(rowGroupFor(lane.instrument))),
  );
  const rowGroups = ROW_GROUP_ORDER.filter((g) => usedGroups.has(g));
  if (rowGroups.length === 0) rowGroups.push("snare"); // safety for empty bar

  const rowCount = rowGroups.length;
  const rowY: Partial<Record<RowGroup, number>> = {};
  rowGroups.forEach((group, i) => {
    rowY[group] = y + BAR_CONTENT_TOP + i * ROW_HEIGHT;
  });
  const barHeight = BAR_CONTENT_TOP + rowCount * ROW_HEIGHT + 18; // +18 for bottom beam space

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
      const group = rowGroupFor(lane.instrument);
      const laneY = rowY[group]!;

      const groups = lane.groups ?? [
        {
          ratio: 1,
          division: lane.division,
          tuplet: lane.tuplet,
          slots: lane.slots,
        } satisfies LaneGroup,
      ];

      let groupX = beatX;
      groups.forEach((groupData) => {
        const groupWidth = beatWidth * groupData.ratio;
        const tickXs = evenTicks(groupX, groupWidth, groupData.division);
        const beamDepth = beamDepthForGroup(groupData);
        const beamSegments =
          beamDepth > 0
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
          division: groupData.division,
          tuplet: groupData.tuplet,
          tickXs,
          beamY: laneY + 12,
          beamDepth,
          beamSegments,
        });

        groupData.slots.forEach((hit, slotIndex) => {
          if (!hit) return;
          hits.push({
            x: tickXs[slotIndex],
            y: laneY,
            hit,
            category,
            rowGroup: group,
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
    height: barHeight,
    rowY,
    rowGroups,
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
