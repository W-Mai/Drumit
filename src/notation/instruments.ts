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
  hhf: "hihatFoot",
  pedal: "hihatFoot",
  ride: "ride",
  rd: "ride",
  "ride-bell": "rideBell",
  rb: "rideBell",
  // backwards compat: "crash" / "cr" still point to a crash (left by default).
  crash: "crashLeft",
  cr: "crashLeft",
  cr1: "crashLeft",
  crl: "crashLeft",
  cr2: "crashRight",
  crr: "crashRight",
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
  hihatFoot: "cymbal",
  ride: "cymbal",
  rideBell: "cymbal",
  crashLeft: "cymbal",
  crashRight: "cymbal",
  tomHigh: "drum",
  tomMid: "drum",
  floorTom: "drum",
};

/**
 * Canonical short alias used when serializing `Score` back to `.drumtab`.
 * Pick the shortest / most idiomatic form per instrument.
 */
export const canonicalAlias: Record<Instrument, string> = {
  kick: "bd",
  snare: "sn",
  hihatClosed: "hh",
  hihatOpen: "hho",
  hihatHalfOpen: "hhh",
  hihatFoot: "hhf",
  ride: "ride",
  rideBell: "rb",
  crashLeft: "cr",
  crashRight: "cr2",
  tomHigh: "t1",
  tomMid: "t2",
  floorTom: "ft",
};

export const instrumentLabels: Record<Instrument, string> = {
  kick: "Kick",
  snare: "Snare",
  hihatClosed: "Hi-Hat",
  hihatOpen: "HH Open",
  hihatHalfOpen: "HH Half",
  hihatFoot: "HH Foot",
  ride: "Ride",
  rideBell: "Ride Bell",
  crashLeft: "Crash L",
  crashRight: "Crash R",
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
  // Visual head is decided entirely by the instrument to match the PDF
  // conventions on page 1 of the handwritten 架子鼓入门教材:
  //   kick       -> ● solid
  //   snare      -> × (x head)
  //   hi-hat     -> ∂ partial
  //   hi-hat open-> ○ open
  //   hi-hat foot-> × (pedal, played with foot)
  //   ride       -> ○ open (ride bow)
  //   ride bell  -> × (bell / edge accent)
  //   crash      -> | over × (stickX)  -- splash / crash pair
  //   tom 1/2    -> ● solid (different sizes)
  //   floor tom  -> \ slash
  switch (instrument) {
    case "kick":
      return "solid";
    case "snare":
    case "hihatFoot":
    case "rideBell":
      return "x";
    case "hihatClosed":
    case "hihatHalfOpen":
      return "partial";
    case "hihatOpen":
    case "ride":
      return "open";
    case "crashLeft":
    case "crashRight":
      return "stickX";
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
  kick: 1.2,
  snare: 1.0,
  tomHigh: 0.75,
  tomMid: 0.95,
  floorTom: 1.05,
  hihatClosed: 1.3,
  hihatHalfOpen: 1.3,
  hihatOpen: 1.3,
  hihatFoot: 1.3,
  ride: 1.0,
  rideBell: 1.0,
  crashLeft: 1.0,
  crashRight: 1.0,
};
