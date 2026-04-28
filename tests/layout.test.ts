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

describe("beam merging across groups", () => {
  it("two 8ths split across a beat share one outer beam", () => {
    // Beat 1: o , o (two halves, each a single hit) → one continuous 8-beam
    const bar = layoutBarOf(
      `title: T\nmeter: 4/4\n[A]\n| hh: o , o / x / x / x |`,
    );
    const b0 = bar.beats[0];
    // Beam merged for cymbals should be a single segment spanning both halves
    const cymBeams = b0.beams.filter((b) => b.rowGroup === "cymbals");
    expect(cymBeams).toHaveLength(1); // one depth-1 segment, merged
    expect(cymBeams[0].depth).toBe(1);
    const firstHh = b0.lanes.filter((l) => l.rowGroup === "cymbals")[0];
    const lastHh = b0.lanes.filter((l) => l.rowGroup === "cymbals").at(-1)!;
    // Merged segment spans from first lane's x1 to last lane's x2.
    expect(cymBeams[0].x1).toBeCloseTo(firstHh.beamSegments[0].x1, 0);
    expect(cymBeams[0].x2).toBeCloseTo(lastHh.beamSegments[0].x2, 0);
  });

  it("8 + 16 16 (o , xx) merges outer beam, inner stays split", () => {
    // Beat 1 split: first half o (1/8), second half xx (2 x 1/16)
    const bar = layoutBarOf(
      `title: T\nmeter: 4/4\n[A]\n| hh: o , xx / x / x / x |`,
    );
    const b0 = bar.beats[0];
    const cymBeams = b0.beams.filter((b) => b.rowGroup === "cymbals");
    // depth 1 (outer) merged across both halves
    const d1 = cymBeams.filter((b) => b.depth === 1);
    expect(d1).toHaveLength(1);
    // depth 2 only exists on the second half
    const d2 = cymBeams.filter((b) => b.depth === 2);
    expect(d2).toHaveLength(1);
    // depth 2 span narrower than depth 1 span
    expect(d2[0].x2 - d2[0].x1).toBeLessThan(d1[0].x2 - d1[0].x1);
  });

  it("16 16 , 8 (xx , o) merges outer beam, inner only in first half", () => {
    const bar = layoutBarOf(
      `title: T\nmeter: 4/4\n[A]\n| hh: xx , o / x / x / x |`,
    );
    const b0 = bar.beats[0];
    const d1 = b0.beams.filter((b) => b.rowGroup === "cymbals" && b.depth === 1);
    const d2 = b0.beams.filter((b) => b.rowGroup === "cymbals" && b.depth === 2);
    expect(d1).toHaveLength(1);
    expect(d2).toHaveLength(1);
    expect(d2[0].x1).toBeLessThan(d1[0].x2 / 2 + d1[0].x1 / 2);
  });

  it("rest-only group breaks the beam chain", () => {
    // First half is a rest → no outer beam on first half → two segments
    // (one for the single-hit group) would be possible; here rest group
    // contributes nothing so only the hit group's beam remains.
    const bar = layoutBarOf(
      `title: T\nmeter: 4/4\n[A]\n| hh: - , xx / x / x / x |`,
    );
    const b0 = bar.beats[0];
    const cymBeams = b0.beams.filter((b) => b.rowGroup === "cymbals");
    // Only second-half beams exist
    cymBeams.forEach((b) => {
      expect(b.x1).toBeGreaterThan(b0.x + b0.width / 2 - 5);
    });
  });

  it("whole-beat 4 × 16ths has 2 merged beams spanning the beat", () => {
    const bar = layoutBarOf(
      `title: T\nmeter: 4/4\n[A]\n| hh: xxxx / x / x / x |`,
    );
    const b0 = bar.beats[0];
    const cymBeams = b0.beams.filter((b) => b.rowGroup === "cymbals");
    expect(cymBeams).toHaveLength(2);
    expect(cymBeams[0].depth).toBe(1);
    expect(cymBeams[1].depth).toBe(2);
  });

  it("cymbal and drum rows produce independent merged beams", () => {
    const bar = layoutBarOf(
      `title: T\nmeter: 4/4\n[A]\n| hh: o , o / x / x / x  sn: o , o / x / x / x |`,
    );
    const b0 = bar.beats[0];
    const cymBeams = b0.beams.filter((b) => b.rowGroup === "cymbals");
    const sn_or_merged = b0.beams.filter((b) => b.rowGroup !== "cymbals");
    expect(cymBeams).toHaveLength(1);
    expect(sn_or_merged.length).toBeGreaterThanOrEqual(1);
    // Independent y positions
    expect(cymBeams[0].y).not.toBe(sn_or_merged[0].y);
  });

  it("triplet group draws beam and tuplet label", () => {
    const bar = layoutBarOf(
      `title: T\nmeter: 4/4\n[A]\n| sn: (3)xxx / x / x / x |`,
    );
    const b0 = bar.beats[0];
    const beams = b0.beams.filter((b) => b.rowGroup === "snare");
    expect(beams.length).toBeGreaterThan(0);
    const sn = b0.lanes.find((l) => l.instrument === "snare")!;
    expect(sn.tuplet).toBe(3);
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
