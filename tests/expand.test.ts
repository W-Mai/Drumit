import { describe, expect, it } from "vitest";
import { parseDrumtab } from "../src/notation/parser";
import { expandScore } from "../src/notation/expand";

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
