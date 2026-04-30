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

  // Flatten all bars from all sections into a single addressable list,
  // then compute the actual playback order (expanding |: ... :|, endings,
  // and D.C. / D.S. jumps).
  const flatBars: Bar[] = [];
  for (const section of score.sections) {
    for (const bar of section.bars) flatBars.push(bar);
  }
  const playOrder = expandPlayOrder(flatBars);

  const events: PlaybackEvent[] = [];
  let cursor = 0;
  let lastBar: Bar | null = null;

  for (const { barIndex } of playOrder) {
    const bar = flatBars[barIndex];
    const barToPlay = bar.repeatPrevious ? lastBar : bar;

    const meterBeats = bar.meter?.beats ?? score.meter.beats;
    const beatsPerBar = meterBeats;
    const barDuration = beatsPerBar * secondsPerBeat;

    // Empty bars (explicit whole-bar rest) and bars whose repeat target
    // is missing still consume time so the cursor stays in sync with
    // metronome / playhead, they just emit no events.
    if (!barToPlay || bar.empty) {
      const repeatsSilent = Math.max(1, bar.repeatCount);
      cursor += barDuration * repeatsSilent;
      if (!bar.repeatPrevious) lastBar = bar;
      continue;
    }

    // Single-bar repeat count (the `x3` on a plain bar, kept for back-compat)
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
  }

  events.sort((a, b) => a.time - b.time);
  return { events, totalDuration: cursor };
}

/**
 * Compute the actual bar playback order for a flat list of bars, expanding
 * `|: ... :| xN` repeats, honoring `[1.` / `[2.` endings, and jumping on
 * D.C. / D.S. / (to) Coda / Fine.
 *
 * Returns an array of `{ barIndex }` — the index into the input list, in
 * the order the bars should play. A single logical bar can appear multiple
 * times in the output when it sits inside a repeat.
 */
export function expandPlayOrder(
  bars: Bar[],
): Array<{ barIndex: number }> {
  const out: Array<{ barIndex: number }> = [];
  const segnoIndex = bars.findIndex((b) => b.navigation?.kind === "segno");
  const codaIndex = bars.findIndex((b) => b.navigation?.kind === "coda");

  const SAFETY_LIMIT = 10_000; // prevents infinite loops on malformed scores

  let i = 0;
  let lastRepeatStart = 0;
  // Track repeat-pass counters by bar-index (key = barIndex of the :| bar).
  const repeatPasses = new Map<number, number>();
  // Have we already jumped via D.C. / D.S. ? Prevent recursive jumps.
  let jumpedGlobal = false;
  // After such a jump, endings flip (e.g. skip to Coda on the *second* pass).
  let skipToCoda = false;
  let stopAtFine = false;

  while (i < bars.length) {
    if (out.length >= SAFETY_LIMIT) break;
    const bar = bars[i];

    // Handle first/second endings: on pass >= 2, skip [1] bars; on pass 1,
    // skip [2] bars. `:|` still triggers the loop even if we're skipping
    // the bar that carries it — handle that before the skip.
    if (bar.ending) {
      const enclosingEnd = findEnclosingRepeatEnd(bars, i);
      const pass = enclosingEnd >= 0 ? (repeatPasses.get(enclosingEnd) ?? 1) : 1;
      const skip =
        (bar.ending === "1" && pass >= 2) ||
        (bar.ending === "2" && pass < 2);
      if (skip) {
        // If this bar also carries the `:|`, we still need to register a
        // repeat pass so the loop jumps back.
        if (bar.repeatEnd) {
          const nextPass = pass + 1;
          repeatPasses.set(i, nextPass);
          if (nextPass <= bar.repeatEnd.times) {
            i = lastRepeatStart;
            continue;
          }
        }
        i += 1;
        continue;
      }
    }

    // "To Coda" jump — on post-D.C./D.S. pass, leap to the Coda bar.
    if (bar.navigation?.kind === "toCoda" && skipToCoda && codaIndex >= 0) {
      out.push({ barIndex: i });
      i = codaIndex;
      skipToCoda = false;
      continue;
    }

    // "Fine" stop — honored when the preceding D.C./D.S. targets "fine".
    if (bar.navigation?.kind === "fine" && stopAtFine) {
      out.push({ barIndex: i });
      break;
    }

    if (bar.repeatStart) lastRepeatStart = i;

    out.push({ barIndex: i });

    // |: … :| repeat loop
    if (bar.repeatEnd) {
      const pass = (repeatPasses.get(i) ?? 1) + 1;
      repeatPasses.set(i, pass);
      if (pass <= bar.repeatEnd.times) {
        i = lastRepeatStart;
        continue;
      }
    }

    // D.C. / D.S. jumps (only once)
    if (!jumpedGlobal) {
      if (bar.navigation?.kind === "dc") {
        jumpedGlobal = true;
        if (bar.navigation.target === "fine") stopAtFine = true;
        if (bar.navigation.target === "coda") skipToCoda = true;
        i = 0;
        continue;
      }
      if (bar.navigation?.kind === "ds" && segnoIndex >= 0) {
        jumpedGlobal = true;
        if (bar.navigation.target === "fine") stopAtFine = true;
        if (bar.navigation.target === "coda") skipToCoda = true;
        i = segnoIndex;
        continue;
      }
    }

    i += 1;
  }
  return out;
}

/**
 * Find the index of the next `:|` bar from `fromIndex` (inclusive), without
 * crossing another `|:` that would start a fresh scope.
 */
function findEnclosingRepeatEnd(bars: Bar[], fromIndex: number): number {
  for (let i = fromIndex; i < bars.length; i += 1) {
    if (bars[i].repeatStart && i > fromIndex) break;
    if (bars[i].repeatEnd) return i;
  }
  return -1;
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
