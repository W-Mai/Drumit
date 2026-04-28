import type { Bar, Score, Hit } from "./types";
import { hitVelocity } from "./midi";

export interface PlaybackEvent {
  /** Seconds from the start of the score. */
  time: number;
  /** Seconds of audible duration (for envelopes / note-off). */
  duration: number;
  /** MIDI velocity 0–127. */
  velocity: number;
  /** Source hit (instrument, articulations, sticking). */
  hit: Hit;
  /** Global bar index (0-based) and beat (0-based) for cursor sync. */
  barIndex: number;
  beatIndex: number;
}

export interface ScheduleOptions {
  /** BPM to use if the score doesn't define one. */
  defaultBpm?: number;
  /** Tempo override in BPM (0 = honor score tempo). */
  tempoOverride?: number;
}

/**
 * Produce an absolute time-ordered schedule of playback events for the
 * entire score. Pure function — easy to test, no audio side effects.
 */
export function schedule(
  score: Score,
  options: ScheduleOptions = {},
): { events: PlaybackEvent[]; totalDuration: number } {
  const bpm =
    options.tempoOverride && options.tempoOverride > 0
      ? options.tempoOverride
      : score.tempo?.bpm || options.defaultBpm || 100;
  const secondsPerBeat = 60 / bpm;

  const events: PlaybackEvent[] = [];
  let cursor = 0;
  let lastBar: Bar | null = null;
  let barIndex = 0;

  for (const section of score.sections) {
    for (const bar of section.bars) {
      const barToPlay = bar.repeatPrevious ? lastBar : bar;
      if (!barToPlay) {
        barIndex += 1;
        continue;
      }

      const meterBeats = bar.meter?.beats ?? score.meter.beats;
      const beatsPerBar = meterBeats;

      const repeats = Math.max(1, bar.repeatCount);
      for (let r = 0; r < repeats; r += 1) {
        for (let beatIndex = 0; beatIndex < beatsPerBar; beatIndex += 1) {
          const beat = barToPlay.beats[beatIndex];
          if (!beat) continue;
          const beatStart = cursor + beatIndex * secondsPerBeat;
          for (const lane of beat.lanes) {
            const groups = lane.groups ?? [
              {
                ratio: 1,
                division: lane.division,
                tuplet: lane.tuplet,
                slots: lane.slots,
              },
            ];
            let groupStart = beatStart;
            for (const group of groups) {
              const groupDuration = secondsPerBeat * group.ratio;
              const slotDuration = groupDuration / Math.max(1, group.division);
              group.slots.forEach((hit, slotIndex) => {
                if (!hit) return;
                const slotTime = groupStart + slotIndex * slotDuration;
                expandHit(hit, slotTime, slotDuration, barIndex, beatIndex).forEach((e) =>
                  events.push(e),
                );
              });
              groupStart += groupDuration;
            }
          }
        }
        cursor += beatsPerBar * secondsPerBeat;
      }

      if (!bar.repeatPrevious) lastBar = bar;
      barIndex += 1;
    }
  }

  // Stable sort by time, keep original order for identical timestamps.
  events.sort((a, b) => a.time - b.time);

  return { events, totalDuration: cursor };
}

/**
 * Expand a single notated hit into playback events. Most hits emit exactly
 * one event, but articulations can add or replace sounds:
 *   - flam  → grace hit ~15ms before the main one (lower velocity)
 *   - roll  → 4 rapid hits across the slot duration
 *   - choke → main hit at max velocity, short duration to signal release
 *
 * Ghost / accent are already reflected in `hitVelocity`.
 */
function expandHit(
  hit: Hit,
  time: number,
  slotDuration: number,
  barIndex: number,
  beatIndex: number,
): PlaybackEvent[] {
  const base: PlaybackEvent = {
    time,
    duration: slotDuration,
    velocity: hitVelocity(hit),
    hit,
    barIndex,
    beatIndex,
  };

  const events: PlaybackEvent[] = [];

  if (hit.articulations.includes("flam")) {
    // Grace note ~18ms before the main hit, 60% velocity, same instrument.
    events.push({
      ...base,
      time: Math.max(0, time - 0.018),
      duration: 0.018,
      velocity: Math.round(base.velocity * 0.55),
    });
  }

  if (hit.articulations.includes("roll")) {
    // 4 rapid strokes across the slot (32nd-ish at the slot's tempo).
    const n = 4;
    const step = Math.max(0.015, slotDuration / n);
    for (let i = 0; i < n; i += 1) {
      events.push({
        ...base,
        time: time + i * step,
        duration: step,
        velocity: i === 0 ? base.velocity : Math.round(base.velocity * 0.7),
      });
    }
    return events;
  }

  if (hit.articulations.includes("choke")) {
    events.push({
      ...base,
      velocity: Math.min(127, Math.round(base.velocity * 1.1)),
      duration: Math.min(slotDuration, 0.03),
    });
    return events;
  }

  events.push(base);
  return events;
}

/**
 * Build click-track events (quarter-note metronome) for the duration of
 * the score. One MIDI note on the downbeat (higher pitch) and subdivided
 * clicks on the other beats.
 */
export function metronomeEvents(
  score: Score,
  totalDuration: number,
  options: ScheduleOptions = {},
): PlaybackEvent[] {
  const bpm =
    options.tempoOverride && options.tempoOverride > 0
      ? options.tempoOverride
      : score.tempo?.bpm || options.defaultBpm || 100;
  const secondsPerBeat = 60 / bpm;
  const beatsPerBar = score.meter.beats;

  const events: PlaybackEvent[] = [];
  const n = Math.ceil(totalDuration / secondsPerBeat);
  for (let i = 0; i < n; i += 1) {
    const isDownbeat = i % beatsPerBar === 0;
    events.push({
      time: i * secondsPerBeat,
      duration: 0.02,
      velocity: isDownbeat ? 110 : 80,
      hit: {
        instrument: isDownbeat ? "rideBell" : "hihatFoot",
        head: "x",
        articulations: [],
      },
      barIndex: Math.floor(i / beatsPerBar),
      beatIndex: i % beatsPerBar,
    });
  }
  return events;
}
