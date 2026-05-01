import type { Instrument } from "./types";
import { rowGroupFor, type RowGroup } from "./layout";

/**
 * Per-row-group accent colours. Keep them grounded in the app's
 * stone / amber palette so the overall feel stays consistent while
 * each voice family gets a recognisable tint.
 *
 * Use these instead of hard-coding Tailwind classes in UI widgets.
 */
export const rowGroupAccent: Record<
  RowGroup,
  {
    /** Solid background + contrasting text (for tokens / chips). */
    solid: string;
    /** Subtle tinted background for rows / subtle emphasis. */
    tint: string;
    /** Text-only accent for labels. */
    text: string;
    /** Ring / outline colour for focus state. */
    ring: string;
  }
> = {
  cymbals: {
    solid: "bg-yellow-700 text-amber-50",
    tint: "bg-yellow-50",
    text: "text-yellow-800",
    ring: "ring-yellow-600",
  },
  toms: {
    solid: "bg-orange-800 text-orange-50",
    tint: "bg-orange-50",
    text: "text-orange-800",
    ring: "ring-orange-600",
  },
  snare: {
    solid: "bg-rose-700 text-rose-50",
    tint: "bg-rose-50",
    text: "text-rose-800",
    ring: "ring-rose-600",
  },
  kick: {
    solid: "bg-stone-900 text-amber-100",
    tint: "bg-stone-100",
    text: "text-stone-800",
    ring: "ring-stone-700",
  },
};

export function instrumentAccent(
  instrument: Instrument,
): (typeof rowGroupAccent)[RowGroup] {
  return rowGroupAccent[rowGroupFor(instrument)];
}
