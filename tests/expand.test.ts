import { describe, expect, it } from "vitest";
import { parseDrumtab } from "../src/notation/parser";
import {
  expandScore,
  findExpandedIndexForSourceBar,
  findExpandedIndicesForSourceBar,
  repeatPassForCursor,
  sliceExpandedForPerform,
} from "../src/notation/expand";
import { computeExpandedBarStartTime } from "../src/notation/scheduler";

describe("expandScore", () => {
  it("unrolls |: :| x3 into three linear copies", () => {
    const { score } = parseDrumtab(
      `title: T\nmeter: 4/4\n[A]\n|: bd: o / o / o / o :| x3`,
    );
    const expanded = expandScore(score);
    expect(expanded.sections).toHaveLength(1);
    expect(expanded.sections[0].bars).toHaveLength(3);
    for (const bar of expanded.sections[0].bars) {
      expect(bar.repeatStart).toBe(false);
      expect(bar.repeatEnd).toBeUndefined();
    }
  });

  it("resolves % (repeat previous) into the preceding bar's contents", () => {
    const { score } = parseDrumtab(
      `title: T\nmeter: 4/4\n[A]\n| bd: o / - / o / - |\n| % |`,
    );
    const expanded = expandScore(score);
    const bars = expanded.sections[0].bars;
    expect(bars).toHaveLength(2);
    expect(bars[1].repeatPrevious).toBe(false);
    expect(JSON.stringify(bars[1].beats)).toBe(JSON.stringify(bars[0].beats));
  });

  it("honours 1st / 2nd endings", () => {
    const src = `title: T
meter: 4/4
[A]
|: bd: o / o / o / o |
| sn: o / o / o / o | [1]
| sn: o / - / - / - :| [2]`;
    const { score } = parseDrumtab(src);
    const expanded = expandScore(score);
    const bars = expanded.sections[0].bars;
    // Pass 1: open(bd) + ending1(sn o-o-o-o); Pass 2: open(bd) + ending2(sn o---). Total 4.
    expect(bars).toHaveLength(4);
    // All repeat/ending markers should be stripped.
    for (const bar of bars) {
      expect(bar.repeatStart).toBe(false);
      expect(bar.repeatEnd).toBeUndefined();
      expect(bar.ending).toBeUndefined();
    }
  });

  it("is a no-op when there are no repeats", () => {
    const { score } = parseDrumtab(
      `title: T\nmeter: 4/4\n[A]\n| bd: o / o / o / o |\n| bd: - / o / - / o |`,
    );
    const expanded = expandScore(score);
    expect(expanded.sections[0].bars).toHaveLength(2);
  });
});

describe("findExpandedIndexForSourceBar", () => {
  it("returns the first expanded-position of a repeated source bar", () => {
    // |: A B :| x2 expands to A B A B. Source bar 0 → expanded 0; bar 1 → expanded 1.
    const { score } = parseDrumtab(
      `title: T\nmeter: 4/4\n[A]\n|: bd: o / o / o / o |\n| sn: o / o / o / o :|`,
    );
    expect(findExpandedIndexForSourceBar(score, 0)).toBe(0);
    expect(findExpandedIndexForSourceBar(score, 1)).toBe(1);
  });

  it("falls back to 0 for unreachable source bars", () => {
    const { score } = parseDrumtab(
      `title: T\nmeter: 4/4\n[A]\n| bd: o / o / o / o |`,
    );
    // Index that doesn't exist.
    expect(findExpandedIndexForSourceBar(score, 99)).toBe(0);
  });
});

describe("computeExpandedBarStartTime", () => {
  it("returns 0 for the first expanded bar", () => {
    const { score } = parseDrumtab(
      `title: T\ntempo: 60\nmeter: 4/4\n[A]\n|: bd: o / o / o / o :| x3`,
    );
    expect(computeExpandedBarStartTime(score, 0)).toBe(0);
  });

  it("accumulates bar duration across repeat passes", () => {
    // 60 bpm, 4/4 → 4 seconds per bar. x3 repeats of one bar →
    // expanded bars [0,4,8]s. Expanded bar 2 starts at 8s.
    const { score } = parseDrumtab(
      `title: T\ntempo: 60\nmeter: 4/4\n[A]\n|: bd: o / o / o / o :| x3`,
    );
    expect(computeExpandedBarStartTime(score, 1)).toBeCloseTo(4, 3);
    expect(computeExpandedBarStartTime(score, 2)).toBeCloseTo(8, 3);
  });

  it("respects tempoOverride", () => {
    // 120 bpm → 2 s/bar. Expanded bar 2 starts at 4 s.
    const { score } = parseDrumtab(
      `title: T\ntempo: 60\nmeter: 4/4\n[A]\n|: bd: o / o / o / o :| x3`,
    );
    expect(
      computeExpandedBarStartTime(score, 2, { tempoOverride: 120 }),
    ).toBeCloseTo(4, 3);
  });

  it("honours 1st/2nd endings in the timeline", () => {
    // Pass 1: bar0(open) + bar1(ending1). Pass 2: bar0 + bar2(ending2).
    // 60 bpm 4/4 → each bar is 4 s. Expanded positions start at 0,4,8,12.
    const { score } = parseDrumtab(
      `title: T\ntempo: 60\nmeter: 4/4\n[A]\n|: bd: o / o / o / o |\n| sn: o / o / o / o | [1]\n| sn: o / - / - / - :| [2]`,
    );
    expect(computeExpandedBarStartTime(score, 3)).toBeCloseTo(12, 3);
  });
});

describe("repeatPassForCursor", () => {
  it("tracks the current pass out of total occurrences", () => {
    // |: A B :| x2 → expanded [A(0), B(1), A(2), B(3)]. Source bar 0
    // appears at expanded 0 and 2.
    const { score } = parseDrumtab(
      `title: T\nmeter: 4/4\n[A]\n|: bd: o / o / o / o |\n| sn: o / o / o / o :|`,
    );
    expect(repeatPassForCursor(score, 0, 0)).toEqual({ pass: 1, total: 2 });
    expect(repeatPassForCursor(score, 0, 1)).toEqual({ pass: 1, total: 2 });
    expect(repeatPassForCursor(score, 0, 2)).toEqual({ pass: 2, total: 2 });
    expect(repeatPassForCursor(score, 0, 3)).toEqual({ pass: 2, total: 2 });
  });

  it("reports total=1 for bars that play once (callers should hide the badge)", () => {
    const { score } = parseDrumtab(
      `title: T\nmeter: 4/4\n[A]\n| bd: o / o / o / o |`,
    );
    expect(repeatPassForCursor(score, 0, 0)).toEqual({ pass: 1, total: 1 });
  });

  it("returns null for bars that never play", () => {
    const { score } = parseDrumtab(
      `title: T\nmeter: 4/4\n[A]\n| bd: o / o / o / o |`,
    );
    expect(repeatPassForCursor(score, 99, 0)).toBeNull();
  });

  it("handles D.C. al Fine (a bar playing on different passes)", () => {
    // Bars 0, 1(@fine), 2(@dc). Expanded [0, 1, 2, 0, 1]. Source 1 at
    // expanded 1 and 4.
    const src = `title: T\nmeter: 4/4\n[A]\n| bd: o / o / o / o |\n| sn: o / o / o / o |\n@fine\n| sn: o / - / - / - |\n@dc al fine`;
    const { score } = parseDrumtab(src);
    expect(repeatPassForCursor(score, 1, 1)).toEqual({ pass: 1, total: 2 });
    expect(repeatPassForCursor(score, 1, 4)).toEqual({ pass: 2, total: 2 });
  });
});

describe("findExpandedIndicesForSourceBar", () => {
  it("lists every expanded position of a repeated source bar", () => {
    const { score } = parseDrumtab(
      `title: T\nmeter: 4/4\n[A]\n|: bd: o / o / o / o |\n| sn: o / o / o / o :| x3`,
    );
    // Expanded order: [0,1, 0,1, 0,1] x3. Source 0 at 0,2,4; source 1 at 1,3,5.
    expect(findExpandedIndicesForSourceBar(score, 0)).toEqual([0, 2, 4]);
    expect(findExpandedIndicesForSourceBar(score, 1)).toEqual([1, 3, 5]);
  });

  it("returns an empty list for bars that never play", () => {
    const { score } = parseDrumtab(
      `title: T\nmeter: 4/4\n[A]\n| bd: o / o / o / o |`,
    );
    expect(findExpandedIndicesForSourceBar(score, 99)).toEqual([]);
  });
});

describe("sliceExpandedForPerform", () => {
  function barsFrom(score: { sections: { bars: unknown[] }[] }) {
    return score.sections.flatMap((s) => s.bars);
  }

  it("returns a centred window around the focused bar", () => {
    // Expand to 8 linear bars.
    const { score } = parseDrumtab(
      `title: T\nmeter: 4/4\n[A]\n|: bd: o / o / o / o :| x8`,
    );
    const expanded = expandScore(score);
    const result = sliceExpandedForPerform(expanded, 4, 3);
    // windowSize=3, centre=4 → [3, 4, 5], offset=3
    expect(result.offset).toBe(3);
    expect(barsFrom(result.score)).toHaveLength(3);
  });

  it("slides the window left when the focus is near the end", () => {
    const { score } = parseDrumtab(
      `title: T\nmeter: 4/4\n[A]\n|: bd: o / o / o / o :| x8`,
    );
    const expanded = expandScore(score);
    // focus = 7 (last bar), windowSize = 4 → should return [4,5,6,7], offset=4
    const result = sliceExpandedForPerform(expanded, 7, 4);
    expect(result.offset).toBe(4);
    expect(barsFrom(result.score)).toHaveLength(4);
  });

  it("clamps the window to the start when focus is 0", () => {
    const { score } = parseDrumtab(
      `title: T\nmeter: 4/4\n[A]\n|: bd: o / o / o / o :| x8`,
    );
    const expanded = expandScore(score);
    const result = sliceExpandedForPerform(expanded, 0, 4);
    expect(result.offset).toBe(0);
    expect(barsFrom(result.score)).toHaveLength(4);
  });

  it("handles windowSize larger than the bar count gracefully", () => {
    const { score } = parseDrumtab(
      `title: T\nmeter: 4/4\n[A]\n| bd: o / o / o / o |\n| bd: o / o / o / o |`,
    );
    const expanded = expandScore(score);
    const result = sliceExpandedForPerform(expanded, 0, 10);
    expect(result.offset).toBe(0);
    expect(barsFrom(result.score)).toHaveLength(2);
  });

  it("expands `%` repeat-previous into a concrete copy of the preceding bar", () => {
    const { score } = parseDrumtab(
      `title: T\nmeter: 4/4\n[A]\n| bd: o / o / o / o |\n| % |\n| % |`,
    );
    const expanded = expandScore(score);
    const bars = expanded.sections[0].bars;
    expect(bars).toHaveLength(3);
    // All three bars should have identical hit content.
    for (let i = 1; i < 3; i += 1) {
      expect(JSON.stringify(bars[i].beats)).toBe(
        JSON.stringify(bars[0].beats),
      );
      expect(bars[i].repeatPrevious).toBe(false);
    }
  });

  it("D.C. al Fine in a bar with dotted notes preserves dot through expansion", () => {
    const { score } = parseDrumtab(
      `title: T\nmeter: 4/4\n[A]\n| bd: o.o / o / o / o |\n| bd: o / o / o / o |\n@fine\n| bd: o / o / o / o |\n@dc al fine`,
    );
    const expanded = expandScore(score);
    const bars = expanded.sections[0].bars;
    // Pass 1: bar 0, 1, 2. After D.C. al Fine: bar 0, 1 (stop at Fine).
    expect(bars).toHaveLength(5);
    // Bar 0's first-beat first-hit should still carry dots on both
    // the original and the D.C.-repeated copy.
    const firstHit = bars[0].beats[0].lanes[0].slots[0];
    const dcHit = bars[3].beats[0].lanes[0].slots[0];
    expect(firstHit?.dots).toBe(1);
    expect(dcHit?.dots).toBe(1);
  });
});
