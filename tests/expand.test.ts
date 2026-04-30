import { describe, expect, it } from "vitest";
import { parseDrumtab } from "../src/notation/parser";
import {
  expandScore,
  findExpandedIndexForSourceBar,
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
