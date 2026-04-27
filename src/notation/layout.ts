import { instrumentCategory } from "./instruments";
import type { Bar, Beat, Hit, InstrumentCategory, Score } from "./types";

export interface LaidOutHit {
  x: number;
  y: number;
  hit: Hit;
  category: InstrumentCategory;
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

export interface LaidOutBeat {
  index: number;
  x: number;
  division: number;
  beamY: number;
  beamSegments: { x1: number; x2: number; depth: number }[];
  tickXs: number[];
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
    const division = Math.max(1, beat.division);
    const tickXs = Array.from(
      { length: division },
      (_, i) => beatX + (i + 0.5) * (beatWidth / division),
    );
    const beamSegments = computeBeams(beat, beatX, beatWidth);
    const beamY = drumY + 18;

    beats.push({
      index: beatIndex,
      x: beatX,
      division,
      beamY,
      beamSegments,
      tickXs,
    });

    beat.slots.forEach((slot, slotIndex) => {
      const slotX = tickXs[slotIndex];
      slot.hits.forEach((hit) => {
        const category = instrumentCategory[hit.instrument];
        hits.push({
          x: slotX,
          y: category === "cymbal" ? cymbalY : drumY,
          hit,
          category,
        });
      });
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

function computeBeams(
  beat: Beat,
  beatX: number,
  beatWidth: number,
): { x1: number; x2: number; depth: number }[] {
  const division = Math.max(1, beat.division);
  if (division <= 1) return [];
  const depth = division >= 8 ? 3 : division >= 4 ? 2 : 1;
  const x1 = beatX + 4;
  const x2 = beatX + beatWidth - 4;
  return Array.from({ length: depth }, (_, i) => ({ x1, x2, depth: i + 1 }));
}
