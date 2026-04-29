import type {
  Bar,
  Hit,
  LaneGroup,
  NavigationMarker,
  Score,
} from "../types";
import { mappingFor, type DrumStaffMapping } from "./drumMap";
import type {
  Duration,
  StaffArticulation,
  StaffBar,
  StaffBeam,
  StaffGlyph,
  StaffLayout,
  StaffNote,
  StaffRest,
  StaffSystem,
  StaffTupletBracket,
  StaffVoice,
  VoicePosition,
} from "./types";

const HEADER_HEIGHT = 42;
const STAFF_TOP_PAD = 20;
const STAFF_SPACE = 10;
const STAFF_HEIGHT = STAFF_SPACE * 4;
const SYSTEM_VERTICAL_PAD = STAFF_SPACE * 4;
const STAFF_ROW_HEIGHT = STAFF_HEIGHT + SYSTEM_VERTICAL_PAD;
const CLEF_PLUS_METER_WIDTH = 48;

export interface StaffLayoutOptions {
  width: number;
}

export function layoutStaff(
  score: Score,
  options: StaffLayoutOptions,
): StaffLayout {
  const barsFlat = score.sections.flatMap((s) => s.bars);
  const beatsPerBar = score.meter.beats;
  const sideMargin = 20;
  const minBarWidth = 120;

  const availableForBars =
    options.width - sideMargin * 2 - CLEF_PLUS_METER_WIDTH;
  const barsPerSystem = Math.max(
    1,
    Math.floor(availableForBars / minBarWidth),
  );
  const barWidth = availableForBars / barsPerSystem;

  const systems: StaffSystem[] = [];
  let y = HEADER_HEIGHT + STAFF_TOP_PAD;
  for (let i = 0; i < barsFlat.length; i += barsPerSystem) {
    const slice = barsFlat.slice(i, i + barsPerSystem);
    let x = sideMargin + CLEF_PLUS_METER_WIDTH;
    const bars: StaffBar[] = slice.map((bar, j) => {
      const staffBar = layoutBar({
        bar,
        barIndex: i + j,
        x,
        width: barWidth,
        beatsPerBar,
      });
      x += barWidth;
      return staffBar;
    });
    systems.push({ y, bars });
    y += STAFF_ROW_HEIGHT;
  }
  if (systems.length === 0) {
    systems.push({ y, bars: [] });
    y += STAFF_ROW_HEIGHT;
  }

  return {
    width: options.width,
    height: y,
    systems,
    title: score.title,
    tempo: score.tempo ? `♩ = ${score.tempo.bpm}` : undefined,
    meter: `${score.meter.beats}/${score.meter.beatUnit}`,
  };
}

interface BarCtx {
  bar: Bar;
  barIndex: number;
  x: number;
  width: number;
  beatsPerBar: number;
}

interface RawNote {
  beatIndex: number;
  tick: number;
  finest: number;
  /** Individual per-hit effective division — preserves the actual
   *  time value (8th / 16th / …) so secondary beams can flag the
   *  shorter notes. */
  hitDivisions: number[];
  hits: Hit[];
  mappings: DrumStaffMapping[];
  /** Tuplet number carried by this tick (3 / 6 etc.) when any hit's
   *  group is a tuplet. */
  tuplet?: number;
}

function layoutBar({ bar, barIndex, x, width, beatsPerBar }: BarCtx): StaffBar {
  const beatWidth = width / beatsPerBar;
  const beats = bar.beats.length > 0 ? bar.beats : fillEmptyBeats(beatsPerBar);

  const upper = collectVoice("upper", beats, beatsPerBar, x, beatWidth);
  const lower = collectVoice("lower", beats, beatsPerBar, x, beatWidth);

  return {
    index: barIndex,
    x,
    width,
    beats: beatsPerBar,
    upper,
    lower,
    barlineX: x + width,
    endBarline: bar.repeatEnd ? "repeat-end" : "single",
    repeatStart: !!bar.repeatStart,
    repeatTimes: bar.repeatEnd?.times,
    ending: bar.ending,
    navigationLabel: bar.navigation ? navigationLabel(bar.navigation) : undefined,
  };
}

function collectVoice(
  position: VoicePosition,
  beats: Bar["beats"],
  beatsPerBar: number,
  barX: number,
  beatWidth: number,
): StaffVoice {
  const rawPerBeat: RawNote[][] = Array.from(
    { length: beatsPerBar },
    () => [],
  );

  for (let beatIndex = 0; beatIndex < beatsPerBar; beatIndex += 1) {
    const beat = beats[beatIndex] ?? { lanes: [] };
    // Gather everything this voice wants in this beat; then pick a
    // single finest division for the beat so all notes normalise to
    // the same duration.
    const voiceHits: Array<{
      offsetRatio: number;
      hit: Hit;
      mapping: DrumStaffMapping;
      groupEffDivision: number;
      groupTuplet?: number;
    }> = [];

    for (const lane of beat.lanes) {
      const mapping0 = mappingFor(lane.instrument);
      if (!mapping0) continue;
      const goesUpper = mapping0.above;
      if ((position === "upper") !== goesUpper) continue;

      const groups: LaneGroup[] =
        lane.groups && lane.groups.length > 0
          ? lane.groups
          : [
              {
                ratio: 1,
                division: Math.max(1, lane.division),
                tuplet: lane.tuplet,
                slots: lane.slots,
              },
            ];
      let cursor = 0;
      for (const g of groups) {
        const division = Math.max(1, g.division);
        const groupEffDivision = division / g.ratio;
        for (let i = 0; i < division; i += 1) {
          const hit = g.slots[i] ?? null;
          if (!hit) continue;
          const offsetRatio = cursor + (i / division) * g.ratio;
          voiceHits.push({
            offsetRatio,
            hit,
            mapping: mapping0,
            groupEffDivision,
            groupTuplet: g.tuplet,
          });
        }
        cursor += g.ratio;
      }
    }

    if (voiceHits.length === 0) continue;

    // Pick the beat's finest effective division = max of the per-hit
    // divisions, rounded up to the nearest standard denomination.
    const maxDiv = voiceHits.reduce(
      (acc, h) => Math.max(acc, h.groupEffDivision),
      1,
    );
    const finest = snapFinest(maxDiv);

    const byTick = new Map<number, RawNote>();
    for (const h of voiceHits) {
      const tick = Math.round(h.offsetRatio * finest);
      const existing = byTick.get(tick);
      if (existing) {
        existing.hits.push(h.hit);
        existing.mappings.push(h.mapping);
        existing.hitDivisions.push(h.groupEffDivision);
      } else {
        byTick.set(tick, {
          beatIndex,
          tick,
          finest,
          hits: [h.hit],
          mappings: [h.mapping],
          hitDivisions: [h.groupEffDivision],
        });
      }
    }
    const sorted = [...byTick.values()].sort((a, b) => a.tick - b.tick);
    rawPerBeat[beatIndex] = sorted;
  }

  const notes: StaffNote[] = [];
  const rests: StaffRest[] = [];
  const noteBeatIndex: number[] = [];
  const noteFinest: number[] = [];

  for (let beatIndex = 0; beatIndex < beatsPerBar; beatIndex += 1) {
    const beatStartX = barX + beatIndex * beatWidth;
    const raws = rawPerBeat[beatIndex];
    if (!raws || raws.length === 0) {
      rests.push({
        x: beatStartX + beatWidth * 0.5,
        duration: "q",
        step: 0,
      });
      continue;
    }
    const finest = raws[0].finest;
    for (const r of raws) {
      const glyphs: StaffGlyph[] = [];
      const artSet = new Set<StaffArticulation>();
      let sticking: "R" | "L" | undefined;
      for (let i = 0; i < r.hits.length; i += 1) {
        const m = r.mappings[i];
        glyphs.push({ step: m.step, head: m.head });
        for (const a of r.hits[i].articulations) {
          if (
            a === "accent" ||
            a === "ghost" ||
            a === "flam" ||
            a === "roll" ||
            a === "choke"
          ) {
            artSet.add(a);
          }
        }
        if (r.hits[i].sticking && !sticking) sticking = r.hits[i].sticking;
      }
      // Per-note duration: use the longest effective division across the
      // chord's voices at this tick (so a 16th + 8th chord would record
      // as "8"; in practice chords at the same tick come from the same
      // group so they share a division).
      const noteDiv = r.hitDivisions.reduce((a, b) => Math.min(a, b), Infinity);
      notes.push({
        x: beatStartX + (r.tick / finest) * beatWidth,
        duration: durationFor(noteDiv),
        glyphs,
        articulations: [...artSet],
        sticking,
      });
      noteBeatIndex.push(beatIndex);
      noteFinest.push(finest);
    }
  }

  const beams = computeBeams(notes, noteBeatIndex, noteFinest);
  const tuplets: StaffTupletBracket[] = [];

  return {
    position,
    notes,
    rests,
    beams,
    tuplets,
  };
}

/** Round an effective division up to the nearest notation-friendly value
 *  we know how to render (1 / 2 / 3 / 4 / 6 / 8). */
function snapFinest(maxDiv: number): number {
  if (maxDiv <= 1) return 1;
  if (maxDiv <= 2) return 2;
  if (maxDiv <= 3) return 3;
  if (maxDiv <= 4) return 4;
  if (maxDiv <= 6) return 6;
  return 8;
}

function durationFor(finest: number): Duration {
  switch (finest) {
    case 1:
      return "q";
    case 2:
      return "8";
    case 3:
      return "8"; // triplet rate; tuplet bracket (future) carries the "3"
    case 4:
      return "16";
    case 6:
      return "16"; // sextuplet rate
    case 8:
    default:
      return "32";
  }
}

const BEAMABLE: Record<Duration, number> = {
  w: 0,
  h: 0,
  q: 0,
  "8": 1,
  "16": 2,
  "32": 3,
};

/**
 * Beams within a beat. Primary beam (level 1) connects every beamable
 * note in the run. Higher-level beams (level 2, 3 for 16ths and 32nds)
 * cover contiguous sub-runs where every note has that flag count.
 *
 * Stem direction is decided at the voice level, so beams never go
 * diagonal across up/down stems.
 */
function computeBeams(
  notes: StaffNote[],
  beatIndex: number[],
  _finest: number[],
): StaffBeam[] {
  void _finest;
  const out: StaffBeam[] = [];

  // Step 1: find primary runs — maximal spans of beamable notes within a beat.
  const runs: Array<{ start: number; end: number }> = [];
  let runStart = -1;
  let runBeat = -1;
  const closeRun = (end: number) => {
    if (runStart !== -1 && end > runStart) {
      runs.push({ start: runStart, end });
    }
    runStart = -1;
    runBeat = -1;
  };
  for (let i = 0; i < notes.length; i += 1) {
    const depth = BEAMABLE[notes[i].duration];
    if (depth === 0) {
      closeRun(i - 1);
      continue;
    }
    if (runStart === -1) {
      runStart = i;
      runBeat = beatIndex[i];
    } else if (beatIndex[i] !== runBeat) {
      closeRun(i - 1);
      runStart = i;
      runBeat = beatIndex[i];
    }
  }
  closeRun(notes.length - 1);

  // Step 2: for each run, emit primary beam + higher-level partial beams.
  for (const run of runs) {
    out.push({ start: run.start, end: run.end, level: 1 });
    for (let level = 2; level <= 3; level += 1) {
      let subStart = -1;
      for (let i = run.start; i <= run.end; i += 1) {
        const hasLevel = BEAMABLE[notes[i].duration] >= level;
        if (hasLevel) {
          if (subStart === -1) subStart = i;
        } else if (subStart !== -1) {
          if (i - 1 > subStart) {
            out.push({ start: subStart, end: i - 1, level });
          }
          subStart = -1;
        }
      }
      if (subStart !== -1 && run.end > subStart) {
        out.push({ start: subStart, end: run.end, level });
      }
    }
  }

  return out;
}

function navigationLabel(nav: NavigationMarker): string {
  switch (nav.kind) {
    case "segno":
      return "𝄋";
    case "coda":
      return "𝄌";
    case "toCoda":
      return "To Coda 𝄌";
    case "fine":
      return "Fine";
    case "dc":
      return nav.target === "coda"
        ? "D.C. al Coda"
        : nav.target === "fine"
          ? "D.C. al Fine"
          : "D.C.";
    case "ds":
      return nav.target === "coda"
        ? "D.S. al Coda"
        : nav.target === "fine"
          ? "D.S. al Fine"
          : "D.S.";
  }
}

function fillEmptyBeats(n: number) {
  return Array.from({ length: n }, () => ({ lanes: [] }));
}
