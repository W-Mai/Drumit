import { describe, expect, it } from "vitest";
import { parseDrumtab } from "../src/notation/parser";
import { serializeScore } from "../src/notation/serialize";
import { expandPlayOrder, schedule } from "../src/notation/scheduler";
import type { Bar } from "../src/notation/types";

function parse(src: string) {
  const r = parseDrumtab(src);
  return r;
}

function bars(src: string): Bar[] {
  return parse(src).score.sections.flatMap((s) => s.bars);
}

describe("repeat barlines", () => {
  it("parses |: as repeatStart", () => {
    const b = bars("title: T\nmeter: 4/4\n[A]\n|: bd: o / o / o / o |");
    expect(b[0].repeatStart).toBe(true);
    expect(b[0].repeatEnd).toBeUndefined();
  });

  it("parses :| as repeatEnd with default times=2", () => {
    const b = bars(
      "title: T\nmeter: 4/4\n[A]\n|: bd: o / o / o / o :|",
    );
    expect(b[0].repeatStart).toBe(true);
    expect(b[0].repeatEnd?.times).toBe(2);
  });

  it("parses :| x3 with explicit times", () => {
    const b = bars(
      "title: T\nmeter: 4/4\n[A]\n|: bd: o / o / o / o :| x3",
    );
    expect(b[0].repeatEnd?.times).toBe(3);
    // repeatCount should NOT be set; x3 goes to repeatEnd.times
    expect(b[0].repeatCount).toBe(1);
  });

  it("parses first/second endings", () => {
    const b = bars(
      `title: T\nmeter: 4/4\n[A]\n| bd: o / o / o / o | [1]\n| bd: o / o / o / o | [2]`,
    );
    expect(b[0].ending).toBe("1");
    expect(b[1].ending).toBe("2");
  });
});

describe("navigation markers", () => {
  it("parses @segno / @dc / @ds / @fine / @to-coda / @coda", () => {
    const src = `title: T
meter: 4/4

[A]
| bd: o / o / o / o |
@segno
| sn: o / o / o / o |
@to-coda
| sn: o / o / o / o |
@fine
| bd: o / o / o / o |
@ds al fine
| bd: o / o / o / o |
@coda
| bd: o / o / o / o |
@dc al coda
`;
    const { score, diagnostics } = parse(src);
    expect(diagnostics.filter((d) => d.level === "error")).toHaveLength(0);
    const b = score.sections[0].bars;
    expect(b[0].navigation?.kind).toBe("segno");
    expect(b[1].navigation?.kind).toBe("toCoda");
    expect(b[2].navigation?.kind).toBe("fine");
    expect(b[3].navigation).toEqual({ kind: "ds", target: "fine" });
    expect(b[4].navigation?.kind).toBe("coda");
    expect(b[5].navigation).toEqual({ kind: "dc", target: "coda" });
  });
});

describe("serializer round-trips repeats and navigation", () => {
  it("preserves |: ... :| xN + first/second ending + @dc", () => {
    const src = `title: T
meter: 4/4

[A]
|: bd: o / o / o / o | [1]
| bd: o / - / o / - | [2]
| sn: o / o / o / o :| x3
@dc al fine
| sn: o / - / - / - |
@fine
`;
    const { score } = parse(src);
    const out = serializeScore(score);
    const { score: s2, diagnostics } = parse(out);
    expect(diagnostics.filter((d) => d.level === "error")).toHaveLength(0);
    const b = s2.sections[0].bars;
    expect(b[0].repeatStart).toBe(true);
    expect(b[0].ending).toBe("1");
    expect(b[1].ending).toBe("2");
    expect(b[2].repeatEnd?.times).toBe(3);
    expect(b[2].navigation).toEqual({ kind: "dc", target: "fine" });
    expect(b[3].navigation?.kind).toBe("fine");
  });
});

describe("playback expansion", () => {
  it("expands |: ... :| x2 into 2 passes", () => {
    const b = bars(
      `title: T\nmeter: 4/4\n[A]\n|: bd: o / o / o / o :| x2`,
    );
    const order = expandPlayOrder(b);
    expect(order).toEqual([{ barIndex: 0 }, { barIndex: 0 }]);
  });

  it("expands |: a b :| x2 into a b a b", () => {
    const b = bars(
      `title: T\nmeter: 4/4\n[A]\n|: bd: o / o / o / o |\n| sn: o / o / o / o :|`,
    );
    const order = expandPlayOrder(b);
    expect(order.map((x) => x.barIndex)).toEqual([0, 1, 0, 1]);
  });

  it("honors first/second endings", () => {
    const b = bars(
      `title: T\nmeter: 4/4\n[A]\n|: bd: o / o / o / o |\n| sn: o / o / o / o | [1]\n| sn: o / - / - / - :| [2]`,
    );
    const order = expandPlayOrder(b);
    // Pass 1: bar0 (|:), bar1 (ending 1)
    // Pass 2: bar0 (|:), bar2 (ending 2, which is the :|)
    expect(order.map((x) => x.barIndex)).toEqual([0, 1, 0, 2]);
  });

  it("D.C. al Fine jumps to start, stops at Fine", () => {
    const src = `title: T
meter: 4/4

[A]
| bd: o / o / o / o |
| sn: o / o / o / o |
@fine
| sn: o / - / - / - |
@dc al fine
`;
    const { score } = parse(src);
    const flat = score.sections.flatMap((s) => s.bars);
    const order = expandPlayOrder(flat);
    // Play 0, 1, 2, then jump to start: 0, 1 (then stop at Fine bar)
    expect(order.map((x) => x.barIndex)).toEqual([0, 1, 2, 0, 1]);
  });

  it("schedule() total duration respects repeats", () => {
    const { score } = parse(
      `title: T\ntempo: 60\nmeter: 4/4\n[A]\n|: bd: o / o / o / o :| x3`,
    );
    const { totalDuration } = schedule(score);
    // 1 bar @ 60 bpm = 4 seconds, × 3 = 12
    expect(totalDuration).toBeCloseTo(12, 2);
  });
});
