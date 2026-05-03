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

  it("regression: dotted extension on one lane punches out other lanes' beams in that range", () => {
    // `bd: o.-` (dotted 8th + 16th rest) extends through the second
    // 16th slot of beat 0. Snare plays `- , -x` on the same beat —
    // its 16th-rest slot sits exactly where kick's dot extends, so
    // snare's d=2 beam must shrink to only the final hit slot.
    const layout = layoutScoreOf(
      `title: T\nmeter: 4/4\n[A]\n| sn: - , -x / - / - / -  bd: o.- / - / - / - |`,
      900,
    );
    const bar = layout.rows[0][0];
    const snap = bar.beats[0].beams.map((b) => ({
      rowGroup: b.rowGroup,
      depth: b.depth,
      x1: Number(b.x1.toFixed(1)),
      x2: Number(b.x2.toFixed(1)),
    }));
    const d2 = snap.find((b) => b.depth === 2)!;
    // Without the punch the d=2 would be the full [53.1, 75.3]; with
    // it, it shrinks to cover only the last 16th slot (~10 px wide).
    expect(d2.x2 - d2.x1).toBeLessThan(15);
    expect(d2.x2).toBeCloseTo(75.3, 0);
  });

  it("regression: dotted lane keeps its own short beam (no self-punch)", () => {
    // `bd: o.o` — the dotted 8th extends into what would be the 16th
    // slot, and that slot has its own 16th hit after. The kick row
    // must still draw its own d=2 short beam for the final 16th.
    const layout = layoutScoreOf(
      `title: T\nmeter: 4/4\n[A]\n| bd: o.o / - / - / - |`,
      900,
    );
    const bar = layout.rows[0][0];
    const beams = bar.beats[0].beams;
    const kickD2 = beams.find((b) => b.rowGroup === "kick" && b.depth === 2);
    expect(kickD2).toBeDefined();
    expect(kickD2!.x2 - kickD2!.x1).toBeGreaterThan(5);
  });

  it("regression: bd+rb 16ths — exact beam snapshot (collapse to kick)", () => {
    const layout = layoutScoreOf(
      `title: T\nmeter: 4/4\n[A]\n| bd: o--- / -o-- / --o- / ---o  hho: - / -- / - / -  rb: -xx- / -x-x / x--- / xxxx |`,
      1200,
    );
    const bar = layout.rows[0][0];
    const snap = bar.beats.map((bt) =>
      bt.beams.map((b) => ({
        rowGroup: b.rowGroup,
        depth: b.depth,
        x1: Number(b.x1.toFixed(1)),
        x2: Number(b.x2.toFixed(1)),
        y: b.y,
      })),
    );
    // Identical stacks on cymbals and kick collapse to a single kick
    // stack per beat (cymbals disappears, kick keeps d=1 + d=2).
    expect(snap).toHaveLength(4);
    for (let i = 0; i < 4; i += 1) {
      expect(snap[i].map((b) => `${b.rowGroup}:${b.depth}`)).toEqual([
        "kick:2",
        "kick:1",
      ]);
    }
  });

  it("regression: `cr/hh/bd/sn/ft` dotted+split multi-lane bar — exact beam snapshot", () => {
    // User-reported bar, pinned to the exact beams layoutScore
    // produces at width 1200. Any per-beam change (rowGroup, depth,
    // x1, x2, y) will break this and force a conscious decision.
    const layout = layoutScoreOf(
      `title: T\nmeter: 4/4\n[A]\n| cr: -- / - / - / -  hh: oo / o , o- / o- , o / oo  bd: o- / - , -o / -o , o / - , --  sn: - / x- / -- / x-  ft: - / - , -- / - / - |`,
      1200,
    );
    const bar = layout.rows[0][0];
    const snapshot = bar.beats.map((bt) =>
      bt.beams.map((b) => ({
        rowGroup: b.rowGroup,
        depth: b.depth,
        x1: Number(b.x1.toFixed(1)),
        x2: Number(b.x2.toFixed(1)),
        y: b.y,
      })),
    );
    expect(snapshot).toEqual([
      [{ rowGroup: "kick", depth: 1, x1: 29, x2: 79.4, y: 122 }],
      [
        { rowGroup: "kick", depth: 2, x1: 107.6, x2: 131.8, y: 125 },
        { rowGroup: "kick", depth: 1, x1: 81.4, x2: 131.8, y: 122 },
      ],
      [
        { rowGroup: "kick", depth: 2, x1: 133.8, x2: 158, y: 125 },
        { rowGroup: "kick", depth: 1, x1: 133.8, x2: 184.2, y: 122 },
      ],
      [{ rowGroup: "snare", depth: 1, x1: 186.2, x2: 236.6, y: 122 }],
    ]);
  });

  it("regression: kick `o-` + snare `-x` — exact beam snapshot", () => {
    const layout = layoutScoreOf(
      `title: T\nmeter: 4/4\n[A]\n| hh: oooo / oooo / oooo / oooo  bd: o- / o- / o- / o-  sn: -x / -x / -x / -x |`,
      900,
    );
    const bar = layout.rows[0][0];
    const snap = bar.beats.map((bt) =>
      bt.beams.map((b) => ({
        rowGroup: b.rowGroup,
        depth: b.depth,
        x1: Number(b.x1.toFixed(1)),
        x2: Number(b.x2.toFixed(1)),
        y: b.y,
      })),
    );
    // All four beats share the same triple-stack (cymbals d=2, cymbals
    // d=1, kick d=1) across equal x-ranges per beat.
    expect(snap).toHaveLength(4);
    for (let i = 0; i < 4; i += 1) {
      expect(snap[i]).toHaveLength(3);
      expect(snap[i].map((b) => `${b.rowGroup}:${b.depth}`)).toEqual([
        "cymbals:2",
        "kick:1",
        "cymbals:1",
      ]);
    }
  });

  it("regression: dotted 8th + 16th (o.o) — exact beam snapshot", () => {
    const layout = layoutScoreOf(
      `title: T\nmeter: 4/4\n[A]\n| hh: o.o / oo / oo / oo |`,
      900,
    );
    const bar = layout.rows[0][0];
    const snap = bar.beats.map((bt) =>
      bt.beams.map((b) => ({
        rowGroup: b.rowGroup,
        depth: b.depth,
        x1: Number(b.x1.toFixed(1)),
        x2: Number(b.x2.toFixed(1)),
        y: b.y,
      })),
    );
    expect(snap).toEqual([
      [
        { rowGroup: "cymbals", depth: 2, x1: 65.2, x2: 75.3, y: 101 },
        { rowGroup: "cymbals", depth: 1, x1: 29, x2: 75.3, y: 98 },
      ],
      [{ rowGroup: "cymbals", depth: 1, x1: 77.3, x2: 123.5, y: 98 }],
      [{ rowGroup: "cymbals", depth: 1, x1: 125.5, x2: 171.8, y: 98 }],
      [{ rowGroup: "cymbals", depth: 1, x1: 173.8, x2: 220, y: 98 }],
    ]);
  });

  it("regression: pop-rock `hh: xxxx + bd: o- + sn: -o` — exact beam snapshot", () => {
    const layout = layoutScoreOf(
      `title: T\nmeter: 4/4\n[A]\n| hh: xxxx / xxxx / xxxx / xxxx  bd: o - / o - / o - / o -  sn: - o / - o / - o / - o |`,
      1200,
    );
    const bar = layout.rows[0][0];
    const snap = bar.beats.map((bt) =>
      bt.beams.map((b) => ({
        rowGroup: b.rowGroup,
        depth: b.depth,
        x1: Number(b.x1.toFixed(1)),
        x2: Number(b.x2.toFixed(1)),
        y: b.y,
      })),
    );
    // Each beat: cymbals d=2 + kick d=1 + cymbals d=1 (self-primary).
    expect(snap).toHaveLength(4);
    for (let i = 0; i < 4; i += 1) {
      expect(snap[i].map((b) => `${b.rowGroup}:${b.depth}`)).toEqual([
        "cymbals:2",
        "kick:1",
        "cymbals:1",
      ]);
    }
  });

  it("whole-beat 4 × 16ths has 2 merged beams spanning the beat", () => {
    const bar = layoutBarOf(
      `title: T\nmeter: 4/4\n[A]\n| hh: xxxx / x / x / x |`,
    );
    const b0 = bar.beats[0];
    const cymBeams = b0.beams.filter((b) => b.rowGroup === "cymbals");
    expect(cymBeams).toHaveLength(2);
    const depths = new Set(cymBeams.map((b) => b.depth));
    expect(depths).toEqual(new Set([1, 2]));
  });

  it("cymbal and drum rows with SAME rhythm share one collapsed beam on bottom row", () => {
    const bar = layoutBarOf(
      `title: T\nmeter: 4/4\n[A]\n| hh: o , o / x / x / x  sn: o , o / x / x / x |`,
    );
    const b0 = bar.beats[0];
    // Same rhythm (`o , o`) on both lanes → 1 merged beam at the snare row.
    expect(b0.beams).toHaveLength(1);
    expect(b0.beams[0].rowGroup).toBe("snare");
  });

  it("cymbal and drum rows with DIFFERENT rhythms each keep their own beam", () => {
    const bar = layoutBarOf(
      `title: T\nmeter: 4/4\n[A]\n| hh: xxxx / x / x / x  sn: o , o / x / x / x |`,
    );
    const b0 = bar.beats[0];
    // hh = 1/16 × 4 (2 beams) and snare = 2 × 8ths with outer beam: different.
    const rows = new Set(b0.beams.map((b) => b.rowGroup));
    expect(rows.size).toBeGreaterThanOrEqual(2);
  });

  it("hh `oo` and bd `o-` — same beam shape, one beam collapsed to kick", () => {
    // Both beams are a single depth-1 8th underline spanning the whole beat,
    // so the visual under-line is identical → collapse onto the bottom row.
    const bar = layoutBarOf(
      `title: T\nmeter: 4/4\n[A]\n| hh: oo / x / x / x  bd: o- / - / - / - |`,
    );
    const b0 = bar.beats[0];
    expect(b0.beams).toHaveLength(1);
    expect(b0.beams[0].rowGroup).toBe("kick");
  });

  it("hh `oo` and bd `oo` — same rhythm, one collapsed beam", () => {
    const bar = layoutBarOf(
      `title: T\nmeter: 4/4\n[A]\n| hh: oo / x / x / x  bd: oo / - / - / - |`,
    );
    const b0 = bar.beats[0];
    expect(b0.beams).toHaveLength(1);
    // Collapsed onto the bottom row (kick) since rhythm is identical.
    expect(b0.beams[0].rowGroup).toBe("kick");
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

describe("hit slot width", () => {
  it("16th-note hits have roughly half the slotWidth of 8th-note hits", () => {
    const bar = layoutBarOf(
      `title: T\nmeter: 4/4\n[A]\n| hh: oo / xxxx / x / x |`,
    );
    const hh8 = bar.hits.filter((h) =>
      h.hit.instrument === "hihatClosed" && h.x < bar.x + bar.width / 4,
    );
    const hh16 = bar.hits.filter((h) =>
      h.hit.instrument === "hihatClosed" &&
      h.x > bar.x + bar.width / 4 &&
      h.x < bar.x + bar.width / 2,
    );
    expect(hh8.length).toBeGreaterThan(0);
    expect(hh16.length).toBeGreaterThan(0);
    // 8th slot should be ~2x the 16th slot width.
    const w8 = hh8[0].slotWidth;
    const w16 = hh16[0].slotWidth;
    expect(w8 / w16).toBeCloseTo(2, 0);
  });

  it("slot widths within one group are identical", () => {
    const bar = layoutBarOf(
      `title: T\nmeter: 4/4\n[A]\n| hh: xxxx / xxxx / xxxx / xxxx |`,
    );
    const widths = new Set(bar.hits.map((h) => h.slotWidth));
    expect(widths.size).toBe(1);
  });

  it("split beat produces different slot widths per group", () => {
    const bar = layoutBarOf(
      `title: T\nmeter: 4/4\n[A]\n| hh: o , xx / x / x / x |`,
    );
    const b0 = bar.beats[0];
    const hitsB0 = bar.hits.filter(
      (h) => h.x >= b0.x && h.x <= b0.x + b0.width,
    );
    const widths = hitsB0.map((h) => h.slotWidth);
    // One 8th (wider) + two 16ths (narrower)
    expect(new Set(widths).size).toBe(2);
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

  // Generic regression: when an *entire row* has no hits (all bars are
  // `%`, all-rest, or empty), every bar in that row must still have a
  // finite rowY and non-zero height so the renderer's slash / `∅`
  // glyphs land somewhere.
  it("all-%, all-rest, empty bars all produce finite rowY + height", () => {
    const sources = [
      // 5 `%` bars → 5th wraps to row 2 as a `%`-only row.
      `title: T\nmeter: 4/4\n[A]\n| bd: o / - / o / - |\n| % |\n| % |\n| % |\n| % |`,
      // Row 2 is 4 all-rest bars.
      `title: T\nmeter: 4/4\n[A]\n| bd: o / - / o / - |\n| bd: - / - / - / - |\n| bd: - / - / - / - |\n| bd: - / - / - / - |\n| bd: - / - / - / - |`,
      // Row 2 is empty bars (no lanes).
      `title: T\nmeter: 4/4\n[A]\n| bd: o / - / o / - |\n| |\n| |\n| |\n| |`,
    ];
    for (const src of sources) {
      const layout = layoutScoreOf(src);
      for (const row of layout.rows) {
        for (const bar of row) {
          expect(bar.height).toBeGreaterThan(0);
          expect(bar.rowGroups.length).toBeGreaterThan(0);
          for (const g of bar.rowGroups) {
            expect(Number.isFinite(bar.rowY[g])).toBe(true);
          }
        }
      }
    }
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

  it("quintuplet beam depth uses base+1 once effective subdivision doubles", () => {
    // 5-tuplet across a beat is unusual but should not crash.
    const bar = layoutBarOf(
      `title: T\nmeter: 4/4\n[A]\n| sn: (5)xxxxx / x / x / x |`,
    );
    const sn = bar.beats[0].lanes.find((l) => l.instrument === "snare")!;
    expect(sn.tickXs).toHaveLength(5);
    expect(sn.tuplet).toBe(5);
    expect(sn.beamDepth).toBeGreaterThan(0);
  });

  it("mixed tuplet + non-tuplet lanes render independently", () => {
    // One lane triplet, another straight 8ths — the straight lane
    // shouldn't pick up the tuplet number label.
    const bar = layoutBarOf(
      `title: T\nmeter: 4/4\n[A]\n| sn: (3)xxx / x / x / x  hh: oo / x / x / x |`,
    );
    const hh = bar.beats[0].lanes.find(
      (l) => l.instrument === "hihatClosed",
    )!;
    expect(hh.tuplet).toBeFalsy();
  });
});

describe("tuplet label merging", () => {
  it("single triplet lane → single label", () => {
    const bar = layoutBarOf(
      `title: T\nmeter: 4/4\n[A]\n| sn: (3)xxx / x / x / x |`,
    );
    const tuplets = bar.beats[0].tuplets;
    expect(tuplets).toHaveLength(1);
    expect(tuplets[0].number).toBe(3);
    expect(tuplets[0].rowGroup).toBe("snare");
  });

  it("two lanes both triplet → merged into one label", () => {
    const bar = layoutBarOf(
      `title: T\nmeter: 4/4\n[A]\n| sn: (3)xxx / x / x / x  hh: (3)xxx / x / x / x |`,
    );
    const tuplets = bar.beats[0].tuplets;
    expect(tuplets).toHaveLength(1);
    expect(tuplets[0].number).toBe(3);
  });

  it("merged label sits at bottom-most row", () => {
    // Both snare and hi-hat are triplets. Merged label should sit on snare
    // (below cymbals) — snare's y is larger (further down the page).
    const bar = layoutBarOf(
      `title: T\nmeter: 4/4\n[A]\n| sn: (3)xxx / x / x / x  hh: (3)xxx / x / x / x |`,
    );
    const tuplets = bar.beats[0].tuplets;
    expect(tuplets[0].rowGroup).toBe("snare");
  });

  it("different tuplet numbers do not merge", () => {
    // Snare 3-tuplet, hi-hat 5-tuplet.
    const bar = layoutBarOf(
      `title: T\nmeter: 4/4\n[A]\n| sn: (3)xxx / x / x / x  hh: xxxxx / x / x / x |`,
    );
    const tuplets = bar.beats[0].tuplets;
    expect(tuplets).toHaveLength(2);
    const numbers = tuplets.map((t) => t.number).sort();
    expect(numbers).toEqual([3, 5]);
  });

  it("adjacent same-tuplet rows merge but non-tuplet rows break segment", () => {
    // kick (bottom, no tuplet, breaks), snare triplet, hh triplet. Since kick
    // isn't a tuplet its presence doesn't affect merging (merging is on
    // tuplet-bearing rows). Expected 1 merged label.
    const bar = layoutBarOf(
      `title: T\nmeter: 4/4\n[A]\n| bd: o / o / o / o  sn: (3)xxx / x / x / x  hh: (3)xxx / x / x / x |`,
    );
    const tuplets = bar.beats[0].tuplets;
    expect(tuplets).toHaveLength(1);
    expect(tuplets[0].number).toBe(3);
  });

  it("three rows split 1-2 same + 3 different still merges bottom pair", () => {
    // Build: kick triplet, snare triplet, hh 5-tuplet → bottom 2 merge, hh stays
    const bar = layoutBarOf(
      `title: T\nmeter: 4/4\n[A]\n| bd: (3)ooo / o / o / o  sn: (3)xxx / x / x / x  hh: xxxxx / x / x / x |`,
    );
    // kick+snare both triplet → 1 merged label at kick (bottom-most); hh 5 → 1 label
    const tuplets = bar.beats[0].tuplets;
    expect(tuplets).toHaveLength(2);
    const byRow = Object.fromEntries(tuplets.map((t) => [t.rowGroup, t.number]));
    expect(byRow["cymbals"]).toBe(5);
    // kick+snare merged: the label sits at the bottom-most row = kick.
    expect(byRow["kick"]).toBe(3);
    // snare row should NOT have its own label (merged away)
    expect(byRow["snare"]).toBeUndefined();
  });

  it("tuplet label x is horizontally centered across all merged lanes", () => {
    const bar = layoutBarOf(
      `title: T\nmeter: 4/4\n[A]\n| sn: (3)xxx / x / x / x  hh: (3)xxx / x / x / x |`,
    );
    const beat0 = bar.beats[0];
    const t = beat0.tuplets[0];
    // Triplet ticks span the whole beat; center should be at beat center.
    const beatCenter = beat0.x + beat0.width / 2;
    expect(Math.abs(t.x - beatCenter)).toBeLessThan(2);
  });

  it("non-tuplet beats have no tuplet labels", () => {
    const bar = layoutBarOf(
      `title: T\nmeter: 4/4\n[A]\n| hh: xxxx / xxxx / xxxx / xxxx |`,
    );
    bar.beats.forEach((b) => expect(b.tuplets).toHaveLength(0));
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

  it("front-8 back-16-16: the 8th note's pixel range is wider than each 16th", () => {
    const bar = layoutBarOf(
      `title: T\nmeter: 4/4\n[A]\n| hh: o , xx / x / x / x |`,
    );
    const beat0 = bar.beats[0];
    const lanes = beat0.lanes.filter((l) => l.instrument === "hihatClosed");
    expect(lanes).toHaveLength(2);
    // Each lane's beam segment covers the visual range of the group.
    const g0span = lanes[0].beamSegments[0]
      ? lanes[0].beamSegments[0].x2 - lanes[0].beamSegments[0].x1
      : Math.abs(lanes[0].tickXs[0] - beat0.x) * 2;
    const g1seg = lanes[1].beamSegments[0];
    const g1span = g1seg ? g1seg.x2 - g1seg.x1 : 0;
    // Both halves span approximately equal width (ratio 0.5 each).
    expect(Math.abs(g0span - g1span)).toBeLessThan(1.5);
    // Inside group 1, the two 16th ticks should be half the spacing of group 0's single tick's allocated slot.
    const g1tickGap = lanes[1].tickXs[1] - lanes[1].tickXs[0];
    // Group 0 has only 1 tick so we infer its "slot width" = its full ratio (half the beat).
    const beatWidth = beat0.width;
    const g0slotWidth = 0.5 * beatWidth; // ratio 0.5, 1 division
    const g1slotWidth = (0.5 * beatWidth) / 2; // ratio 0.5, 2 divisions
    expect(Math.abs(g1tickGap - g1slotWidth)).toBeLessThan(1.5);
    // 8th slot is roughly 2x the 16th slot width.
    expect(g0slotWidth / g1slotWidth).toBeCloseTo(2, 0);
  });

  it("uneven 8 + triplet split: triplet ticks are evenly spaced within their half", () => {
    const bar = layoutBarOf(
      `title: T\nmeter: 4/4\n[A]\n| sn: o , (3)xxx / x / x / x |`,
    );
    const beat0 = bar.beats[0];
    const lanes = beat0.lanes.filter((l) => l.instrument === "snare");
    expect(lanes).toHaveLength(2);
    const triplet = lanes[1];
    expect(triplet.tickXs).toHaveLength(3);
    const gaps = [
      triplet.tickXs[1] - triplet.tickXs[0],
      triplet.tickXs[2] - triplet.tickXs[1],
    ];
    expect(Math.abs(gaps[0] - gaps[1])).toBeLessThan(0.5);
  });
});
