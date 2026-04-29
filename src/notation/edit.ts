import { defaultHeadFor } from "./instruments";
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
  return updateBar(score, globalIndex, (bar) => {
    if (hint === null) {
      bar.repeatPrevious = false;
      bar.repeatHint = undefined;
      if (bar.beats.length === 0) {
        bar.beats = Array.from({ length: 4 }, () => emptyBeat());
      }
    } else {
      bar.repeatPrevious = true;
      bar.repeatHint = hint;
      bar.beats = [];
    }
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
    const slots = laneGroupSlots(lane, groupIndex);
    const hit = slots?.[slotIndex];
    if (!hit) return;
    const i = hit.articulations.indexOf(articulation);
    if (i === -1) hit.articulations.push(articulation);
    else hit.articulations.splice(i, 1);
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
    const slots = laneGroupSlots(lane, groupIndex);
    const hit = slots?.[slotIndex];
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
