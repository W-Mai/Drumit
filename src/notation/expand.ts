import type { Bar, Score, Section } from "./types";
import { expandPlayOrder } from "./scheduler";

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
