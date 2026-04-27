import { describe, expect, it } from "vitest";
import { parseDrumtab } from "../src/notation/parser";

describe("parseDrumtab", () => {
  it("parses a 4/4 bar with slash-separated beats", () => {
    const { score, diagnostics } = parseDrumtab(
      `title: T\nmeter: 4/4\n[A]\n| hh: x / x / x / x  bd: o / - / o / -  sn: - / o / - / o |`,
    );
    expect(diagnostics.filter((d) => d.level === "error")).toHaveLength(0);
    const bar = score.sections[0].bars[0];
    expect(bar.beats).toHaveLength(4);
    expect(bar.beats[0].slots[0].hits).toHaveLength(2); // hh + bd
    expect(bar.beats[1].slots[0].hits).toHaveLength(2); // hh + sn
  });

  it("supports packed 16th-note beats", () => {
    const { score } = parseDrumtab(
      `title: T\nmeter: 4/4\n[A]\n| hh: xxxx / xxxx / xxxx / xxxx |`,
    );
    const bar = score.sections[0].bars[0];
    expect(bar.beats[0].division).toBe(4);
    expect(bar.beats[0].slots).toHaveLength(4);
  });

  it("marks repeat previous bars", () => {
    const { score } = parseDrumtab(
      `title: T\nmeter: 4/4\n[A]\n| hh: x / x / x / x |\n| % |`,
    );
    expect(score.sections[0].bars[1].repeatPrevious).toBe(true);
  });

  it("parses inline meter overrides", () => {
    const { score } = parseDrumtab(
      `title: T\nmeter: 4/4\n[A]\n| meter: 2/4 | hh: x / x |`,
    );
    const bar = score.sections[0].bars[0];
    expect(bar.meter).toEqual({ beats: 2, beatUnit: 4 });
    expect(bar.beats).toHaveLength(2);
  });

  it("parses triplet marker (3) on a beat", () => {
    const { score, diagnostics } = parseDrumtab(
      `title: T\nmeter: 4/4\n[A]\n| sn: (3)xxx / xxxx / xxxx / xxxx |`,
    );
    expect(diagnostics.filter((d) => d.level === "error")).toHaveLength(0);
    const bar = score.sections[0].bars[0];
    expect(bar.beats[0].tuplet).toBe(3);
    expect(bar.beats[0].slots).toHaveLength(3);
    expect(bar.beats[1].tuplet).toBeUndefined();
  });

  it("parses standalone R/L sticking tokens", () => {
    const { score } = parseDrumtab(
      `title: T\nmeter: 4/4\n[A]\n| sn: R / L / R / L |`,
    );
    const bar = score.sections[0].bars[0];
    expect(bar.beats[0].slots[0].hits[0].sticking).toBe("R");
    expect(bar.beats[1].slots[0].hits[0].sticking).toBe("L");
  });
});
