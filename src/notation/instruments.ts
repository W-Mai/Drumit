import type { Head, Instrument, InstrumentCategory } from "./types";

export const instrumentAliases: Record<string, Instrument> = {
  bd: "kick",
  kick: "kick",
  bass: "kick",
  sn: "snare",
  snare: "snare",
  hh: "hihatClosed",
  hho: "hihatOpen",
  hhh: "hihatHalfOpen",
  ride: "ride",
  rd: "ride",
  crash: "crash",
  cr: "crash",
  tom1: "tomHigh",
  t1: "tomHigh",
  tom2: "tomMid",
  t2: "tomMid",
  ft: "floorTom",
  floor: "floorTom",
};

export const instrumentCategory: Record<Instrument, InstrumentCategory> = {
  kick: "drum",
  snare: "drum",
  hihatClosed: "cymbal",
  hihatOpen: "cymbal",
  hihatHalfOpen: "cymbal",
  ride: "cymbal",
  crash: "cymbal",
  tomHigh: "drum",
  tomMid: "drum",
  floorTom: "drum",
};

export const instrumentLabels: Record<Instrument, string> = {
  kick: "Kick",
  snare: "Snare",
  hihatClosed: "Hi-Hat",
  hihatOpen: "HH Open",
  hihatHalfOpen: "HH Half",
  ride: "Ride",
  crash: "Crash",
  tomHigh: "Tom 1",
  tomMid: "Tom 2",
  floorTom: "Floor",
};

/**
 * Default visual head per instrument if the source token is "o" or "x".
 * Uses the PDF convention:
 *   kick = ●         -> solid
 *   snare = X        -> x
 *   hi-hat = ∂       -> partial
 *   ride/crash = X   -> x
 *   toms/floor = o   -> open
 */
export function defaultHeadFor(instrument: Instrument): Head {
  // In this shorthand the source token is semantic ("hit" / "rest"); the
  // visual head is decided entirely by the instrument to match the PDF:
  //   kick       -> ● solid
  //   snare      -> × (x head)
  //   hi-hat     -> ∂ (partial)
  //   hi-hat open-> ○ (open circle)
  //   ride/crash -> × (x head)
  //   toms       -> ○ (open circle)
  switch (instrument) {
    case "kick":
      return "solid";
    case "snare":
    case "ride":
    case "crash":
      return "x";
    case "hihatClosed":
    case "hihatHalfOpen":
      return "partial";
    case "hihatOpen":
      return "open";
    case "tomHigh":
    case "tomMid":
      return "solid";
    case "floorTom":
      return "slash";
  }
}

/**
 * Visual size multiplier per instrument. Drums get progressively larger
 * toward the kick to mirror the physical kit (tom1 small, tom2 medium,
 * kick largest). Other instruments use 1.0 (the renderer's base size).
 */
export const instrumentSizeScale: Record<Instrument, number> = {
  kick: 1.5,
  snare: 1.0,
  tomHigh: 0.8,
  tomMid: 1.1,
  floorTom: 1.0,
  hihatClosed: 1.0,
  hihatHalfOpen: 1.0,
  hihatOpen: 1.0,
  ride: 1.0,
  crash: 1.0,
};
