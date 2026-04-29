import type { Bar, Hit, LaneBeat, LaneGroup, Score } from "../types";
import { mappingFor, type DrumStaffMapping } from "./drumMap";
import type {
  Duration,
  StaffBar,
  StaffGlyph,
  StaffLayout,
  StaffNote,
  StaffSystem,
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

/**
 * Phase-1 layout: one system containing all bars on one line. Each bar
 * gets a fixed width; within a bar each beat is divided into slots and
 * every hit slot produces a StaffNote with the glyphs from the drum
 * map. Stems / beams / tuplets / rests / barlines come in later S-tasks.
 */
export function layoutStaff(
  score: Score,
  options: StaffLayoutOptions,
): StaffLayout {
  const barsFlat = score.sections.flatMap((s) => s.bars);
  const beatsPerBar = score.meter.beats;
  const sideMargin = 20;

  const totalBars = barsFlat.length;
  const minBarWidth = 100;
  const availableForBars =
    options.width - sideMargin * 2 - CLEF_PLUS_METER_WIDTH;
  const barWidth = Math.max(
    minBarWidth,
    totalBars > 0 ? availableForBars / totalBars : minBarWidth,
  );

  const systemY = HEADER_HEIGHT + STAFF_TOP_PAD;
  const bars: StaffBar[] = [];
  let x = sideMargin + CLEF_PLUS_METER_WIDTH;

  for (const bar of barsFlat) {
    const staffBar = layoutBar({
      bar,
      barIndex: bar.source ? bars.length : bars.length,
      x,
      width: barWidth,
      beatsPerBar,
    });
    bars.push(staffBar);
    x += barWidth;
  }

  const system: StaffSystem = {
    y: systemY,
    bars,
  };

  return {
    width: options.width,
    height: HEADER_HEIGHT + STAFF_ROW_HEIGHT,
    systems: [system],
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

function layoutBar({ bar, barIndex, x, width, beatsPerBar }: BarCtx): StaffBar {
  const notes: StaffNote[] = [];
  const beatWidth = width / beatsPerBar;

  const beats = bar.beats.length > 0 ? bar.beats : fillEmptyBeats(beatsPerBar);

  for (let beatIndex = 0; beatIndex < beatsPerBar; beatIndex += 1) {
    const beat = beats[beatIndex] ?? { lanes: [] };
    const beatStartX = x + beatIndex * beatWidth;
    const slots = mergeLanesToSlots(beat.lanes);
    for (const slot of slots) {
      const glyphs: StaffGlyph[] = [];
      const mappings: DrumStaffMapping[] = [];
      for (const hit of slot.hits) {
        const m = mappingFor(hit.instrument);
        if (!m) continue;
        glyphs.push({ step: m.step, head: m.head });
        mappings.push(m);
      }
      if (glyphs.length === 0) continue;
      const hasAbove = mappings.some((m) => m.above);
      // Whole notes carry no stem at all; otherwise pick up / down based on
      // whether any voice in the chord is a cymbal-family glyph.
      const stem: StaffNote["stem"] =
        slot.duration === "w" ? null : hasAbove ? "up" : "down";
      notes.push({
        x: beatStartX + slot.offsetRatio * beatWidth,
        duration: slot.duration,
        glyphs,
        stem,
        tuplet: slot.tuplet,
      });
    }
  }

  return {
    index: barIndex,
    x,
    width,
    notes,
    rests: [],
    beams: [],
    tuplets: [],
    barlineX: x + width,
  };
}

interface MergedSlot {
  offsetRatio: number;
  duration: Duration;
  hits: Hit[];
  tuplet?: number;
}

/**
 * Collapse the multi-lane LaneBeat view into a flat list of slots ordered
 * by their position inside the beat. Slots that land on the same
 * (rounded) beat-fraction get merged so kick+snare+hh played together
 * produce a single chord-like note.
 */
function mergeLanesToSlots(lanes: LaneBeat[]): MergedSlot[] {
  const byOffset = new Map<string, MergedSlot>();
  for (const lane of lanes) {
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
      for (let i = 0; i < division; i += 1) {
        const hit = g.slots[i] ?? null;
        if (!hit) {
          // Skip — rests collapsed at merge time; S7 will place explicit rests.
        } else {
          const offsetRatio = cursor + (i / division) * g.ratio;
          const key = offsetRatio.toFixed(5);
          const duration = guessDuration(division * (1 / g.ratio), g.tuplet);
          const existing = byOffset.get(key);
          if (existing) {
            existing.hits.push(hit);
          } else {
            byOffset.set(key, {
              offsetRatio,
              duration,
              hits: [hit],
              tuplet: g.tuplet,
            });
          }
        }
      }
      cursor += g.ratio;
    }
  }
  return [...byOffset.values()].sort((a, b) => a.offsetRatio - b.offsetRatio);
}

/**
 * Very rough beat-division → duration mapping. Caller normalises by
 * dividing by group ratio so a half-beat group of 2 slots maps as if it
 * were 4 slots in the full beat.
 */
function guessDuration(effectiveDivision: number, tuplet?: number): Duration {
  if (tuplet === 3 || tuplet === 6) {
    if (effectiveDivision <= 3) return "8";
    if (effectiveDivision <= 6) return "16";
    return "32";
  }
  if (effectiveDivision <= 1) return "q";
  if (effectiveDivision <= 2) return "8";
  if (effectiveDivision <= 4) return "16";
  return "32";
}

function fillEmptyBeats(n: number) {
  return Array.from({ length: n }, () => ({ lanes: [] }));
}
