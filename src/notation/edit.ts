import { defaultHeadFor } from "./instruments";
import { maybeExpandDotted } from "./parser";
import type {
  Articulation,
  Bar,
  Beat,
  Hit,
  Instrument,
  LaneBeat,
  LaneGroup,
  RepeatHint,
  Score,
} from "./types";

/** Locate a bar by its 0-based global index across all sections. */
export function locateBar(
  score: Score,
  globalIndex: number,
): { sectionIndex: number; barIndex: number; bar: Bar } | null {
  let count = 0;
  for (let si = 0; si < score.sections.length; si += 1) {
    const section = score.sections[si];
    if (globalIndex < count + section.bars.length) {
      const bi = globalIndex - count;
      return { sectionIndex: si, barIndex: bi, bar: section.bars[bi] };
    }
    count += section.bars.length;
  }
  return null;
}

function cloneScore(score: Score): Score {
  // Structured clone is sufficient; our AST has only plain data.
  return JSON.parse(JSON.stringify(score));
}

export function updateBar(
  score: Score,
  globalIndex: number,
  mutator: (bar: Bar) => void,
): Score {
  const next = cloneScore(score);
  const loc = locateBar(next, globalIndex);
  if (!loc) return next;
  mutator(loc.bar);
  return next;
}

/**
 * Rename a section by index. `label` may be any free-form string — the
 * serializer wraps it in `[ ]`, so callers should strip any stray
 * brackets before passing it in.
 */
export function renameSection(
  score: Score,
  sectionIndex: number,
  label: string,
): Score {
  const next = cloneScore(score);
  const section = next.sections[sectionIndex];
  if (!section) return next;
  section.label = label;
  return next;
}

/**
 * Split the section that contains `globalBarIndex` after that bar, moving
 * the remaining bars into a new section with the given label. No-op if
 * the bar is the last of its section (there's nothing to move).
 */
export function insertSectionAfterBar(
  score: Score,
  globalBarIndex: number,
  label: string,
): Score {
  const next = cloneScore(score);
  const loc = locateBar(next, globalBarIndex);
  if (!loc) return next;
  const source = next.sections[loc.sectionIndex];
  const splitAt = loc.barIndex + 1;
  const beatCount = Math.max(1, score.meter.beats);

  if (splitAt >= source.bars.length) {
    // Nothing to split off — seed the new section with a single empty
    // bar so the user can click into it and start editing. A zero-bar
    // section has no visible target in the preview and is impossible
    // to select.
    next.sections.splice(loc.sectionIndex + 1, 0, {
      label,
      bars: [freshEmptyBar(beatCount)],
    });
    return next;
  }
  const tail = source.bars.splice(splitAt);
  next.sections.splice(loc.sectionIndex + 1, 0, { label, bars: tail });
  return next;
}

function freshEmptyBar(beatCount: number): Bar {
  return {
    beats: Array.from({ length: beatCount }, () => emptyBeat()),
    repeatCount: 1,
    repeatPrevious: false,
    source: "",
  };
}

/**
 * Delete a section; its bars fold into the preceding section (or the
 * following one if it's the first). No-op when there's only one section.
 */
export function deleteSection(score: Score, sectionIndex: number): Score {
  const next = cloneScore(score);
  if (next.sections.length <= 1) return next;
  const removed = next.sections.splice(sectionIndex, 1)[0];
  if (!removed) return next;
  const mergeTarget = next.sections[sectionIndex - 1] ?? next.sections[0];
  mergeTarget.bars.push(...removed.bars);
  return next;
}

export function insertBarAfter(score: Score, globalIndex: number): Score {
  const next = cloneScore(score);
  const loc = locateBar(next, globalIndex);
  if (!loc) return next;
  const source = loc.bar;
  const copy: Bar = JSON.parse(JSON.stringify(source));
  copy.source = "";
  next.sections[loc.sectionIndex].bars.splice(loc.barIndex + 1, 0, copy);
  return next;
}

/**
 * Return a deep copy of bars in a (possibly cross-section) global range.
 * Order preserved. Bars whose structural flags lose meaning in isolation
 * (section-relative navigation markers, first/second endings) are kept
 * as-is — callers that round-trip through serialize will round-trip
 * those too, and users pasting into a different context get to decide
 * whether to keep or manually clear them.
 */
export function extractBars(score: Score, startIndex: number, endIndex: number): Bar[] {
  const lo = Math.min(startIndex, endIndex);
  const hi = Math.max(startIndex, endIndex);
  const out: Bar[] = [];
  let count = 0;
  for (const section of score.sections) {
    const localLo = Math.max(0, lo - count);
    const localHi = Math.min(section.bars.length - 1, hi - count);
    if (localLo <= localHi && localHi >= 0 && localLo < section.bars.length) {
      for (let i = localLo; i <= localHi; i += 1) {
        out.push(JSON.parse(JSON.stringify(section.bars[i])));
      }
    }
    count += section.bars.length;
    if (count > hi) break;
  }
  return out;
}

/**
 * Delete a contiguous global range of bars. If an entire section ends
 * up with zero bars, the section is kept (user may still want its
 * label); call deleteSection separately to remove it.
 */
export function deleteBars(
  score: Score,
  startIndex: number,
  endIndex: number,
): Score {
  const lo = Math.min(startIndex, endIndex);
  const hi = Math.max(startIndex, endIndex);
  const next = cloneScore(score);
  let count = 0;
  for (const section of next.sections) {
    const size = section.bars.length;
    const localLo = Math.max(0, lo - count);
    const localHi = Math.min(size - 1, hi - count);
    if (localLo <= localHi && localHi >= 0 && localLo < size) {
      section.bars.splice(localLo, localHi - localLo + 1);
    }
    count += size;
    if (count > hi) break;
  }
  return next;
}

/**
 * Paste a list of bars immediately before `globalIndex`. The new bars
 * slot into the same section as the target bar. Each pasted bar is
 * deep-cloned so callers can reuse the source array freely.
 */
export function pasteBarsBefore(
  score: Score,
  globalIndex: number,
  bars: Bar[],
): Score {
  if (bars.length === 0) return score;
  const next = cloneScore(score);
  const loc = locateBar(next, globalIndex);
  if (!loc) {
    // Empty score (or out-of-range): append into the last (or only) section.
    const section =
      next.sections[next.sections.length - 1] ??
      (() => {
        const s = { label: "", bars: [] };
        next.sections.push(s);
        return s;
      })();
    section.bars.push(...bars.map((b) => JSON.parse(JSON.stringify(b)) as Bar));
    return next;
  }
  const section = next.sections[loc.sectionIndex];
  section.bars.splice(
    loc.barIndex,
    0,
    ...bars.map((b) => JSON.parse(JSON.stringify(b)) as Bar),
  );
  return next;
}

/**
 * Paste bars at the end of the section that currently contains
 * `globalIndex`. When the bar index is out of range, bars are appended
 * to the final section.
 */
export function pasteBarsAtSectionEnd(
  score: Score,
  globalIndex: number,
  bars: Bar[],
): Score {
  if (bars.length === 0) return score;
  const next = cloneScore(score);
  const loc = locateBar(next, globalIndex);
  const section =
    (loc && next.sections[loc.sectionIndex]) ??
    next.sections[next.sections.length - 1];
  if (!section) return next;
  section.bars.push(...bars.map((b) => JSON.parse(JSON.stringify(b)) as Bar));
  return next;
}

export function deleteBar(score: Score, globalIndex: number): Score {
  const next = cloneScore(score);
  const loc = locateBar(next, globalIndex);
  if (!loc) return next;
  next.sections[loc.sectionIndex].bars.splice(loc.barIndex, 1);
  return next;
}

export function setBarRepeatPrevious(
  score: Score,
  globalIndex: number,
  hint: RepeatHint | null,
): Score {
  const beatCount = Math.max(1, score.meter.beats);
  return updateBar(score, globalIndex, (bar) => {
    if (hint === null) {
      bar.repeatPrevious = false;
      bar.repeatHint = undefined;
      // Restore a usable edit grid if the bar is currently empty so the
      // user has something to click on. Bars that already held notes
      // keep them — toggling % → Pattern never loses content.
      if (bar.beats.length === 0) {
        bar.beats = Array.from({ length: beatCount }, () => emptyBeat());
      }
    } else {
      bar.repeatPrevious = true;
      bar.repeatHint = hint;
      // Intentionally do NOT clear bar.beats — serializer outputs `| % |`
      // regardless (ignoring beats), and the editor can restore them when
      // the user toggles back to Pattern.
    }
  });
}

/**
 * Empty the bar: strip every lane so nothing plays and nothing draws
 * (except the meter-sized run of empty beats). Keeps the bar itself
 * and its structural flags (repeat markers, ending, navigation) so a
 * surrounding section's timing isn't disturbed.
 */
export function clearBar(score: Score, globalIndex: number): Score {
  const beatCount = Math.max(1, score.meter.beats);
  return updateBar(score, globalIndex, (bar) => {
    bar.repeatPrevious = false;
    bar.repeatHint = undefined;
    bar.beats = Array.from({ length: beatCount }, () => emptyBeat());
  });
}

export function setLaneDivision(
  score: Score,
  globalIndex: number,
  beatIndex: number,
  instrument: Instrument,
  division: number,
): Score {
  return updateBar(score, globalIndex, (bar) => {
    const beat = bar.beats[beatIndex] ?? emptyBeat();
    if (!bar.beats[beatIndex]) bar.beats[beatIndex] = beat;
    const lane = findOrCreateLane(beat, instrument);
    // Leaving group mode: dropping sub-beats back to a single group.
    lane.groups = undefined;
    lane.division = division;
    const prev = lane.slots;
    lane.slots = Array.from({ length: division }, (_, i) => prev[i] ?? null);
    lane.tuplet = deriveAutoTuplet(division);
  });
}

/**
 * Set group-level division (lane has `groups[]`). Keeps other groups intact.
 * Ensures that mode by converting the lane into groups when needed.
 */
export function setGroupDivision(
  score: Score,
  globalIndex: number,
  beatIndex: number,
  instrument: Instrument,
  groupIndex: number,
  division: number,
): Score {
  return updateBar(score, globalIndex, (bar) => {
    const beat = bar.beats[beatIndex];
    if (!beat) return;
    const lane = beat.lanes.find((l) => l.instrument === instrument);
    if (!lane || !lane.groups) return;
    const group = lane.groups[groupIndex];
    if (!group) return;
    group.division = division;
    const prev = group.slots;
    group.slots = Array.from({ length: division }, (_, i) => prev[i] ?? null);
    group.tuplet = deriveAutoTuplet(division);
  });
}

/** Split the lane's beat into `count` equal-ratio groups (replaces existing). */
export function splitBeatIntoGroups(
  score: Score,
  globalIndex: number,
  beatIndex: number,
  instrument: Instrument,
  count: number,
): Score {
  return updateBar(score, globalIndex, (bar) => {
    const beat = bar.beats[beatIndex] ?? emptyBeat();
    if (!bar.beats[beatIndex]) bar.beats[beatIndex] = beat;
    const lane = findOrCreateLane(beat, instrument);
    if (count <= 1) {
      // Merge back: collapse to a single-group lane, keep first group's data.
      if (lane.groups && lane.groups.length) {
        const first = lane.groups[0];
        lane.division = first.division;
        lane.slots = first.slots;
        lane.tuplet = first.tuplet;
      }
      lane.groups = undefined;
      return;
    }
    const ratio = 1 / count;
    const groups: LaneGroup[] = Array.from({ length: count }, (_, i) => {
      // Preserve existing content in the first group when transitioning
      // from a single-group lane into a split one.
      if (i === 0 && (!lane.groups || lane.groups.length === 0)) {
        return {
          ratio,
          division: lane.division,
          tuplet: lane.tuplet,
          slots: lane.slots,
        };
      }
      if (lane.groups && lane.groups[i]) {
        const existing = lane.groups[i];
        return { ...existing, ratio };
      }
      return { ratio, division: 1, slots: [null] };
    });
    lane.groups = groups;
    lane.division = groups[0].division;
    lane.slots = groups[0].slots;
    lane.tuplet = groups[0].tuplet;
  });
}

function deriveAutoTuplet(division: number): number | undefined {
  if (division === 3 || division === 5 || division === 7) return division;
  if (division === 6) return 6;
  return undefined;
}

export function toggleSlot(
  score: Score,
  globalIndex: number,
  beatIndex: number,
  instrument: Instrument,
  slotIndex: number,
  groupIndex = 0,
): Score {
  return updateBar(score, globalIndex, (bar) => {
    const beat = bar.beats[beatIndex] ?? emptyBeat();
    if (!bar.beats[beatIndex]) bar.beats[beatIndex] = beat;
    const lane = findOrCreateLane(beat, instrument);

    // Dot-expanded lanes address slots by their flat index across
    // one-slot-per-group structure.
    if (isDotExpanded(lane) && (groupIndex === 0 || groupIndex === undefined)) {
      const g = lane.groups![slotIndex];
      if (!g) return;
      g.slots[0] = g.slots[0] ? null : createHit(instrument);
      return;
    }

    // Writing into a slot beyond the current division must grow division
    // so the renderer can place the new hit. Pad intermediate slots with
    // null to keep the array dense.
    if (lane.groups && lane.groups[groupIndex]) {
      const g = lane.groups[groupIndex];
      if (slotIndex >= g.division) {
        growGroup(g, slotIndex + 1);
      }
      if (!g.slots[slotIndex]) g.slots[slotIndex] = createHit(instrument);
      else g.slots[slotIndex] = null;
      return;
    }
    if (!lane.groups && groupIndex === 0) {
      if (slotIndex >= lane.division) {
        growLane(lane, slotIndex + 1);
      }
      if (!lane.slots[slotIndex]) lane.slots[slotIndex] = createHit(instrument);
      else lane.slots[slotIndex] = null;
    }
  });
}

function growLane(lane: LaneBeat, newDivision: number) {
  const next: Array<Hit | null> = Array.from(
    { length: newDivision },
    (_, i) => lane.slots[i] ?? null,
  );
  lane.slots = next;
  lane.division = newDivision;
  lane.tuplet = deriveAutoTuplet(newDivision);
}

function growGroup(group: LaneGroup, newDivision: number) {
  const next: Array<Hit | null> = Array.from(
    { length: newDivision },
    (_, i) => group.slots[i] ?? null,
  );
  group.slots = next;
  group.division = newDivision;
  group.tuplet = deriveAutoTuplet(newDivision);
}

export function toggleArticulation(
  score: Score,
  globalIndex: number,
  beatIndex: number,
  instrument: Instrument,
  slotIndex: number,
  articulation: Articulation,
  groupIndex = 0,
): Score {
  return updateBar(score, globalIndex, (bar) => {
    const lane = bar.beats[beatIndex]?.lanes.find(
      (l) => l.instrument === instrument,
    );
    if (!lane) return;
    const resolved = resolveSlot(lane, slotIndex, groupIndex);
    const hit = resolved?.slots[resolved.idx];
    if (!hit) return;
    const i = hit.articulations.indexOf(articulation);
    if (i === -1) hit.articulations.push(articulation);
    else hit.articulations.splice(i, 1);
  });
}

/**
 * Cycle the dots on the slot's hit: 0 → 1 → 2 → 0. Dots can only be
 * attached to an actual hit (not a rest); noop on empty slots and on
 * lanes that are already split via the explicit `,` API (mixing user
 * splits with dot expansion would require two-level groups).
 */
export function cycleDots(
  score: Score,
  globalIndex: number,
  beatIndex: number,
  instrument: Instrument,
  slotIndex: number,
): Score {
  return updateBar(score, globalIndex, (bar) => {
    const beat = bar.beats[beatIndex];
    if (!beat) return;
    const laneIdx = beat.lanes.findIndex((l) => l.instrument === instrument);
    if (laneIdx < 0) return;
    const lane = beat.lanes[laneIdx];

    // Flatten to a plain slot list if the lane was previously dot-expanded.
    const isDotExpanded =
      !!lane.groups &&
      lane.groups.length > 1 &&
      lane.groups.every((g) => g.division === 1 && g.slots.length === 1);
    const flat: Array<Hit | null> = isDotExpanded
      ? lane.groups!.flatMap((g) => g.slots)
      : lane.groups && lane.groups.length > 1
        ? [] // explicit `,`-split lane: not supported in this release
        : [...lane.slots];
    if (flat.length === 0) return;
    if (slotIndex < 0 || slotIndex >= flat.length) return;
    const hit = flat[slotIndex];
    if (!hit) return;

    const next = ((hit.dots ?? 0) + 1) % 3;
    const newHit: Hit = { ...hit };
    if (next === 0) delete newHit.dots;
    else newHit.dots = next;
    flat[slotIndex] = newHit;

    const expanded = maybeExpandDotted(flat);
    if (expanded) {
      beat.lanes[laneIdx] = {
        ...lane,
        division: 1,
        tuplet: undefined,
        slots: [flat[0] ?? null],
        groups: expanded,
      };
    } else {
      beat.lanes[laneIdx] = {
        ...lane,
        division: flat.length,
        tuplet: undefined,
        slots: flat,
        groups: undefined,
      };
    }
  });
}

export function toggleBarRepeatStart(
  score: Score,
  globalIndex: number,
): Score {
  return updateBar(score, globalIndex, (bar) => {
    bar.repeatStart = !bar.repeatStart ? true : undefined;
  });
}

export function toggleBarRepeatEnd(
  score: Score,
  globalIndex: number,
  times = 2,
): Score {
  return updateBar(score, globalIndex, (bar) => {
    bar.repeatEnd = bar.repeatEnd ? undefined : { times };
  });
}

export function cycleBarEnding(
  score: Score,
  globalIndex: number,
): Score {
  return updateBar(score, globalIndex, (bar) => {
    if (!bar.ending) bar.ending = "1";
    else if (bar.ending === "1") bar.ending = "2";
    else bar.ending = undefined;
  });
}

/**
 * Remove a single instrument's lane from a specific beat. After this call
 * the beat contains no LaneBeat for that instrument, so the UI will fall
 * back to its "empty-lane default" (bar-level resolution template).
 */
export function clearLaneBeat(
  score: Score,
  globalIndex: number,
  beatIndex: number,
  instrument: Instrument,
): Score {
  return updateBar(score, globalIndex, (bar) => {
    const beat = bar.beats[beatIndex];
    if (!beat) return;
    beat.lanes = beat.lanes.filter((l) => l.instrument !== instrument);
  });
}

export function setSticking(
  score: Score,
  globalIndex: number,
  beatIndex: number,
  instrument: Instrument,
  slotIndex: number,
  sticking: "R" | "L" | null,
  groupIndex = 0,
): Score {
  return updateBar(score, globalIndex, (bar) => {
    const lane = bar.beats[beatIndex]?.lanes.find(
      (l) => l.instrument === instrument,
    );
    if (!lane) return;
    const resolved = resolveSlot(lane, slotIndex, groupIndex);
    const hit = resolved?.slots[resolved.idx];
    if (!hit) return;
    hit.sticking = sticking ?? undefined;
  });
}

function laneGroupSlots(
  lane: LaneBeat,
  groupIndex: number,
): Array<Hit | null> | null {
  if (lane.groups && lane.groups[groupIndex]) {
    return lane.groups[groupIndex].slots;
  }
  if (!lane.groups && groupIndex === 0) return lane.slots;
  return null;
}

/**
 * Walk a flat slot index across a dot-expanded lane's one-slot-per-group
 * structure; returns the underlying {slots, idx} so callers can mutate
 * the single-slot sub-group without knowing about dot expansion.
 */
function isDotExpanded(lane: LaneBeat): boolean {
  return (
    !!lane.groups &&
    lane.groups.length > 1 &&
    lane.groups.every((g) => g.division === 1 && g.slots.length === 1)
  );
}

function resolveSlot(
  lane: LaneBeat,
  slotIndex: number,
  groupIndex: number | undefined,
): { slots: Array<Hit | null>; idx: number } | null {
  if (isDotExpanded(lane) && (groupIndex === undefined || groupIndex === 0)) {
    const g = lane.groups![slotIndex];
    if (!g) return null;
    return { slots: g.slots, idx: 0 };
  }
  const slots = laneGroupSlots(lane, groupIndex ?? 0);
  if (!slots) return null;
  return { slots, idx: slotIndex };
}

export function emptyBeat(): Beat {
  return { lanes: [] };
}

function findOrCreateLane(beat: Beat, instrument: Instrument): LaneBeat {
  const existing = beat.lanes.find((l) => l.instrument === instrument);
  if (existing) return existing;
  const lane: LaneBeat = {
    instrument,
    division: 1,
    slots: [null],
  };
  beat.lanes.push(lane);
  return lane;
}

function createHit(instrument: Instrument): Hit {
  return {
    instrument,
    head: defaultHeadFor(instrument),
    articulations: [],
  };
}
