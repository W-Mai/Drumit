import { defaultHeadFor } from "./instruments";
import type {
  Articulation,
  Bar,
  Beat,
  Hit,
  Instrument,
  LaneBeat,
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
    lane.division = division;
    const prev = lane.slots;
    lane.slots = Array.from({ length: division }, (_, i) => prev[i] ?? null);
    lane.tuplet =
      division === 3 || division === 5 || division === 7 || division === 6
        ? division === 6
          ? 6
          : division
        : undefined;
  });
}

export function toggleSlot(
  score: Score,
  globalIndex: number,
  beatIndex: number,
  instrument: Instrument,
  slotIndex: number,
): Score {
  return updateBar(score, globalIndex, (bar) => {
    const beat = bar.beats[beatIndex] ?? emptyBeat();
    if (!bar.beats[beatIndex]) bar.beats[beatIndex] = beat;
    const lane = findOrCreateLane(beat, instrument);
    if (!lane.slots[slotIndex]) {
      lane.slots[slotIndex] = createHit(instrument);
    } else {
      lane.slots[slotIndex] = null;
    }
  });
}

export function toggleArticulation(
  score: Score,
  globalIndex: number,
  beatIndex: number,
  instrument: Instrument,
  slotIndex: number,
  articulation: Articulation,
): Score {
  return updateBar(score, globalIndex, (bar) => {
    const hit = bar.beats[beatIndex]?.lanes.find(
      (l) => l.instrument === instrument,
    )?.slots[slotIndex];
    if (!hit) return;
    const i = hit.articulations.indexOf(articulation);
    if (i === -1) hit.articulations.push(articulation);
    else hit.articulations.splice(i, 1);
  });
}

export function setSticking(
  score: Score,
  globalIndex: number,
  beatIndex: number,
  instrument: Instrument,
  slotIndex: number,
  sticking: "R" | "L" | null,
): Score {
  return updateBar(score, globalIndex, (bar) => {
    const hit = bar.beats[beatIndex]?.lanes.find(
      (l) => l.instrument === instrument,
    )?.slots[slotIndex];
    if (!hit) return;
    hit.sticking = sticking ?? undefined;
  });
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
