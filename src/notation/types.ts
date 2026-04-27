export type Instrument =
  | "kick"
  | "snare"
  | "hihatClosed"
  | "hihatOpen"
  | "hihatHalfOpen"
  | "ride"
  | "crash"
  | "tomHigh"
  | "tomMid"
  | "floorTom";

export type InstrumentCategory = "cymbal" | "drum";

export type Articulation =
  | "accent"
  | "ghost"
  | "flam"
  | "roll"
  | "rimshot"
  | "choke";

export type Head = "solid" | "x" | "partial" | "open";

export interface Hit {
  instrument: Instrument;
  head: Head;
  articulations: Articulation[];
  sticking?: "R" | "L";
}

export interface Slot {
  hits: Hit[];
}

export interface Beat {
  /** Subdivision per beat: 1, 2, 3, 4, 6, 8 */
  division: number;
  slots: Slot[];
  /** When set, this beat is a tuplet (e.g. 3 = triplet, 5 = quintuplet). */
  tuplet?: number;
}

export interface Meter {
  beats: number;
  beatUnit: number;
}

export interface Bar {
  meter?: Meter;
  beats: Beat[];
  /** 0 = normal, n = play n times */
  repeatCount: number;
  /** Marks a "repeat previous bar" placeholder */
  repeatPrevious: boolean;
  ending?: "1" | "2";
  source: string;
}

export interface Section {
  label: string;
  bars: Bar[];
}

export interface Score {
  version: 1;
  title: string;
  artist?: string;
  tempo?: { bpm: number; note: "quarter" };
  meter: Meter;
  sections: Section[];
}

export interface Diagnostic {
  level: "error" | "warning";
  line: number;
  message: string;
}

export interface ParseResult {
  score: Score;
  diagnostics: Diagnostic[];
}
