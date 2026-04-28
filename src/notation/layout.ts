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
  rowGroup: RowGroup;
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

export interface LaidOutBeam {
  rowGroup: RowGroup;
  y: number;
  depth: number; // 1 = outermost (8th), 2 = inner (16th), 3 = (32nd)
  x1: number;
  x2: number;
}

export interface LaidOutTuplet {
  /** The tuplet number to display (3 = triplet, 5 = quintuplet, ...). */
  number: number;
  /** The y coordinate to draw at (picked based on `rowGroup`). */
  y: number;
  /** Horizontal center where the number should sit. */
  x: number;
  /** Row group whose lane this label is anchored to (for vertical placement). */
  rowGroup: RowGroup;
}

export interface LaidOutBeat {
  index: number;
  x: number;
  width: number;
  lanes: LaidOutLane[];
  tuplet?: number;
  /** Merged beams (underlines) drawn under this beat, grouped by row. */
  beams: LaidOutBeam[];
  /** Tuplet number labels (merged across adjacent lanes with same tuplet). */
  tuplets: LaidOutTuplet[];
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
  // Pre-pass: compute which row groups need a separate row because two
  // different row groups produce hits at exactly the same instant. Groups
  // that never collide collapse onto the same visual row (cymbals always get
  // their own row to keep the cymbal/drum distinction clear).
  const rowAssignment = assignRows(bar);
  const rowGroups = ROW_GROUP_ORDER.filter((g) => rowAssignment.has(g));
  if (rowGroups.length === 0) rowGroups.push("snare"); // safety for empty bar

  const uniqueRowIndices = Array.from(
    new Set(rowGroups.map((g) => rowAssignment.get(g)!)),
  ).sort((a, b) => a - b);
  const rowCount = uniqueRowIndices.length;
  const indexToVisualRow = new Map<number, number>();
  uniqueRowIndices.forEach((idx, visualRow) =>
    indexToVisualRow.set(idx, visualRow),
  );
  const rowY: Partial<Record<RowGroup, number>> = {};
  rowGroups.forEach((group) => {
    const visualRow = indexToVisualRow.get(rowAssignment.get(group)!)!;
    rowY[group] = y + BAR_CONTENT_TOP + visualRow * ROW_HEIGHT;
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
        // Rests under a beam don't get an underline in handwritten jianpu
        // style: the beam only spans consecutive hit notes. If this group
        // has no hits at all, drop the beam entirely.
        const hasAnyHit = groupData.slots.some((s) => s !== null);
        const beamDepth = hasAnyHit ? beamDepthForGroup(groupData) : 0;
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
          rowGroup: group,
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

    const beams = mergeBeams(laidLanes);
    const tuplets = mergeTuplets(laidLanes);

    beats.push({
      index: beatIndex,
      x: beatX,
      width: beatWidth,
      lanes: laidLanes,
      tuplet: beat.tuplet,
      beams,
      tuplets,
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

/**
 * Merge adjacent lane beams (per row-group, per depth level) into a single
 * continuous underline. In handwritten jianpu-style drum notation two 8th
 * notes inside the same beat share a beam, and a mixed `8 + 16 16` split
 * shares the outer 8-beam across the whole beat while the inner 16-beam
 * only spans the second half.
 *
 * Input: one beat's `LaidOutLane[]` (may contain multiple sub-groups per
 * instrument lane).
 * Output: merged beam segments ready for the renderer.
 */
function mergeBeams(laneSegments: LaidOutLane[]): LaidOutBeam[] {
  const byRow = new Map<RowGroup, LaidOutLane[]>();
  for (const lane of laneSegments) {
    if (lane.beamDepth <= 0) continue;
    const existing = byRow.get(lane.rowGroup);
    if (existing) existing.push(lane);
    else byRow.set(lane.rowGroup, [lane]);
  }

  const out: LaidOutBeam[] = [];
  for (const [rowGroup, lanes] of byRow) {
    // Different lanes in the same row-group can have identical beam y (since
    // they all render on the same row). We merge by x range first, then for
    // every depth level take the union of (x-range) for lanes with depth >=
    // level.
    const y = lanes[0].beamY;
    const maxDepth = lanes.reduce((m, l) => Math.max(m, l.beamDepth), 0);

    for (let depth = 1; depth <= maxDepth; depth += 1) {
      const spans = lanes
        .filter((l) => l.beamDepth >= depth)
        .flatMap((l) => l.beamSegments)
        .sort((a, b) => a.x1 - b.x1);
      if (!spans.length) continue;
      const merged = mergeSpans(spans, 10);
      merged.forEach((s) => {
        out.push({ rowGroup, y: y + (depth - 1) * 3, depth, x1: s.x1, x2: s.x2 });
      });
    }
  }
  return out;
}

/** Merge sorted span list; two spans are joined if their gap is <= tolerance. */
function mergeSpans(
  spans: { x1: number; x2: number }[],
  tolerance: number,
): { x1: number; x2: number }[] {
  if (!spans.length) return [];
  const out = [{ ...spans[0] }];
  for (let i = 1; i < spans.length; i += 1) {
    const last = out[out.length - 1];
    const cur = spans[i];
    if (cur.x1 - last.x2 <= tolerance) {
      last.x2 = Math.max(last.x2, cur.x2);
    } else {
      out.push({ ...cur });
    }
  }
  return out;
}

/**
 * Merge tuplet number labels within a beat. Adjacent rows (scanning bottom→
 * top of the row stack) that share the same tuplet number collapse into a
 * single label drawn below the bottom-most row of the segment. Rows that
 * carry a different tuplet number break the segment, each keeping its own
 * label. Non-tuplet lanes are invisible to this merging (they don't
 * contribute a label and also don't break an otherwise contiguous run,
 * because the segmenting is done on rows that *have* a tuplet).
 */
function mergeTuplets(laneSegments: LaidOutLane[]): LaidOutTuplet[] {
  // 1. Flatten to (rowGroup, tuplet, y, x1, x2) entries for segments with a
  //    tuplet. Multiple sub-groups on a single lane can each contribute.
  interface Entry {
    rowGroup: RowGroup;
    tuplet: number;
    y: number;
    x1: number;
    x2: number;
  }
  const entries: Entry[] = [];
  for (const lane of laneSegments) {
    if (!lane.tuplet) continue;
    if (lane.tickXs.length === 0) continue;
    const x1 = lane.tickXs[0];
    const x2 = lane.tickXs[lane.tickXs.length - 1];
    entries.push({
      rowGroup: lane.rowGroup,
      tuplet: lane.tuplet,
      y: lane.beamY,
      x1,
      x2,
    });
  }
  if (!entries.length) return [];

  // 2. Group entries by rowGroup, keep max y per rowGroup (rows are single y).
  //    Within a rowGroup, multiple entries (from split groups) get combined
  //    into the union of their x-ranges but count as one tuplet if all agree.
  const byRow = new Map<
    RowGroup,
    { rowGroup: RowGroup; tuplet: number; y: number; x1: number; x2: number }
  >();
  const mixedRows = new Set<RowGroup>();
  for (const e of entries) {
    const existing = byRow.get(e.rowGroup);
    if (!existing) {
      byRow.set(e.rowGroup, { ...e });
    } else if (existing.tuplet === e.tuplet) {
      existing.x1 = Math.min(existing.x1, e.x1);
      existing.x2 = Math.max(existing.x2, e.x2);
    } else {
      // Conflicting tuplets on the same row-group — rare but possible with
      // split lanes having different group tuplets. Fall back to emitting a
      // separate label per entry for this row.
      mixedRows.add(e.rowGroup);
    }
  }

  // 3. Scan bottom→top. Rows in kick → snare → toms → cymbals order.
  const rowOrderBottomUp: RowGroup[] = ["kick", "snare", "toms", "cymbals"];

  const out: LaidOutTuplet[] = [];
  // Handle mixed rows first (one label per entry, no merging).
  for (const rg of mixedRows) {
    for (const e of entries.filter((x) => x.rowGroup === rg)) {
      out.push({
        number: e.tuplet,
        y: e.y + 12,
        x: (e.x1 + e.x2) / 2,
        rowGroup: e.rowGroup,
      });
    }
  }

  // Then merge adjacent same-tuplet rows for the non-mixed rows.
  type Segment = {
    tuplet: number;
    y: number;
    x1: number;
    x2: number;
    rowGroup: RowGroup;
  };
  // Non-tuplet rows are skipped entirely (they neither contribute nor break
  // a merged segment). Only rows that actually carry a tuplet participate.
  let current: Segment | null = null;
  for (const rg of rowOrderBottomUp) {
    if (mixedRows.has(rg)) {
      if (current) {
        out.push(segmentToLabel(current));
        current = null;
      }
      continue;
    }
    const entry = byRow.get(rg);
    if (!entry) continue; // skip rows without tuplet — don't break current
    if (current && current.tuplet === entry.tuplet) {
      // Merge: extend x-range. Y stays at the lowest (current.y was set by
      // the first, bottom-most row.)
      current.x1 = Math.min(current.x1, entry.x1);
      current.x2 = Math.max(current.x2, entry.x2);
    } else {
      if (current) out.push(segmentToLabel(current));
      current = {
        tuplet: entry.tuplet,
        y: entry.y,
        x1: entry.x1,
        x2: entry.x2,
        rowGroup: entry.rowGroup,
      };
    }
  }
  if (current) out.push(segmentToLabel(current));

  return out;

  function segmentToLabel(s: Segment): LaidOutTuplet {
    return {
      number: s.tuplet,
      y: s.y + 12,
      x: (s.x1 + s.x2) / 2,
      rowGroup: s.rowGroup,
    };
  }
}

/**
 * Decide how many rows the bar needs and which row-group goes on which row.
 * Groups are placed into rows such that any two groups that play at the
 * exact same instant sit on different rows. Non-colliding groups share a row
 * to keep the bar as compact as possible. Row 0 is reserved for cymbals
 * (they never merge with drum rows) so the visual cymbal/drum distinction
 * from handwritten jianpu drum charts stays intact.
 */
function assignRows(bar: Bar): Map<RowGroup, number> {
  // 1. Gather per-group set of absolute tick positions.
  const TICK_DEN = 48; // lcm(16, 3) = 48 ticks per beat
  const groupTicks: Partial<Record<RowGroup, Set<number>>> = {};

  bar.beats.forEach((beat, beatIndex) => {
    const beatStart = beatIndex * TICK_DEN;
    beat.lanes.forEach((lane) => {
      const group = rowGroupFor(lane.instrument);
      const laneGroups = lane.groups ?? [
        {
          ratio: 1,
          division: lane.division,
          tuplet: lane.tuplet,
          slots: lane.slots,
        },
      ];
      let groupStartTick = beatStart;
      laneGroups.forEach((g) => {
        const groupTickWidth = Math.round(TICK_DEN * g.ratio);
        g.slots.forEach((hit, slotIndex) => {
          if (!hit) return;
          const slotTick =
            groupStartTick +
            Math.round((slotIndex * groupTickWidth) / g.division);
          if (!groupTicks[group]) groupTicks[group] = new Set();
          groupTicks[group]!.add(slotTick);
        });
        groupStartTick += groupTickWidth;
      });
    });
  });

  // 2. Greedy row assignment in ROW_GROUP_ORDER. Cymbals always get row 0;
  //    drum groups share rows when they never collide.
  const assignment = new Map<RowGroup, number>();
  const rowOccupancy: Set<number>[] = []; // tick sets per row

  for (const group of ROW_GROUP_ORDER) {
    const ticks = groupTicks[group];
    if (!ticks) continue;

    if (group === "cymbals") {
      assignment.set(group, 0);
      rowOccupancy[0] = new Set(ticks);
      continue;
    }

    // Find the lowest drum row index (>= 1) with no tick overlap.
    let placed = false;
    for (let rowIdx = 1; rowIdx < rowOccupancy.length; rowIdx += 1) {
      const occ = rowOccupancy[rowIdx];
      if (!occ) continue;
      let conflict = false;
      for (const t of ticks) {
        if (occ.has(t)) {
          conflict = true;
          break;
        }
      }
      if (!conflict) {
        assignment.set(group, rowIdx);
        ticks.forEach((t) => occ.add(t));
        placed = true;
        break;
      }
    }
    if (!placed) {
      const newRow = Math.max(rowOccupancy.length, 1);
      assignment.set(group, newRow);
      rowOccupancy[newRow] = new Set(ticks);
    }
  }

  return assignment;
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
