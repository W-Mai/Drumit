import { describe, expect, it } from "vitest";
import { parseDrumtab } from "../src/notation/parser";
import { serializeScore } from "../src/notation/serialize";
import { splitBeatIntoGroups, toggleSlot } from "../src/notation/edit";

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

  it("round-trips intra-beat groups", () => {
    const src = `title: T
meter: 4/4

[A]
| sn: o , (3)xxx / o / o / o |
`;
    const { score } = parseDrumtab(src);
    const out = serializeScore(score);
    const { score: s2 } = parseDrumtab(out);
    const sn = s2.sections[0].bars[0].beats[0].lanes.find(
      (l) => l.instrument === "snare",
    );
    expect(sn?.groups).toHaveLength(2);
    expect(sn?.groups?.[1].tuplet).toBe(3);
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

  it("serializer output can be re-parsed without diagnostics (idempotent)", () => {
    const src = `title: Test
artist: Me
tempo: 120
meter: 4/4

[A]
| hh: xxxx / xxxx / xxxx / xxxx  bd: o / - / o / -  sn: - / o / - / o |
| % |

[B]
| hh: o , (3)xxx / x / x / x |

[Outro]
| cr: o / - / - / - |
`;
    const { score } = parseDrumtab(src);
    const out1 = serializeScore(score);
    const { score: score2, diagnostics } = parseDrumtab(out1);
    expect(diagnostics.filter((d) => d.level === "error")).toHaveLength(0);
    const out2 = serializeScore(score2);
    // Second serialization should be stable (bit-for-bit identical to first).
    expect(out2).toBe(out1);
  });

  it("serializer preserves bar repeat count suffix", () => {
    const src = `title: T\nmeter: 4/4\n[A]\n| bd: o / o / o / o | x3\n`;
    const { score } = parseDrumtab(src);
    const out = serializeScore(score);
    const { score: s2 } = parseDrumtab(out);
    expect(s2.sections[0].bars[0].repeatCount).toBe(3);
  });

  it("serializer preserves sticking and accent modifiers", () => {
    const src = `title: T\nmeter: 4/4\n[A]\n| sn: >o/R / >o/L / >o/R / >o/L |`;
    const { score } = parseDrumtab(src);
    const out = serializeScore(score);
    const { score: s2 } = parseDrumtab(out);
    const beat0 = s2.sections[0].bars[0].beats[0];
    const sn = beat0.lanes.find((l) => l.instrument === "snare")!;
    expect(sn.slots[0]?.articulations).toContain("accent");
    expect(sn.slots[0]?.sticking).toBe("R");
  });

  it("serializer preserves section labels and order", () => {
    const src = `title: T\nmeter: 4/4\n[Intro]\n| bd: o / o / o / o |\n[A]\n| sn: o / o / o / o |\n[Solo]\n| hh: x / x / x / x |`;
    const { score } = parseDrumtab(src);
    const out = serializeScore(score);
    const { score: s2 } = parseDrumtab(out);
    expect(s2.sections.map((s) => s.label)).toEqual(["Intro", "A", "Solo"]);
  });

  it("serializer emits empty-content rests when a lane starts with rest beats", () => {
    const src = `title: T\nmeter: 4/4\n[A]\n| bd: - / - / o / o |`;
    const { score } = parseDrumtab(src);
    const out = serializeScore(score);
    const { score: s2 } = parseDrumtab(out);
    const bd0 = s2.sections[0].bars[0].beats[0].lanes.find(
      (l) => l.instrument === "kick",
    );
    expect(bd0?.slots[0]).toBeNull();
  });

  it("round-trips dotted slots through o. / o..", () => {
    const src = `title: T\nmeter: 4/4\n[A]\n| bd: o. - / o.. - / o / o |`;
    const { score } = parseDrumtab(src);
    const out = serializeScore(score);
    // Flat 2-slot packed form → "o.-" / "o..-" (no inner spaces,
    // since division <= 4 and no tuplet).
    expect(out).toMatch(/o\.-/);
    expect(out).toMatch(/o\.\.-/);
    const { score: s2, diagnostics } = parseDrumtab(out);
    expect(diagnostics.filter((d) => d.level === "error")).toHaveLength(0);
    const lane = s2.sections[0].bars[0].beats[0].lanes[0];
    expect(lane.groups?.[0].slots[0]?.dots).toBe(1);
    const lane2 = s2.sections[0].bars[0].beats[1].lanes[0];
    expect(lane2.groups?.[0].slots[0]?.dots).toBe(2);
  });

  it("serializer handles split with >2 groups", () => {
    // Build via edit API since there's no shorthand for 3+ groups
    const { score } = parseDrumtab(
      `title: T\nmeter: 4/4\n[A]\n| bd: o / o / o / o |`,
    );
    let s = splitBeatIntoGroups(score, 0, 0, "kick", 3);
    s = toggleSlot(s, 0, 0, "kick", 0, 0);
    s = toggleSlot(s, 0, 0, "kick", 0, 1);
    s = toggleSlot(s, 0, 0, "kick", 0, 2);
    const out = serializeScore(s);
    const { score: s2, diagnostics } = parseDrumtab(out);
    expect(diagnostics.filter((d) => d.level === "error")).toHaveLength(0);
    const bd = s2.sections[0].bars[0].beats[0].lanes.find(
      (l) => l.instrument === "kick",
    );
    expect(bd?.groups).toHaveLength(3);
  });

  it("round-trips tempo + title metadata", () => {
    const src = `title: My Tune\ntempo: 137\nmeter: 4/4\n[A]\n| bd: o / o / o / o |`;
    const { score } = parseDrumtab(src);
    const out = serializeScore(score);
    expect(out).toContain("tempo: 137");
    expect(out).toContain("title: My Tune");
    const { score: s2 } = parseDrumtab(out);
    expect(s2.tempo?.bpm).toBe(137);
    expect(s2.title).toBe("My Tune");
  });

  it("round-trips navigation markers (@fine, @dc)", () => {
    const src = `title: T\nmeter: 4/4\n[A]\n| bd: o / o / o / o |\n| bd: o / o / o / o |\n@fine\n| bd: o / o / o / o |\n@dc al fine`;
    const { score } = parseDrumtab(src);
    const out = serializeScore(score);
    expect(out).toContain("@fine");
    expect(out.toLowerCase()).toContain("dc al fine");
    const { score: s2, diagnostics } = parseDrumtab(out);
    expect(diagnostics.filter((d) => d.level === "error")).toHaveLength(0);
    const flat = s2.sections.flatMap((s) => s.bars);
    expect(flat.some((b) => b.navigation?.kind === "fine")).toBe(true);
    expect(flat.some((b) => b.navigation?.kind === "dc")).toBe(true);
  });

  it("round-trips 1st/2nd endings", () => {
    const src = `title: T\nmeter: 4/4\n[A]\n|: bd: o / o / o / o |\n| sn: o / o / o / o | [1]\n| sn: o / - / - / - :| [2]`;
    const { score } = parseDrumtab(src);
    const out = serializeScore(score);
    expect(out).toContain("[1]");
    expect(out).toContain("[2]");
    const { score: s2 } = parseDrumtab(out);
    const bars = s2.sections[0].bars;
    expect(bars.some((b) => b.ending === "1")).toBe(true);
    expect(bars.some((b) => b.ending === "2")).toBe(true);
  });

  it("round-trips repeat count on ending bar (x3)", () => {
    const src = `title: T\nmeter: 4/4\n[A]\n|: bd: o / o / o / o :| x3`;
    const { score } = parseDrumtab(src);
    const out = serializeScore(score);
    expect(out).toContain(":|");
    expect(out).toMatch(/x\s?3/);
    const { score: s2 } = parseDrumtab(out);
    const endBar = s2.sections[0].bars.find((b) => b.repeatEnd);
    expect(endBar?.repeatEnd?.times).toBe(3);
  });

  it("serializes a bar with only rests back to a parseable form", () => {
    const { score } = parseDrumtab(
      `title: T\nmeter: 4/4\n[A]\n| bd: - / - / - / - |`,
    );
    const out = serializeScore(score);
    const { diagnostics } = parseDrumtab(out);
    expect(diagnostics.filter((d) => d.level === "error")).toHaveLength(0);
  });
});
