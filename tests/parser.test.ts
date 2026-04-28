import { describe, expect, it } from "vitest";
import { parseDrumtab } from "../src/notation/parser";
import type { Instrument } from "../src/notation/types";

function laneOf(
  bar: ReturnType<typeof parseDrumtab>["score"]["sections"][number]["bars"][number],
  beatIndex: number,
  instrument: Instrument,
) {
  return bar.beats[beatIndex].lanes.find((l) => l.instrument === instrument);
}

describe("parseDrumtab", () => {
  it("parses a 4/4 bar with slash-separated beats", () => {
    const { score, diagnostics } = parseDrumtab(
      `title: T\nmeter: 4/4\n[A]\n| hh: x / x / x / x  bd: o / - / o / -  sn: - / o / - / o |`,
    );
    expect(diagnostics.filter((d) => d.level === "error")).toHaveLength(0);
    const bar = score.sections[0].bars[0];
    expect(bar.beats).toHaveLength(4);
    expect(laneOf(bar, 0, "hihatClosed")?.slots[0]).not.toBeNull();
    expect(laneOf(bar, 0, "kick")?.slots[0]).not.toBeNull();
    expect(laneOf(bar, 1, "snare")?.slots[0]).not.toBeNull();
  });

  it("supports packed 16th-note beats", () => {
    const { score } = parseDrumtab(
      `title: T\nmeter: 4/4\n[A]\n| hh: xxxx / xxxx / xxxx / xxxx |`,
    );
    const bar = score.sections[0].bars[0];
    const hh = laneOf(bar, 0, "hihatClosed");
    expect(hh?.division).toBe(4);
    expect(hh?.slots).toHaveLength(4);
  });

  it("marks repeat previous bars", () => {
    const { score } = parseDrumtab(
      `title: T\nmeter: 4/4\n[A]\n| hh: x / x / x / x |\n| % |`,
    );
    expect(score.sections[0].bars[1].repeatPrevious).toBe(true);
  });

  it("keeps repeat hint variants %., %-, %,", () => {
    const { score } = parseDrumtab(
      `title: T\nmeter: 4/4\n[A]\n| hh: x / x / x / x |\n| % |\n| %. |\n| %- |\n| %, |`,
    );
    const bars = score.sections[0].bars;
    expect(bars[1].repeatHint).toBe("plain");
    expect(bars[2].repeatHint).toBe("dot");
    expect(bars[3].repeatHint).toBe("dash");
    expect(bars[4].repeatHint).toBe("comma");
  });

  it("parses inline meter overrides", () => {
    const { score } = parseDrumtab(
      `title: T\nmeter: 4/4\n[A]\n| meter: 2/4 | hh: x / x |`,
    );
    const bar = score.sections[0].bars[0];
    expect(bar.meter).toEqual({ beats: 2, beatUnit: 4 });
    expect(bar.beats).toHaveLength(2);
  });

  it("parses explicit triplet marker (3) on a beat", () => {
    const { score, diagnostics } = parseDrumtab(
      `title: T\nmeter: 4/4\n[A]\n| sn: (3)xxx / xxxx / xxxx / xxxx |`,
    );
    expect(diagnostics.filter((d) => d.level === "error")).toHaveLength(0);
    const bar = score.sections[0].bars[0];
    expect(bar.beats[0].tuplet).toBe(3);
    const sn0 = laneOf(bar, 0, "snare");
    expect(sn0?.division).toBe(3);
    expect(sn0?.tuplet).toBe(3);
  });

  it("auto-detects triplets from 3-token beats per lane", () => {
    const { score } = parseDrumtab(
      `title: T\nmeter: 4/4\n[A]\n| hh: xxxx / xxxx / xxxx / xxxx  sn: - / - / - / xxx |`,
    );
    const bar = score.sections[0].bars[0];
    const hh3 = laneOf(bar, 3, "hihatClosed");
    const sn3 = laneOf(bar, 3, "snare");
    expect(hh3?.division).toBe(4);
    expect(hh3?.tuplet).toBeUndefined();
    expect(sn3?.division).toBe(3);
    expect(sn3?.tuplet).toBe(3);
  });

  it("parses standalone R/L sticking tokens", () => {
    const { score } = parseDrumtab(
      `title: T\nmeter: 4/4\n[A]\n| sn: R / L / R / L |`,
    );
    const bar = score.sections[0].bars[0];
    expect(laneOf(bar, 0, "snare")?.slots[0]?.sticking).toBe("R");
    expect(laneOf(bar, 1, "snare")?.slots[0]?.sticking).toBe("L");
  });

  it("parses intra-beat groups separated by ,", () => {
    const { score, diagnostics } = parseDrumtab(
      `title: T\nmeter: 4/4\n[A]\n| sn: o , (3)xxx / o / o / o |`,
    );
    expect(diagnostics.filter((d) => d.level === "error")).toHaveLength(0);
    const bar = score.sections[0].bars[0];
    const sn = bar.beats[0].lanes.find((l) => l.instrument === "snare");
    expect(sn?.groups).toBeDefined();
    expect(sn?.groups).toHaveLength(2);
    expect(sn?.groups?.[0].division).toBe(1);
    expect(sn?.groups?.[1].division).toBe(3);
    expect(sn?.groups?.[1].tuplet).toBe(3);
    expect(sn?.groups?.[0].ratio).toBeCloseTo(0.5);
    expect(sn?.groups?.[1].ratio).toBeCloseTo(0.5);
  });

  it("lets lanes have different subdivisions on the same beat", () => {
    const { score } = parseDrumtab(
      `title: T\nmeter: 4/4\n[A]\n| hh: xxxx / xxxx / xxxx / xxxx  sn: - / - / - / xxx |`,
    );
    const bar = score.sections[0].bars[0];
    const hhBeat3 = laneOf(bar, 3, "hihatClosed");
    const snBeat3 = laneOf(bar, 3, "snare");
    expect(hhBeat3?.division).toBe(4);
    expect(snBeat3?.division).toBe(3);
  });

  // --- Headers & metadata ---
  it("parses title, artist, tempo, meter headers", () => {
    const { score } = parseDrumtab(
      `title: Song\nartist: Me\ntempo: 120\nmeter: 3/4\n[A]\n| bd: o / o / o |`,
    );
    expect(score.title).toBe("Song");
    expect(score.artist).toBe("Me");
    expect(score.tempo).toEqual({ bpm: 120, note: "quarter" });
    expect(score.meter).toEqual({ beats: 3, beatUnit: 4 });
  });

  it("rejects invalid tempo and meter with diagnostics", () => {
    const bad = parseDrumtab(
      `title: T\ntempo: abc\nmeter: 4/\n[A]\n| bd: o / o / o / o |`,
    );
    expect(bad.diagnostics.some((d) => /Tempo/.test(d.message))).toBe(true);
    expect(bad.diagnostics.some((d) => /Meter/.test(d.message))).toBe(true);
  });

  it("warns on unknown headers but keeps parsing", () => {
    const { score, diagnostics } = parseDrumtab(
      `title: T\nflavor: spicy\nmeter: 4/4\n[A]\n| bd: o / o / o / o |`,
    );
    expect(diagnostics.some((d) => d.level === "warning")).toBe(true);
    expect(score.sections[0].bars).toHaveLength(1);
  });

  // --- Section & form ---
  it("parses multiple sections in order", () => {
    const { score } = parseDrumtab(
      `title: T\nmeter: 4/4\n[A]\n| bd: o / o / o / o |\n[B]\n| sn: o / o / o / o |\n[Outro]\n| cr: o / - / - / - |`,
    );
    expect(score.sections).toHaveLength(3);
    expect(score.sections.map((s) => s.label)).toEqual(["A", "B", "Outro"]);
  });

  it("creates an implicit Main section when bars come before any [X]", () => {
    const { score } = parseDrumtab(
      `title: T\nmeter: 4/4\n| bd: o / o / o / o |`,
    );
    expect(score.sections).toHaveLength(1);
    expect(score.sections[0].label).toBe("Main");
  });

  // --- Whitespace / comments / blanks ---
  it("ignores blank lines and # comments", () => {
    const { score } = parseDrumtab(
      `title: T\n# full-line comment\n\nmeter: 4/4\n\n[A]\n\n| bd: o / o / o / o | # inline comment\n`,
    );
    expect(score.sections[0].bars).toHaveLength(1);
  });

  it("is tolerant of extra whitespace between tokens", () => {
    const { score } = parseDrumtab(
      `title: T\nmeter: 4/4\n[A]\n|   hh:    x  /   x   /  x  /  x    bd:    o / - / o / -   |`,
    );
    const bar = score.sections[0].bars[0];
    expect(bar.beats).toHaveLength(4);
    expect(laneOf(bar, 0, "hihatClosed")).toBeDefined();
  });

  // --- Instrument aliases ---
  it("accepts all instrument aliases", () => {
    const { score } = parseDrumtab(
      `title: T\nmeter: 4/4\n[A]\n| bd: o / o / o / o  sn: o / o / o / o  hh: x / x / x / x  hho: x / - / - / -  hhh: x / - / - / -  hhf: x / - / - / -  ride: x / - / - / -  rb: x / - / - / -  cr: x / - / - / -  cr2: x / - / - / -  t1: o / - / - / -  t2: o / - / - / -  ft: o / - / - / - |`,
    );
    const b0 = score.sections[0].bars[0].beats[0];
    expect(b0.lanes.map((l) => l.instrument).sort()).toEqual(
      [
        "kick",
        "snare",
        "hihatClosed",
        "hihatOpen",
        "hihatHalfOpen",
        "hihatFoot",
        "ride",
        "rideBell",
        "crashLeft",
        "crashRight",
        "tomHigh",
        "tomMid",
        "floorTom",
      ].sort(),
    );
  });

  it("errors on unknown instrument alias", () => {
    const { diagnostics } = parseDrumtab(
      `title: T\nmeter: 4/4\n[A]\n| banjo: o / o / o / o |`,
    );
    expect(
      diagnostics.some((d) => d.level === "error" && /banjo/.test(d.message)),
    ).toBe(true);
  });

  // --- Token modifiers ---
  it("stacks multiple modifiers: >(o), ~o, fo", () => {
    const { score } = parseDrumtab(
      `title: T\nmeter: 4/4\n[A]\n| sn: >(o) / ~o / fo / o |`,
    );
    const bar = score.sections[0].bars[0];
    const hit0 = laneOf(bar, 0, "snare")?.slots[0];
    const hit1 = laneOf(bar, 1, "snare")?.slots[0];
    const hit2 = laneOf(bar, 2, "snare")?.slots[0];
    expect(hit0?.articulations).toEqual(
      expect.arrayContaining(["accent", "ghost"]),
    );
    expect(hit1?.articulations).toContain("roll");
    expect(hit2?.articulations).toContain("flam");
  });

  it("parses choke suffix '!'", () => {
    const { score } = parseDrumtab(
      `title: T\nmeter: 4/4\n[A]\n| cr: o! / - / - / - |`,
    );
    const hit = score.sections[0].bars[0].beats[0].lanes[0].slots[0];
    expect(hit?.articulations).toContain("choke");
  });

  it("parses sticking /R /L suffixes", () => {
    const { score } = parseDrumtab(
      `title: T\nmeter: 4/4\n[A]\n| sn: o/R / o/L / o/r / o/l |`,
    );
    const bar = score.sections[0].bars[0];
    expect(laneOf(bar, 0, "snare")?.slots[0]?.sticking).toBe("R");
    expect(laneOf(bar, 1, "snare")?.slots[0]?.sticking).toBe("L");
    expect(laneOf(bar, 2, "snare")?.slots[0]?.sticking).toBe("R");
    expect(laneOf(bar, 3, "snare")?.slots[0]?.sticking).toBe("L");
  });

  // --- Bar suffix: repeat-count & endings ---
  it("parses repeat count 'x3' suffix", () => {
    const { score } = parseDrumtab(
      `title: T\nmeter: 4/4\n[A]\n| bd: o / o / o / o | x3`,
    );
    expect(score.sections[0].bars[0].repeatCount).toBe(3);
  });

  it("parses first/second ending suffix '[1]' / '[2]'", () => {
    const { score } = parseDrumtab(
      `title: T\nmeter: 4/4\n[A]\n| bd: o / o / o / o | [1]\n| bd: o / o / o / o | [2]`,
    );
    expect(score.sections[0].bars[0].ending).toBe("1");
    expect(score.sections[0].bars[1].ending).toBe("2");
  });

  // --- Packed & sextuplet detection ---
  it("auto-detects sextuplet from 6-token beat", () => {
    const { score } = parseDrumtab(
      `title: T\nmeter: 4/4\n[A]\n| hh: xxxxxx / x / x / x |`,
    );
    const hh0 = laneOf(score.sections[0].bars[0], 0, "hihatClosed");
    expect(hh0?.division).toBe(6);
    expect(hh0?.tuplet).toBe(6);
  });

  it("auto-detects quintuplet from 5-token beat", () => {
    const { score } = parseDrumtab(
      `title: T\nmeter: 4/4\n[A]\n| sn: xxxxx / x / x / x |`,
    );
    const sn0 = laneOf(score.sections[0].bars[0], 0, "snare");
    expect(sn0?.division).toBe(5);
    expect(sn0?.tuplet).toBe(5);
  });

  it("packed 32nd note keeps division=8", () => {
    const { score } = parseDrumtab(
      `title: T\nmeter: 4/4\n[A]\n| hh: xxxxxxxx / x / x / x |`,
    );
    const hh0 = laneOf(score.sections[0].bars[0], 0, "hihatClosed");
    expect(hh0?.division).toBe(8);
    expect(hh0?.tuplet).toBeUndefined();
  });

  // --- Intra-beat mixed subdivisions ---
  it("handles front-8 back-16: `o - x x` on 4 slots", () => {
    const { score } = parseDrumtab(
      `title: T\nmeter: 4/4\n[A]\n| hh: o-xx / x / x / x |`,
    );
    const hh0 = laneOf(score.sections[0].bars[0], 0, "hihatClosed");
    expect(hh0?.division).toBe(4);
    expect(hh0?.slots[0]).not.toBeNull();
    expect(hh0?.slots[1]).toBeNull();
    expect(hh0?.slots[2]).not.toBeNull();
    expect(hh0?.slots[3]).not.toBeNull();
  });

  it("handles front-16 back-8: `x x x -` on 4 slots", () => {
    const { score } = parseDrumtab(
      `title: T\nmeter: 4/4\n[A]\n| hh: xxx- / x / x / x |`,
    );
    const hh0 = laneOf(score.sections[0].bars[0], 0, "hihatClosed");
    expect(hh0?.division).toBe(4);
    expect(hh0?.slots[0]).not.toBeNull();
    expect(hh0?.slots[3]).toBeNull();
  });

  it("group split can mix 8 + triplet: `o , (3)xxx`", () => {
    const { score } = parseDrumtab(
      `title: T\nmeter: 4/4\n[A]\n| sn: o , (3)xxx / o / o / o |`,
    );
    const sn0 = laneOf(score.sections[0].bars[0], 0, "snare");
    expect(sn0?.groups).toHaveLength(2);
    expect(sn0?.groups?.[0].division).toBe(1);
    expect(sn0?.groups?.[1].division).toBe(3);
  });

  // --- Ghost notes with nesting ---
  it("ghost notes preserved across packed groups: `(x)(x)(x)(x)`", () => {
    const { score } = parseDrumtab(
      `title: T\nmeter: 4/4\n[A]\n| sn: (x)(x)(x)(x) / x / x / x |`,
    );
    const sn0 = laneOf(score.sections[0].bars[0], 0, "snare");
    expect(sn0?.division).toBe(4);
    sn0?.slots.forEach((slot) => {
      expect(slot?.articulations).toContain("ghost");
    });
  });

  // --- Empty / malformed input ---
  it("error when bar has no lanes", () => {
    const { diagnostics } = parseDrumtab(
      `title: T\nmeter: 4/4\n[A]\n| no content here |`,
    );
    expect(diagnostics.some((d) => d.level === "error")).toBe(true);
  });

  it("error when no sections exist", () => {
    const { diagnostics } = parseDrumtab(`title: T\nmeter: 4/4\n`);
    expect(diagnostics.some((d) => d.level === "error")).toBe(true);
  });

  // --- Beat count mismatch ---
  it("warns when bar has fewer beats than meter.beats", () => {
    const { diagnostics } = parseDrumtab(
      `title: T\nmeter: 4/4\n[A]\n| hh: x / x / x |`,
    );
    expect(
      diagnostics.some(
        (d) => d.level === "warning" && /beats per bar/.test(d.message),
      ),
    ).toBe(true);
  });

  // --- Mixed rest tokens ---
  it("treats both '-' and '.' as rests", () => {
    const { score } = parseDrumtab(
      `title: T\nmeter: 4/4\n[A]\n| hh: - / . / - / . |`,
    );
    const bar = score.sections[0].bars[0];
    bar.beats.forEach((beat) =>
      expect(beat.lanes[0]?.slots[0]).toBeNull(),
    );
  });

  // --- 3/4, 2/4 meters ---
  it("handles 3/4 meter (3 beats)", () => {
    const { score } = parseDrumtab(
      `title: T\nmeter: 3/4\n[A]\n| bd: o / o / o |`,
    );
    expect(score.sections[0].bars[0].beats).toHaveLength(3);
  });

  it("handles 2/4 meter (2 beats)", () => {
    const { score } = parseDrumtab(
      `title: T\nmeter: 2/4\n[A]\n| bd: o / o |`,
    );
    expect(score.sections[0].bars[0].beats).toHaveLength(2);
  });
});
