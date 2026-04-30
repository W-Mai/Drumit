import type { Bar, Score, Section } from "./types";
import { expandPlayOrder } from "./scheduler";

/**
 * Given a source-bar index (flat, across all sections), return the
 * position in the expanded (linearised) bar sequence where it first
 * appears. Returns 0 if the source bar never plays (malformed score)
 * so UIs never land on a negative index.
 */
export function findExpandedIndexForSourceBar(
  score: Score,
  sourceBarIndex: number,
): number {
  const flat = score.sections.flatMap((s) => s.bars);
  const order = expandPlayOrder(flat);
  const at = order.findIndex((o) => o.barIndex === sourceBarIndex);
  return at < 0 ? 0 : at;
}

/**
 * Given a play cursor position, report which pass (1-indexed) of the
 * enclosing source bar is currently active and the total number of
 * passes that source bar will receive.
 *
 *   { pass: 2, total: 3 }  → currently on the 2nd of 3 repeats
 *   { pass: 1, total: 1 }  → bar only plays once; UIs should not show
 *                             a "×N" badge in that case
 *
 * Returns `null` if the expanded index doesn't resolve (malformed
 * input), so callers can just skip rendering in that edge case.
 */
export function repeatPassForCursor(
  score: Score,
  sourceBarIndex: number,
  expandedBarIndex: number,
): { pass: number; total: number } | null {
  const flat = score.sections.flatMap((s) => s.bars);
  const order = expandPlayOrder(flat);
  const occurrences: number[] = [];
  order.forEach((o, idx) => {
    if (o.barIndex === sourceBarIndex) occurrences.push(idx);
  });
  if (occurrences.length === 0) return null;
  // Largest occurrence ≤ expandedBarIndex — same "nearest past" rule
  // the cursor uses.
  let pass = 0;
  for (let i = 0; i < occurrences.length; i += 1) {
    if (occurrences[i] <= expandedBarIndex) pass = i + 1;
    else break;
  }
  if (pass === 0) return null;
  return { pass, total: occurrences.length };
}

export function expandScore(score: Score): Score {
  const flatBars = score.sections.flatMap((s) => s.bars);
  const order = expandPlayOrder(flatBars);

  const bars: Bar[] = [];
  let lastConcrete: Bar | null = null;
  for (const { barIndex } of order) {
    const src = flatBars[barIndex];
    if (!src) continue;
    if (src.repeatPrevious && lastConcrete) {
      const clone: Bar = JSON.parse(JSON.stringify(lastConcrete));
      clone.repeatPrevious = false;
      clone.repeatHint = undefined;
      clone.repeatStart = false;
      clone.repeatEnd = undefined;
      clone.ending = undefined;
      clone.navigation = undefined;
      clone.source = "";
      bars.push(clone);
    } else {
      const clone: Bar = JSON.parse(JSON.stringify(src));
      clone.repeatStart = false;
      clone.repeatEnd = undefined;
      clone.ending = undefined;
      clone.navigation = undefined;
      bars.push(clone);
      lastConcrete = clone;
    }
  }

  const section: Section = {
    label: score.sections[0]?.label ?? "",
    bars,
  };
  return {
    ...score,
    sections: [section],
  };
}
