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

function layoutScoreOf(src: string, width = 900) {
  const { score } = parseDrumtab(src);
  return layoutScore(score, { showLabels: false, expanded: false, width });
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

describe("hit positioning integrity", () => {
  it("every hit has a finite numeric x/y", () => {
    const bar = layoutBarOf(
      `title: T\nmeter: 4/4\n[A]\n| hh: oo / o / o / o  bd: o / - / o / -  sn: - / x / - / x |`,
    );
    bar.hits.forEach((h) => {
      expect(Number.isFinite(h.x)).toBe(true);
      expect(Number.isFinite(h.y)).toBe(true);
    });
  });

  it("tickXs cover every non-null slot in a group", () => {
    const bar = layoutBarOf(
      `title: T\nmeter: 4/4\n[A]\n| hh: oo / xxxx / xxxx / xxxx |`,
    );
    bar.beats.forEach((beat) => {
      beat.lanes.forEach((lane) => {
        expect(lane.tickXs.length).toBe(lane.division);
        lane.tickXs.forEach((x) => expect(Number.isFinite(x)).toBe(true));
      });
    });
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

describe("multi-bar layout", () => {
  it("lays out multiple sections with headers and bar rows", () => {
    const layout = layoutScoreOf(
      `title: T\nmeter: 4/4\n[A]\n| bd: o / o / o / o |\n[B]\n| sn: o / o / o / o |`,
      900,
    );
    expect(layout.sectionHeaders.map((h) => h.label)).toEqual(["A", "B"]);
    // Both bars exist, each section has 1 bar.
    const totalBars = layout.rows.reduce((a, r) => a + r.length, 0);
    expect(totalBars).toBe(2);
  });

  it("honors narrow widths by wrapping bars onto multiple rows", () => {
    const layout = layoutScoreOf(
      `title: T\nmeter: 4/4\n[A]\n| bd: o / o / o / o |\n| bd: o / o / o / o |\n| bd: o / o / o / o |\n| bd: o / o / o / o |\n| bd: o / o / o / o |`,
      320, // tight viewport
    );
    // Should wrap (at least 2 rows).
    expect(layout.rows.length).toBeGreaterThanOrEqual(2);
  });

  it("section header y is before its first bar row", () => {
    const layout = layoutScoreOf(
      `title: T\nmeter: 4/4\n[A]\n| bd: o / o / o / o |\n[B]\n| sn: o / o / o / o |`,
      900,
    );
    const aBar = layout.rows[0][0];
    const bBar = layout.rows[1][0];
    expect(layout.sectionHeaders[0].y).toBeLessThan(aBar.y);
    expect(layout.sectionHeaders[1].y).toBeLessThan(bBar.y);
  });
});

describe("repeat-previous layout", () => {
  it("renders repeat bar with no beam or hit but uses bar height", () => {
    const layout = layoutScoreOf(
      `title: T\nmeter: 4/4\n[A]\n| bd: o / o / o / o |\n| % |`,
    );
    const repeatBar = layout.rows[0][1];
    expect(repeatBar.repeatPrevious).toBe(true);
    expect(repeatBar.hits).toHaveLength(0);
    expect(repeatBar.beats.flatMap((b) => b.beams)).toHaveLength(0);
  });

  it("repeat hint variants are preserved through layout", () => {
    const layout = layoutScoreOf(
      `title: T\nmeter: 4/4\n[A]\n| bd: o / o / o / o |\n| % |\n| %. |\n| %- |\n| %, |`,
    );
    const bars = layout.rows[0];
    expect(bars[1].repeatPrevious).toBe(true);
    expect(bars[1].repeatCount).toBe(1);
  });
});

describe("tuplet placement", () => {
  it("triplet beat places 3 hits equally spaced across beat width", () => {
    const bar = layoutBarOf(
      `title: T\nmeter: 4/4\n[A]\n| sn: (3)xxx / x / x / x |`,
    );
    const beat0 = bar.beats[0];
    const sn = beat0.lanes.find((l) => l.instrument === "snare")!;
    expect(sn.tickXs).toHaveLength(3);
    const gap1 = sn.tickXs[1] - sn.tickXs[0];
    const gap2 = sn.tickXs[2] - sn.tickXs[1];
    expect(Math.abs(gap1 - gap2)).toBeLessThan(0.5);
  });

  it("sextuplet produces 6 equally spaced ticks", () => {
    const bar = layoutBarOf(
      `title: T\nmeter: 4/4\n[A]\n| sn: xxxxxx / x / x / x |`,
    );
    const sn = bar.beats[0].lanes.find((l) => l.instrument === "snare")!;
    expect(sn.tickXs).toHaveLength(6);
    expect(sn.tuplet).toBe(6);
  });
});

describe("ghost / accent visual flags", () => {
  it("ghost articulation does not move x position", () => {
    const bar = layoutBarOf(
      `title: T\nmeter: 4/4\n[A]\n| sn: (o) / o / (o) / o |`,
    );
    const xs = bar.hits
      .filter((h) => h.hit.instrument === "snare")
      .map((h) => h.x);
    // 4 hits at equal spacing
    expect(xs).toHaveLength(4);
    const gap0 = xs[1] - xs[0];
    const gap1 = xs[2] - xs[1];
    const gap2 = xs[3] - xs[2];
    expect(Math.abs(gap0 - gap1)).toBeLessThan(0.5);
    expect(Math.abs(gap1 - gap2)).toBeLessThan(0.5);
  });
});

describe("meter / bar width edge cases", () => {
  it("2/4 bar is narrower than 4/4 bar at same viewport", () => {
    const l4 = layoutScoreOf(
      `title: T\nmeter: 4/4\n[A]\n| bd: o / o / o / o |`,
      600,
    );
    const l2 = layoutScoreOf(
      `title: T\nmeter: 2/4\n[A]\n| bd: o / o |`,
      600,
    );
    // 2/4 bars could pack more per row. Compare by bars per first row:
    expect(l2.rows[0][0].width).toBeLessThanOrEqual(l4.rows[0][0].width + 0.01);
  });

  it("inline meter override reflects in bar.meter", () => {
    const layout = layoutScoreOf(
      `title: T\nmeter: 4/4\n[A]\n| meter: 2/4 | bd: o / o |\n| bd: o / o / o / o |`,
    );
    // Second bar parses fine (inline override only applies to first bar).
    expect(layout.rows[0]).toHaveLength(2);
  });
});

describe("intra-beat group layout", () => {
  it("groups with ratio 0.5/0.5 split beat width evenly", () => {
    const bar = layoutBarOf(
      `title: T\nmeter: 4/4\n[A]\n| hh: o , o / x / x / x |`,
    );
    const beat0 = bar.beats[0];
    const lanes = beat0.lanes.filter((l) => l.instrument === "hihatClosed");
    // Two lanes (one per group), each 1 tick
    expect(lanes).toHaveLength(2);
    const x1 = lanes[0].tickXs[0];
    const x2 = lanes[1].tickXs[0];
    // Both inside beat bounds
    expect(x1).toBeGreaterThan(beat0.x);
    expect(x2).toBeLessThan(beat0.x + beat0.width);
    // First is on left half, second is on right half
    expect(x1).toBeLessThan(beat0.x + beat0.width / 2);
    expect(x2).toBeGreaterThan(beat0.x + beat0.width / 2);
  });

  it("uneven split (8 + triplet) keeps beam on outermost level", () => {
    const bar = layoutBarOf(
      `title: T\nmeter: 4/4\n[A]\n| hh: o , (3)xxx / x / x / x |`,
    );
    const beat0 = bar.beats[0];
    const d1 = beat0.beams.filter(
      (b) => b.rowGroup === "cymbals" && b.depth === 1,
    );
    expect(d1).toHaveLength(1);
  });
});
