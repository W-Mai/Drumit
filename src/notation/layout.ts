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
  /** Allocated horizontal slot width (px) for this hit — used by the
   *  renderer to size the glyph so it stays centered inside the slot. */
  slotWidth: number;
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
  /** This bar's own natural height (depends on which rows it uses). */
  height: number;
  /** Max height among all bars in the same row — keeps the playhead
   *  box a stable size across the row. */
  rowMaxHeight: number;
  /** Y for every row group actually used in this bar. */
  rowY: Partial<Record<RowGroup, number>>;
  /** Ordered list of row groups used in this bar, from top to bottom. */
  rowGroups: RowGroup[];
  beats: LaidOutBeat[];
  hits: LaidOutHit[];
  repeatPrevious: boolean;
  repeatCount: number;
  repeatStart?: boolean;
  repeatEnd?: { times: number };
  ending?: "1" | "2";
  navigation?: import("./types").NavigationMarker;
}

export interface LaidOutLayout {
  width: number;
  height: number;
  rows: LaidOutBar[][];
  title: string;
  artist?: string;
  tempo?: string;
  meter: string;
  /** Left / right x-coordinates of the content area — titles, dividers
   *  and the first/last bar all snap to these so the header sits flush
   *  with the music grid. */
  contentLeft: number;
  contentRight: number;
  sectionHeaders: Array<{ label: string; x: number; y: number }>;
  /** Click targets for sections whose bars array is empty — the UI
   *  uses these to offer an "+ add bar" surface the user can tap. */
  sectionPlaceholders: Array<{
    sectionIndex: number;
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
}

export interface LayoutOptions {
  /** Display labels column to the left of bars. */
  showLabels: boolean;
  /** Use expanded, one-lane-per-instrument layout. */
  expanded: boolean;
  /** Target width in px; the layout fits bars responsively. */
  width: number;
}

// Visual rhythm tokens. Keep these in one place; the renderer reads
// them to size note heads + badges so any value change stays
// consistent across the chart.
export const BAR_CONTENT_TOP = 16;
export const ROW_HEIGHT = 24; // vertical space per voicing row
export const ROW_GAP = 14;
export const SECTION_GAP_BEFORE = 18;
export const SECTION_HEADER_HEIGHT = 22;
// Space reserved at the top of the score for the title, tempo, and
// meter signature tokens. Includes breathing room below the divider
// before the first section tab.
export const HEADER_BAND_HEIGHT = 54;
// Extra room below the last row for beam lines + articulations.
export const BAR_CONTENT_BOTTOM = 14;

const MIN_BEAT_WIDTH = 44;
const BAR_GAP_X = 0;

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
  const sectionHeaders: Array<{ label: string; x: number; y: number }> = [];
  const sectionPlaceholders: LaidOutLayout["sectionPlaceholders"] = [];
  let y = HEADER_BAND_HEIGHT;
  let barIndex = 1;
  const PLACEHOLDER_HEIGHT = 40;

  score.sections.forEach((section, sectionIdx) => {
    y += SECTION_GAP_BEFORE;
    sectionHeaders.push({ label: section.label, x: leftMargin, y });
    y += SECTION_HEADER_HEIGHT;

    if (section.bars.length === 0) {
      sectionPlaceholders.push({
        sectionIndex: sectionIdx,
        x: leftMargin,
        y,
        width: availableWidth,
        height: PLACEHOLDER_HEIGHT,
      });
      y += PLACEHOLDER_HEIGHT + ROW_GAP;
      return;
    }

    for (let rowStart = 0; rowStart < section.bars.length; rowStart += barsPerRow) {
      const rowSourceBars = section.bars.slice(rowStart, rowStart + barsPerRow);
      const rowAssignment = assignRows(rowSourceBars);
      const rowBars: LaidOutBar[] = rowSourceBars.map((bar, colInRow) => {
        const x = leftMargin + colInRow * (barWidth + BAR_GAP_X);
        const laid = layoutBar(bar, barIndex, x, y, barWidth, beatsPerBar, rowAssignment);
        barIndex += 1;
        return laid;
      });
      const rowMaxHeight = Math.max(...rowBars.map((b) => b.height));
      for (const b of rowBars) b.rowMaxHeight = rowMaxHeight;
      rows.push(rowBars);
      y += rowMaxHeight + ROW_GAP;
    }
  });

  return {
    width: options.width,
    height: y + 16,
    rows,
    title: score.title,
    artist: score.artist,
    tempo: score.tempo ? `♩ = ${score.tempo.bpm}` : undefined,
    meter: `${score.meter.beats}/${score.meter.beatUnit}`,
    contentLeft: leftMargin,
    contentRight: leftMargin + availableWidth,
    sectionHeaders,
    sectionPlaceholders,
  };
}

function layoutBar(
  bar: Bar,
  index: number,
  x: number,
  y: number,
  width: number,
  beatsPerBar: number,
  rowAssignment: Map<RowGroup, number>,
): LaidOutBar {
  const rowGroups = ROW_GROUP_ORDER.filter((g) => rowAssignment.has(g));
  if (rowGroups.length === 0) {
    // Empty bar (e.g. bar of `%` in an otherwise empty row): anchor
    // a snare row so rowY / barHeight stay defined.
    rowGroups.push("snare");
    if (!rowAssignment.has("snare")) rowAssignment.set("snare", 0);
  }

  const uniqueRowIndices = Array.from(
    new Set([...rowAssignment.values()]),
  ).sort((a, b) => a - b);
  const rowCount = Math.max(1, uniqueRowIndices.length);
  const indexToVisualRow = new Map<number, number>();
  uniqueRowIndices.forEach((idx, visualRow) =>
    indexToVisualRow.set(idx, visualRow),
  );
  const rowY: Partial<Record<RowGroup, number>> = {};
  rowGroups.forEach((group) => {
    const visualRow = indexToVisualRow.get(rowAssignment.get(group)!)!;
    rowY[group] = y + BAR_CONTENT_TOP + visualRow * ROW_HEIGHT;
  });
  const barHeight = BAR_CONTENT_TOP + rowCount * ROW_HEIGHT + BAR_CONTENT_BOTTOM;

  const innerLeft = x + 12;
  const innerRight = x + width - 12;
  const beatWidth = (innerRight - innerLeft) / beatsPerBar;
  const hits: LaidOutHit[] = [];
  const beats: LaidOutBeat[] = [];

  bar.beats.forEach((beat, beatIndex) => {
    const beatX = innerLeft + beatIndex * beatWidth;
    const laidLanes: LaidOutLane[] = [];

    // First pass: collect x-ranges where a dotted note on *some* lane
    // extends over what would otherwise be the next slot. Other lanes'
    // beam segments get these ranges punched out so the dot's extension
    // visually "owns" that slot instead of sharing it with a phantom
    // 16th under-line.
    const dotExtendRanges: Array<{ x1: number; x2: number }> = [];
    beat.lanes.forEach((lane) => {
      const groups = lane.groups ?? [
        { ratio: 1, division: lane.division, tuplet: lane.tuplet, slots: lane.slots },
      ];
      let gx = beatX;
      for (const g of groups) {
        const gw = beatWidth * g.ratio;
        const slotW = gw / Math.max(1, g.division);
        g.slots.forEach((s, si) => {
          const dots = s?.dots ?? 0;
          if (dots <= 0) return;
          // slot's nominal (undotted) duration within this group
          const base = slotW / (1 + 0.5 * dots);
          const slotX = gx + si * slotW;
          dotExtendRanges.push({
            x1: slotX + base,
            x2: slotX + slotW,
          });
        });
        gx += gw;
      }
    });

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
        const hasAnyHit = groupData.slots.some((s) => s !== null);
        const beamDepth = hasAnyHit ? beamDepthForGroup(groupData) : 0;
        let beamSegments: Array<{ x1: number; x2: number }> =
          beamDepth > 0
            ? [
                {
                  x1: groupX + 1,
                  x2: groupX + groupWidth - 1,
                },
              ]
            : [];
        // Punch out any range that another lane's dotted extension
        // already claims — except the extension belongs to *this*
        // group (we can't erase our own dot).
        if (beamSegments.length && dotExtendRanges.length) {
          const ownRanges = new Set(
            groupData.slots
              .map((s, si) => {
                const dots = s?.dots ?? 0;
                if (dots <= 0) return null;
                const slotW = groupWidth / Math.max(1, groupData.division);
                const base = slotW / (1 + 0.5 * dots);
                const slotX = groupX + si * slotW;
                return `${slotX + base}:${slotX + slotW}`;
              })
              .filter((k): k is string => k !== null),
          );
          const punchers = dotExtendRanges.filter(
            (r) => !ownRanges.has(`${r.x1}:${r.x2}`),
          );
          beamSegments = subtractRanges(beamSegments, punchers);
        }

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

        const slotWidth = groupWidth / Math.max(1, groupData.division);
        groupData.slots.forEach((hit, slotIndex) => {
          if (!hit) return;
          hits.push({
            x: tickXs[slotIndex],
            y: laneY,
            slotWidth,
            hit,
            category,
            rowGroup: group,
          });
        });

        groupX += groupWidth;
      });
    });

    const beams = mergeBeams(laidLanes, rowY);
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
    rowMaxHeight: barHeight,
    rowY,
    rowGroups,
    beats,
    hits,
    repeatPrevious: bar.repeatPrevious,
    repeatCount: bar.repeatCount,
    repeatStart: bar.repeatStart,
    repeatEnd: bar.repeatEnd,
    ending: bar.ending,
    navigation: bar.navigation,
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
function mergeBeams(
  laneSegments: LaidOutLane[],
  rowY: Partial<Record<RowGroup, number>>,
): LaidOutBeam[] {
  const byRow = new Map<RowGroup, LaidOutLane[]>();
  for (const lane of laneSegments) {
    if (lane.beamDepth <= 0) continue;
    const existing = byRow.get(lane.rowGroup);
    if (existing) existing.push(lane);
    else byRow.set(lane.rowGroup, [lane]);
  }

  // Step 1: per-row merged beams.
  type RowBeam = {
    rowGroup: RowGroup;
    rowAnchorY: number;
    depth: number;
    x1: number;
    x2: number;
    /** Tuplet number contributing to this depth level (for cross-row match). */
    tuplet: number; // 0 = not a tuplet
  };
  const perRowBeams: RowBeam[] = [];
  for (const [rowGroup, lanes] of byRow) {
    const rowAnchorY = lanes[0].beamY;
    const maxDepth = lanes.reduce((m, l) => Math.max(m, l.beamDepth), 0);
    for (let depth = 1; depth <= maxDepth; depth += 1) {
      const contributingLanes = lanes.filter((l) => l.beamDepth >= depth);
      const spans = contributingLanes
        .flatMap((l) => l.beamSegments)
        .sort((a, b) => a.x1 - b.x1);
      if (!spans.length) continue;
      // Tuplet flag: 0 if all lanes at this depth are non-tuplet, else the
      // single shared tuplet number (mixed → mark as -1 to block merging).
      let tupletFlag = 0;
      for (const l of contributingLanes) {
        const t = l.tuplet ?? 0;
        if (tupletFlag === 0) tupletFlag = t;
        else if (t !== tupletFlag) tupletFlag = -1;
      }
      const merged = mergeSpans(spans, 10);
      merged.forEach((s) =>
        perRowBeams.push({
          rowGroup,
          rowAnchorY,
          depth,
          x1: s.x1,
          x2: s.x2,
          tuplet: tupletFlag,
        }),
      );
    }
  }

  const rowMaxDepth = new Map<RowGroup, number>();
  for (const lane of laneSegments) {
    if (lane.beamDepth <= 0) continue;
    const prev = rowMaxDepth.get(lane.rowGroup) ?? 0;
    if (lane.beamDepth > prev) rowMaxDepth.set(lane.rowGroup, lane.beamDepth);
  }

  // Step 2a: Build the beat-level primary bar. Fold every row's
  // depth=1 into a single merged beam on the bottom row. In addition,
  // each richer-stack row (has its own 16th / 32nd) keeps its own
  // depth=1 on its home lane — that copy is the base under the
  // short beams. The bottom row's self-primary is absorbed into the
  // folded beam (no duplicate on the same row).
  const EPS = 1.5;
  const primaryTupletGroups = new Map<number, RowBeam[]>();
  const nonPrimary: RowBeam[] = [];
  for (const b of perRowBeams) {
    if (b.depth !== 1 || b.tuplet === -1) {
      nonPrimary.push(b);
      continue;
    }
    const list = primaryTupletGroups.get(b.tuplet) ?? [];
    list.push(b);
    primaryTupletGroups.set(b.tuplet, list);
  }
  const folded: RowBeam[] = [...nonPrimary];
  const selfPrimarySet = new Set<RowBeam>();
  for (const [tuplet, beams] of primaryTupletGroups) {
    const spans = beams
      .map((b) => ({ x1: b.x1, x2: b.x2 }))
      .sort((a, b) => a.x1 - b.x1);
    const merged = mergeSpans(spans, 10);
    const bottom = beams.reduce((acc, b) =>
      (rowY[b.rowGroup] ?? 0) > (rowY[acc.rowGroup] ?? 0) ? b : acc,
    );
    for (const span of merged) {
      folded.push({
        rowGroup: bottom.rowGroup,
        rowAnchorY: bottom.rowAnchorY,
        depth: 1,
        x1: span.x1,
        x2: span.x2,
        tuplet,
      });
    }
    for (const b of beams) {
      if ((rowMaxDepth.get(b.rowGroup) ?? 0) <= 1) continue;
      if (b.rowGroup === bottom.rowGroup) continue;
      selfPrimarySet.add(b);
      folded.push(b);
    }
  }

  // Step 2b: Collapse rows whose entire beam stack is identical. If
  // two rows play the same rhythm (all depths at the same x), the
  // under-lines on the upper row are redundant — drop them and keep
  // the bottom row's stack only.
  const byRowGroup = new Map<RowGroup, RowBeam[]>();
  for (const b of folded) {
    const list = byRowGroup.get(b.rowGroup) ?? [];
    list.push(b);
    byRowGroup.set(b.rowGroup, list);
  }
  const stackKeyFor = (list: RowBeam[]) =>
    list
      .slice()
      .sort(
        (a, b) => a.depth - b.depth || a.x1 - b.x1 || a.x2 - b.x2,
      )
      .map(
        (b) =>
          `${b.depth}:${b.x1.toFixed(1)}:${b.x2.toFixed(1)}:${b.tuplet}`,
      )
      .join("|");
  const stackByRow = new Map<RowGroup, string>();
  for (const [rg, list] of byRowGroup) stackByRow.set(rg, stackKeyFor(list));
  const rowsByStack = new Map<string, RowGroup[]>();
  for (const [rg, key] of stackByRow) {
    const list = rowsByStack.get(key) ?? [];
    list.push(rg);
    rowsByStack.set(key, list);
  }
  const dropRowGroups = new Set<RowGroup>();
  for (const rgs of rowsByStack.values()) {
    if (rgs.length < 2) continue;
    const bottom = rgs.reduce((acc, r) =>
      (rowY[r] ?? 0) > (rowY[acc] ?? 0) ? r : acc,
    );
    for (const r of rgs) if (r !== bottom) dropRowGroups.add(r);
  }
  const kept: RowBeam[] = folded.filter(
    (b) => !dropRowGroups.has(b.rowGroup),
  );
  void EPS;

  return kept.map((b) => ({
    rowGroup: b.rowGroup,
    y: b.rowAnchorY + (b.depth - 1) * 3,
    depth: b.depth,
    x1: b.x1,
    x2: b.x2,
  }));
}

/**
 * Remove punch ranges from a list of spans. Each input span either
 * clears an intersecting punch (producing up to two remnants), or
 * passes through unchanged. Punch ranges themselves aren't merged —
 * they come straight from dot-extension detection.
 */
function subtractRanges(
  spans: Array<{ x1: number; x2: number }>,
  punches: Array<{ x1: number; x2: number }>,
): Array<{ x1: number; x2: number }> {
  if (!punches.length) return spans;
  let out = spans.slice();
  for (const p of punches) {
    const next: Array<{ x1: number; x2: number }> = [];
    for (const s of out) {
      // No overlap
      if (p.x2 <= s.x1 || p.x1 >= s.x2) {
        next.push(s);
        continue;
      }
      // Fully covers
      if (p.x1 <= s.x1 && p.x2 >= s.x2) continue;
      // Left remnant
      if (p.x1 > s.x1) next.push({ x1: s.x1, x2: p.x1 });
      // Right remnant
      if (p.x2 < s.x2) next.push({ x1: p.x2, x2: s.x2 });
    }
    out = next;
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
    // A lane that is marked as a tuplet but has no actual beam (all rests)
    // can't host the number — skip and let the label move up to the next
    // tuplet-bearing row with a visible beam.
    if (lane.beamDepth <= 0) continue;
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
function assignRows(bars: Bar | Bar[]): Map<RowGroup, number> {
  const barList = Array.isArray(bars) ? bars : [bars];
  // 1. Gather per-group set of absolute tick positions.
  // Bars contribute into separate tick spaces (offset by bar index × big
  // number) so different bars never pretend to collide at the same tick.
  const TICK_DEN = 48; // lcm(16, 3) = 48 ticks per beat
  const BAR_STRIDE = 1 << 20;
  const groupTicks: Partial<Record<RowGroup, Set<number>>> = {};

  barList.forEach((bar, barIndex) => {
    const barOffset = barIndex * BAR_STRIDE;
    bar.beats.forEach((beat, beatIndex) => {
      const beatStart = barOffset + beatIndex * TICK_DEN;
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
  // Each slot in this group lasts `slotDur` beats. We pick the beam
  // depth from the slot's own duration family so dotted values pick
  // up the same beaming as their base (0.75 beat = dotted 8th = 1 beam).
  const slotDur = (group.ratio || 1) / Math.max(1, group.division);

  if (group.tuplet) {
    const base =
      group.tuplet === 6 || group.tuplet === 5 || group.tuplet === 7 ? 2 : 1;
    // Triplet / tuplet families: quarter-triplet = 1 beam, 8th-triplet
    // = 1 beam, 16th-triplet = 2 beams, …
    if (slotDur <= 1 / 12) return base + 1;
    if (slotDur <= 1 / 24) return base + 2;
    return base;
  }

  // Map slot duration to beam count by its base power-of-two family,
  // letting dotted values land with their base (dotted 8th → 8th → 1 beam).
  // Each band is [base, base × 1.5]: 8th [0.5, 0.75], 16th [0.25, 0.375], …
  const eps = 1e-6;
  if (slotDur >= 1 - eps) return 0;
  if (slotDur >= 0.5 - eps) return 1; // 8th family (incl. dotted 8th)
  if (slotDur >= 0.25 - eps) return 2; // 16th family
  if (slotDur >= 0.125 - eps) return 3; // 32nd family
  return 4; // 64th or shorter
}
