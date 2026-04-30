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
 * Every position in the expanded play-order that resolves to a given
 * source bar. `findExpandedIndicesForSourceBar(score, 0) = [0, 4, 8]`
 * when `|: A :| x3` plays bar 0 three times at expanded positions
 * 0, 4, 8 (e.g. with a B bar in between). Used by the Perform view's
 * pass picker to jump to a specific iteration.
 */
export function findExpandedIndicesForSourceBar(
  score: Score,
  sourceBarIndex: number,
): number[] {
  const flat = score.sections.flatMap((s) => s.bars);
  const order = expandPlayOrder(flat);
  const out: number[] = [];
  order.forEach((o, idx) => {
    if (o.barIndex === sourceBarIndex) out.push(idx);
  });
  return out;
}

/**
 * Carve a windowed slice out of an already-expanded score, centred on
 * the given expanded-bar index. Used by the Perform view to feed
 * `layoutScore` with just the N bars currently on-screen instead of
 * the entire timeline.
 *
 * Returns the window as a single-section score plus `offset` (the
 * expanded index of the first bar in the window), so the caller can
 * translate cursor positions between the window coords and the full
 * expanded timeline.
 */
export function sliceExpandedForPerform(
  expandedScore: Score,
  centerExpandedBarIndex: number,
  windowSize: number,
): { score: Score; offset: number } {
  const allBars = expandedScore.sections.flatMap((s) => s.bars);
  if (allBars.length === 0) {
    return { score: expandedScore, offset: 0 };
  }
  const size = Math.min(windowSize, allBars.length);
  const half = Math.floor(size / 2);
  let start = Math.max(0, centerExpandedBarIndex - half);
  const end = Math.min(allBars.length, start + size);
  // If the window would run past the end, slide it left so it stays full.
  start = Math.max(0, end - size);
  return {
    score: {
      ...expandedScore,
      sections: [
        { label: expandedScore.sections[0]?.label ?? "", bars: allBars.slice(start, end) },
      ],
    },
    offset: start,
  };
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
