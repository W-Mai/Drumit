import type { Instrument, Hit } from "./types";

/**
 * GM percussion key map (channel 10). These MIDI note numbers are what
 * General MIDI drum kits expect. We pick canonical GM values that matter
 * for a jianpu-style rock kit.
 *
 * References:
 *   35 = Acoustic Bass Drum
 *   36 = Bass Drum 1  ← kick
 *   38 = Acoustic Snare ← snare
 *   42 = Closed Hi-Hat
 *   44 = Pedal Hi-Hat
 *   46 = Open Hi-Hat
 *   49 = Crash Cymbal 1
 *   51 = Ride Cymbal 1
 *   53 = Ride Bell
 *   50 = High Tom
 *   47 = Low-Mid Tom
 *   41 = Low Floor Tom
 *   57 = Crash Cymbal 2
 */
export const gmDrumMap: Record<Instrument, number> = {
  kick: 36,
  snare: 38,
  hihatClosed: 42,
  hihatHalfOpen: 42, // same head, handled via velocity if needed
  hihatOpen: 46,
  hihatFoot: 44,
  ride: 51,
  rideBell: 53,
  crashLeft: 49,
  crashRight: 57,
  tomHigh: 50,
  tomMid: 47,
  floorTom: 41,
};

/**
 * Derive a MIDI velocity (0–127) for a given hit. Ghost notes are softer,
 * accents hit harder, everything else is in the mid-upper range.
 */
/**
 * Map a Hit to a MIDI velocity (0–127). Widened from the earlier
 * 40 / 96 / 120 spread because +24 velocity (≈ +1.8 dB in linear gain)
 * wasn't audibly distinct from a normal hit. The new 40 / 80 / 120
 * spread puts accents at +3.5 dB and ghosts at −6 dB relative to a
 * default hit — both clearly perceptible.
 */
export function hitVelocity(hit: Hit): number {
  if (hit.articulations.includes("ghost")) return 40;
  if (hit.articulations.includes("accent")) return 120;
  return 80;
}

/**
 * Seconds for a MIDI note-off event after the note-on. The actual sample
 * might sustain much longer (a crash cymbal decays for seconds on its own)
 * but we still need to release the MIDI note so stuck-note isn't an issue.
 */
export const DEFAULT_NOTE_DURATION_S = 0.05;
