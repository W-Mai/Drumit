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
});
