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
