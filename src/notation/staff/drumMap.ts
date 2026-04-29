import type { Instrument } from "../types";
import type { NoteheadShape, Step } from "./types";

export interface DrumStaffMapping {
  step: Step;
  head: NoteheadShape;
  /** Cymbals and hi-hats stem up; drums stem down. Used by the stem-direction pass in S5. */
  above: boolean;
}

/**
 * Weinberg 1994 PAS drum notation — percussion clef positions. Step
 * convention matches `geometry.stepToY` (step 0 = middle line = B4,
 * +1 = half a staff space lower, -1 = higher).
 */
export const drumStaffMap: Partial<Record<Instrument, DrumStaffMapping>> = {
  kick: { step: 6, head: "solid", above: false },
  snare: { step: 3, head: "solid", above: false },
  hihatClosed: { step: -5, head: "x", above: true },
  hihatOpen: { step: -5, head: "circle-x", above: true },
  hihatHalfOpen: { step: -5, head: "triangle", above: true },
  hihatFoot: { step: 7, head: "x", above: false },
  ride: { step: -5, head: "x", above: true },
  rideBell: { step: -5, head: "triangle", above: true },
  crashLeft: { step: -6, head: "x", above: true },
  crashRight: { step: -6, head: "x", above: true },
  tomHigh: { step: -2, head: "solid", above: false },
  tomMid: { step: -1, head: "solid", above: false },
  floorTom: { step: 5, head: "solid", above: false },
};

export function mappingFor(instrument: Instrument): DrumStaffMapping | null {
  return drumStaffMap[instrument] ?? null;
}
