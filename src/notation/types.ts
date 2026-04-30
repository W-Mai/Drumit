export type Instrument =
  | "kick"
  | "snare"
  | "hihatClosed"
  | "hihatOpen"
  | "hihatHalfOpen"
  | "hihatFoot"
  | "ride"
  | "rideBell"
  | "crashLeft"
  | "crashRight"
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

export type Head =
  | "solid"       // ●  e.g. kick, toms
  | "x"           // ×  snare, ride bell
  | "partial"     // ∂  hi-hat (closed / half-open)
  | "open"        // ○  ride, hi-hat open, (unused) tom variants
  | "slash"       // \\ floor tom
  | "stickX";     // |  above, × below — crash / splash

export interface Hit {
  instrument: Instrument;
  head: Head;
  articulations: Articulation[];
  sticking?: "R" | "L";
}

export interface Slot {
  hits: Hit[];
}

/**
 * One sub-section of a beat on a single lane. Used when a beat mixes time
 * values (e.g. an 8th note followed by a triplet). Ratios across groups in a
 * single LaneBeat must sum to 1.
 */
export interface LaneGroup {
  /** Fraction of the beat this group occupies (0 < ratio <= 1). */
  ratio: number;
  /** Slot count within this group. */
  division: number;
  /** Tuplet marker if the group is not a power-of-two subdivision. */
  tuplet?: number;
  /** Hits indexed by slot within this group (null = rest). */
  slots: Array<Hit | null>;
}

/**
 * Per-lane content within a single beat. Each lane decides its own division
 * (2, 3, 4, 6, 8, ...) so two instruments can play different subdivisions on
 * the same beat (e.g. hi-hat in 16ths against a snare triplet).
 *
 * When `groups` is set (length >= 2), the beat is further subdivided for this
 * lane: each group covers `group.ratio` of the beat and has its own division.
 * `division`/`slots`/`tuplet` on the outer object are ignored in that case but
 * kept for backwards compatibility and simple single-group lanes.
 */
export interface LaneBeat {
  instrument: Instrument;
  /** Number of slots in this lane for the beat (== tokens.length, or 1). */
  division: number;
  /** When set, this lane is a tuplet (3 = triplet, 5 = quintuplet, ...). */
  tuplet?: number;
  /** Hits indexed by slot (null = rest / empty slot). */
  slots: Array<Hit | null>;
  /** Mixed-time groups within the beat. When absent, the lane is a single group. */
  groups?: LaneGroup[];
}

export interface Beat {
  /** Explicit tuplet marker that applies to all lanes (e.g. (3) prefix). */
  tuplet?: number;
  /** Per-lane subdivision and hits. */
  lanes: LaneBeat[];
}

export interface Meter {
  beats: number;
  beatUnit: number;
}

export type RepeatHint = "plain" | "dot" | "dash" | "comma";

export interface Bar {
  meter?: Meter;
  beats: Beat[];
  /** 0 = normal, n = play n times */
  repeatCount: number;
  /** Marks a "repeat previous bar" placeholder */
  repeatPrevious: boolean;
  /**
   * Variant of the repeat mark as seen in the handwritten PDF:
   *   plain = `%`
   *   dot   = `%.` (小变化 / 重音?)
   *   dash  = `%-` (延续?)
   *   comma = `%,` (短促?)
   * Semantically all still mean "repeat the previous bar"; the hint is kept
   * so the renderer/playback can tweak feel later without losing information.
   */
  repeatHint?: RepeatHint;
  ending?: "1" | "2";
  /** This bar opens a repeated section (`|:`). */
  repeatStart?: boolean;
  /** This bar closes a repeated section (`:|`). The stored `times` is how
   *  many times the enclosed span is played total (min 2). */
  repeatEnd?: { times: number };
  /** Navigation directive anchored to this bar (rendered as text marker). */
  navigation?: NavigationMarker;
  source: string;
}

/**
 * Navigation / jump directives attached to a bar.
 *   - segno:   𝄋 — a saved jump target for D.S.
 *   - coda:    𝄌 — saved target for "to Coda" jump.
 *   - toCoda:  "To Coda" marker (jump to Coda on relevant pass)
 *   - fine:    "Fine" — end the piece here on D.C./D.S. al Fine
 *   - dc:      D.C. (al Fine / al Coda) — jump to the beginning
 *   - ds:      D.S. (al Fine / al Coda) — jump to the Segno
 */
export type NavigationMarker =
  | { kind: "segno" }
  | { kind: "coda" }
  | { kind: "toCoda" }
  | { kind: "fine" }
  | { kind: "dc"; target?: "fine" | "coda" }
  | { kind: "ds"; target?: "fine" | "coda" };

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
