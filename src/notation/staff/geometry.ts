import type { Duration } from "./types";

export const STAFF_SPACE = 10;
export const STAFF_HEIGHT = STAFF_SPACE * 4;

export function stepToY(step: number): number {
  return 2 * STAFF_SPACE + (step * STAFF_SPACE) / 2;
}

export const PERCUSSION_CLEF_WIDTH = 12;
export const TIME_SIG_WIDTH = 14;

/** Number of flags for a given duration (8 / 16 / 32 → 1 / 2 / 3). */
export function flagsFor(duration: Duration): number {
  if (duration === "8") return 1;
  if (duration === "16") return 2;
  if (duration === "32") return 3;
  return 0;
}
