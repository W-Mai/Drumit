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
  tick: number;       // integer tick within the beat (0..finest-1)
  finest: number;     // this beat's finest division for this voice
  hits: Hit[];
  mappings: DrumStaffMapping[];
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

    // Bucket hits by their tick on `finest`.
    const byTick = new Map<number, RawNote>();
    for (const h of voiceHits) {
      const tick = Math.round(h.offsetRatio * finest);
      const existing = byTick.get(tick);
      if (existing) {
        existing.hits.push(h.hit);
        existing.mappings.push(h.mapping);
      } else {
        byTick.set(tick, {
          beatIndex,
          tick,
          finest,
          hits: [h.hit],
          mappings: [h.mapping],
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
    const duration = durationFor(finest);
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
      notes.push({
        x: beatStartX + (r.tick / finest) * beatWidth,
        duration,
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
 * Primary beams only at this stage: a run of ≥2 consecutive notes with
 * any beamable duration inside the same beat. Since all notes in the
 * voice belong to the same stem direction (voice-level), the beam is
 * guaranteed straight.
 *
 * Secondary beams (C5) come later and refine the run with extra
 * partial beams on the shorter-note segments.
 */
function computeBeams(
  notes: StaffNote[],
  beatIndex: number[],
  finest: number[],
): StaffBeam[] {
  const out: StaffBeam[] = [];
  let runStart = -1;
  let runBeat = -1;

  const flush = (end: number) => {
    if (runStart === -1) return;
    if (end > runStart) {
      out.push({ start: runStart, end, level: 1 });
    }
    runStart = -1;
    runBeat = -1;
  };

  for (let i = 0; i < notes.length; i += 1) {
    const depth = BEAMABLE[notes[i].duration];
    if (depth === 0) {
      flush(i - 1);
      continue;
    }
    if (runStart === -1) {
      runStart = i;
      runBeat = beatIndex[i];
      continue;
    }
    if (beatIndex[i] !== runBeat) {
      flush(i - 1);
      runStart = i;
      runBeat = beatIndex[i];
    }
    void finest;
  }
  flush(notes.length - 1);
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
