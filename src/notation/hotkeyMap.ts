import type { Instrument } from "./types";

/**
 * Mapping from keyboard digit keys to drum instruments used by the flow
 * editor. Single source of truth so the editor (which registers hotkeys)
 * and the UI (which shows hints) stay in sync.
 */
export const INSTRUMENT_BY_DIGIT: Record<string, Instrument> = {
  "1": "kick",
  "2": "snare",
  "3": "hihatClosed",
  "4": "hihatOpen",
  "5": "ride",
  "6": "crashLeft",
  "7": "crashRight",
  "8": "tomHigh",
  "9": "tomMid",
  "0": "floorTom",
};

/** Reverse map for O(1) lookup from instrument → digit. */
export const DIGIT_BY_INSTRUMENT: Partial<Record<Instrument, string>> = (() => {
  const out: Partial<Record<Instrument, string>> = {};
  for (const [digit, inst] of Object.entries(INSTRUMENT_BY_DIGIT)) {
    out[inst] = digit;
  }
  return out;
})();
