/**
 * Staff view uses a half-space-per-step vertical coordinate:
 *   step  0 → middle line (B4)
 *   step +1 → half space below the middle line
 *   step -1 → half space above the middle line
 *
 * Percussion clef positions of interest (MVP drum map):
 *   step -6 = 上加一间 (A5)
 *   step -5 = 上加一线 (G5)  ← hi-hat / ride
 *   step -2 = 第四间 (D5)   ← tom high
 *   step -1 = 第四线 (C5)   ← tom mid
 *   step  0 = 中线 (B4)
 *   step  3 = 第二间 (F4)   ← snare
 *   step  5 = 第一间 (D4)   ← floor tom
 *   step  6 = 下加一线 (C4) ← kick
 *   step  7 = 下加一间 (B3) ← hi-hat foot
 */
export type Step = number;

export type Duration = "w" | "h" | "q" | "8" | "16" | "32";

export type NoteheadShape =
  | "solid"
  | "open"
  | "x"
  | "circle-x"
  | "triangle"
  | "slash";

export interface StaffGlyph {
  step: Step;
  head: NoteheadShape;
}

export type StaffArticulation =
  | "accent"
  | "ghost"
  | "flam"
  | "roll"
  | "choke";

export interface StaffNote {
  x: number;
  duration: Duration;
  glyphs: StaffGlyph[];
  stem: "up" | "down" | null;
  tuplet?: number;
  /** Note-level articulations, merged across all glyphs in the chord. */
  articulations: StaffArticulation[];
  /** Per-hit sticking ("R" / "L") collected from the chord voices. */
  sticking?: "R" | "L";
}

export interface StaffRest {
  x: number;
  duration: Duration;
  step: Step;
}

export interface StaffBeam {
  /** Indices into `StaffBar.notes`; inclusive. */
  start: number;
  end: number;
  /** 1 = 8th, 2 = 16th, 3 = 32nd. */
  depth: number;
}

export interface StaffTupletBracket {
  start: number;
  end: number;
  count: number;
}

export type BarlineKind = "single" | "repeat-start" | "repeat-end";

export interface StaffBar {
  index: number;
  x: number;
  width: number;
  /** Number of beats in the bar (bar-level meter override collapsed down). */
  beats: number;
  notes: StaffNote[];
  rests: StaffRest[];
  beams: StaffBeam[];
  tuplets: StaffTupletBracket[];
  barlineX: number;
  /** Visual kind of the right-edge barline of this bar. Repeat-starts are
   *  painted on the _next_ bar's left edge by the renderer. */
  endBarline: BarlineKind;
  /** True if this bar opens a repeated section (paint the start glyph on
   *  the left edge). */
  repeatStart: boolean;
  /** When endBarline is 'repeat-end', how many times the section plays. */
  repeatTimes?: number;
  /** First / second ending bracket above this bar. */
  ending?: "1" | "2";
  /** Rendered navigation label, e.g. "D.C. al Fine" or "𝄋". */
  navigationLabel?: string;
}

export interface StaffSystem {
  y: number;
  bars: StaffBar[];
}

export interface StaffLayout {
  width: number;
  height: number;
  systems: StaffSystem[];
  title?: string;
  tempo?: string;
  meter: string;
}
