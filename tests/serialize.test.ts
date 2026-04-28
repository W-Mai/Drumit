import { describe, expect, it } from "vitest";
import { parseDrumtab } from "../src/notation/parser";
import { serializeScore } from "../src/notation/serialize";

describe("serializeScore", () => {
  it("round-trips a simple bar", () => {
    const src = `title: T
meter: 4/4

[A]
| hh: x / x / x / x  bd: o / - / o / -  sn: - / o / - / o |
`;
    const { score } = parseDrumtab(src);
    const out = serializeScore(score);
    const { score: score2, diagnostics } = parseDrumtab(out);
    expect(diagnostics.filter((d) => d.level === "error")).toHaveLength(0);
    // Structural equivalence: section count, bar count, lanes per beat
    expect(score2.sections).toHaveLength(1);
    expect(score2.sections[0].bars).toHaveLength(1);
    const bar = score2.sections[0].bars[0];
    expect(bar.beats).toHaveLength(4);
    // All three lanes are emitted for every beat; beat 0 has a rest on snare.
    expect(bar.beats[0].lanes.map((l) => l.instrument).sort()).toEqual(
      ["hihatClosed", "kick", "snare"].sort(),
    );
    const sn0 = bar.beats[0].lanes.find((l) => l.instrument === "snare");
    expect(sn0?.slots[0]).toBeNull();
  });

  it("round-trips repeat variants and inline meter", () => {
    const src = `title: T
meter: 4/4

[A]
| hh: x / x / x / x |
| %. |
| %- |
| %, |
| meter: 2/4 | hh: x / x |
`;
    const { score } = parseDrumtab(src);
    const out = serializeScore(score);
    const { score: s2 } = parseDrumtab(out);
    const bars = s2.sections[0].bars;
    expect(bars[1].repeatHint).toBe("dot");
    expect(bars[2].repeatHint).toBe("dash");
    expect(bars[3].repeatHint).toBe("comma");
    expect(bars[4].meter).toEqual({ beats: 2, beatUnit: 4 });
  });

  it("preserves triplet and ghost note metadata", () => {
    const src = `title: T
meter: 4/4

[A]
| hh: xxxx / xxxx / xxxx / xxxx  sn: - / (o) / - / xxx |
`;
    const { score } = parseDrumtab(src);
    const out = serializeScore(score);
    const { score: s2 } = parseDrumtab(out);
    const bar = s2.sections[0].bars[0];
    const snBeat3 = bar.beats[3].lanes.find((l) => l.instrument === "snare");
    expect(snBeat3?.division).toBe(3);
    expect(snBeat3?.tuplet).toBe(3);
    const snBeat1 = bar.beats[1].lanes.find((l) => l.instrument === "snare");
    const ghost = snBeat1?.slots[0];
    expect(ghost?.articulations).toContain("ghost");
  });
});
