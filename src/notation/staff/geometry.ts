export const STAFF_SPACE = 10;
export const STAFF_HEIGHT = STAFF_SPACE * 4;

export function stepToY(step: number): number {
  return 2 * STAFF_SPACE + (step * STAFF_SPACE) / 2;
}

export const PERCUSSION_CLEF_WIDTH = 14;
export const TIME_SIG_WIDTH = 14;
