import { describe, expect, it } from "vitest";
import { parseDrumtab } from "../src/notation/parser";
import { layoutScore, type RowGroup } from "../src/notation/layout";

function layoutBarOf(src: string) {
  const { score } = parseDrumtab(src);
  const layout = layoutScore(score, {
    showLabels: false,
    expanded: false,
    width: 900,
  });
  return layout.rows[0][0];
}

describe("layoutBar row merging", () => {
  it("cymbals always gets its own row", () => {
    const bar = layoutBarOf(
      `title: T\nmeter: 4/4\n[A]\n| hh: x x x x  bd: o o o o |`,
    );
    expect(bar.rowY.cymbals).toBeDefined();
    expect(bar.rowY.kick).toBeDefined();
    expect(bar.rowY.cymbals).not.toBe(bar.rowY.kick);
  });

  it("kick and snare merge when they never share a slot", () => {
    const bar = layoutBarOf(
      `title: T\nmeter: 4/4\n[A]\n| bd: o - o -  sn: - o - o |`,
    );
    expect(bar.rowY.kick).toBeDefined();
    expect(bar.rowY.snare).toBeDefined();
    expect(bar.rowY.kick).toBe(bar.rowY.snare);
  });

  it("kick and snare stay on separate rows when they collide", () => {
    const bar = layoutBarOf(
      `title: T\nmeter: 4/4\n[A]\n| bd: o o o o  sn: o - - - |`,
    );
    expect(bar.rowY.kick).not.toBe(bar.rowY.snare);
  });

  it("kick and floor tom merge when no overlap", () => {
    const bar = layoutBarOf(
      `title: T\nmeter: 4/4\n[A]\n| bd: o - o -  ft: - o - o |`,
    );
    expect(bar.rowY.kick).toBe(bar.rowY.toms);
  });

  it("kick and floor tom split when they overlap (single slot)", () => {
    const bar = layoutBarOf(
      `title: T\nmeter: 4/4\n[A]\n| bd: o - - -  ft: o - - - |`,
    );
    expect(bar.rowY.kick).not.toBe(bar.rowY.toms);
  });

  it("empty lanes do not force extra rows", () => {
    const bar = layoutBarOf(
      `title: T\nmeter: 4/4\n[A]\n| hh: x x x x  bd: - - - -  sn: o - o - |`,
    );
    // bd has no hits → shouldn't claim a row
    expect(bar.rowY.kick).toBeUndefined();
    expect(bar.rowY.snare).toBeDefined();
    expect(bar.rowY.cymbals).toBeDefined();
  });

  it("4 groups all colliding need 4 distinct rows", () => {
    const bar = layoutBarOf(
      `title: T\nmeter: 4/4\n[A]\n| hh: x - - -  bd: o - - -  sn: o - - -  ft: o - - - |`,
    );
    const ys = new Set<number | undefined>([
      bar.rowY.cymbals,
      bar.rowY.toms,
      bar.rowY.snare,
      bar.rowY.kick,
    ]);
    ys.delete(undefined);
    expect(ys.size).toBe(4);
  });
});

describe("layoutBar beam segments", () => {
  it("rest-only group emits no beam", () => {
    const bar = layoutBarOf(
      `title: T\nmeter: 4/4\n[A]\n| hh: - , x / x / x / x |`,
    );
    // Beat 1 has two groups: first rest, second hit. Only the second should
    // have a beam segment.
    const beat1 = bar.beats[0];
    const hhLanes = beat1.lanes.filter((l) => l.instrument === "hihatClosed");
    expect(hhLanes).toHaveLength(2);
    const [first, second] = hhLanes;
    expect(first.beamSegments).toHaveLength(0);
    expect(first.beamDepth).toBe(0);
    expect(second.beamSegments).toHaveLength(1);
    expect(second.beamDepth).toBeGreaterThan(0);
  });

  it("isolated 8th note gets a beam underline", () => {
    const bar = layoutBarOf(
      `title: T\nmeter: 4/4\n[A]\n| hh: o , o / x / x / x |`,
    );
    const beat1 = bar.beats[0];
    const hhLanes = beat1.lanes.filter((l) => l.instrument === "hihatClosed");
    hhLanes.forEach((lane) => {
      expect(lane.beamDepth).toBe(1);
      expect(lane.beamSegments).toHaveLength(1);
    });
  });

  it("16th-note packed group gets two beams", () => {
    const bar = layoutBarOf(
      `title: T\nmeter: 4/4\n[A]\n| hh: xxxx / x / x / x |`,
    );
    const beat1 = bar.beats[0];
    const hh = beat1.lanes.find((l) => l.instrument === "hihatClosed")!;
    expect(hh.division).toBe(4);
    expect(hh.beamDepth).toBe(2);
  });
});

describe("hit row-group assignment", () => {
  it("every hit has a rowGroup that matches its instrument", () => {
    const bar = layoutBarOf(
      `title: T\nmeter: 4/4\n[A]\n| hh: x x x x  bd: o - o -  sn: - o - o  ft: - - - o |`,
    );
    bar.hits.forEach((h) => {
      const expectedGroup: RowGroup =
        h.hit.instrument === "kick"
          ? "kick"
          : h.hit.instrument === "snare"
            ? "snare"
            : h.hit.instrument === "floorTom"
              ? "toms"
              : h.hit.instrument === "tomHigh" || h.hit.instrument === "tomMid"
                ? "toms"
                : "cymbals";
      expect(h.rowGroup).toBe(expectedGroup);
      // y coord must match the assigned rowY for that group.
      expect(h.y).toBe(bar.rowY[expectedGroup]);
    });
  });
});
