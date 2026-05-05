import { describe, expect, it } from "vitest";
import { parseDrumtab } from "../src/notation/parser";
import { serializeScore } from "../src/notation/serialize";
import {
  clearBar,
  clearLaneBeat,
  cycleBarEnding,
  cycleDots,
  deleteBar,
  deleteBars,
  deleteSection,
  extractBars,
  insertBarAfter,
  insertSectionAfterBar,
  pasteBarsAtSectionEnd,
  pasteBarsBefore,
  renameSection,
  setBarRepeatPrevious,
  setLaneDivision,
  setGroupDivision,
  setSticking,
  splitBeatIntoGroups,
  toggleArticulation,
  toggleBarRepeatEnd,
  toggleBarRepeatStart,
  toggleSlot,
} from "../src/notation/edit";

function loadBar(src: string) {
  const { score } = parseDrumtab(src);
  return { score, barIdx: 0 };
}

describe("edit operations — per-lane independence", () => {
  it("splitting hh does not affect bd/sn in the same beat", () => {
    const { score } = loadBar(
      `title: T\nmeter: 4/4\n[A]\n| hh: x / x / x / x  bd: o / o / o / o  sn: o / o / o / o |`,
    );
    const next = splitBeatIntoGroups(score, 0, 0, "hihatClosed", 2);
    const beat0 = next.sections[0].bars[0].beats[0];
    const hh = beat0.lanes.find((l) => l.instrument === "hihatClosed")!;
    const bd = beat0.lanes.find((l) => l.instrument === "kick")!;
    const sn = beat0.lanes.find((l) => l.instrument === "snare")!;
    expect(hh.groups).toBeDefined();
    expect(hh.groups).toHaveLength(2);
    expect(bd.groups).toBeUndefined();
    expect(sn.groups).toBeUndefined();
    expect(bd.division).toBe(1);
    expect(sn.division).toBe(1);
  });

  it("setLaneDivision changes only the target lane", () => {
    const { score } = loadBar(
      `title: T\nmeter: 4/4\n[A]\n| hh: x / x / x / x  bd: o / o / o / o |`,
    );
    const next = setLaneDivision(score, 0, 0, "kick", 4);
    const beat0 = next.sections[0].bars[0].beats[0];
    const hh = beat0.lanes.find((l) => l.instrument === "hihatClosed")!;
    const bd = beat0.lanes.find((l) => l.instrument === "kick")!;
    expect(bd.division).toBe(4);
    expect(hh.division).toBe(1); // hh was integral ("x") meaning whole-beat 1 slot
  });

  it("setLaneDivision on split lane clears groups (explicit reset)", () => {
    const { score } = loadBar(
      `title: T\nmeter: 4/4\n[A]\n| hh: o , xx / x / x / x |`,
    );
    expect(
      score.sections[0].bars[0].beats[0].lanes.find(
        (l) => l.instrument === "hihatClosed",
      )?.groups?.length,
    ).toBe(2);
    const next = setLaneDivision(score, 0, 0, "hihatClosed", 4);
    const hh = next.sections[0].bars[0].beats[0].lanes.find(
      (l) => l.instrument === "hihatClosed",
    )!;
    expect(hh.groups).toBeUndefined();
    expect(hh.division).toBe(4);
  });

  it("setGroupDivision only affects one group of the same lane", () => {
    const { score } = loadBar(
      `title: T\nmeter: 4/4\n[A]\n| hh: o , xx / x / x / x |`,
    );
    const next = setGroupDivision(score, 0, 0, "hihatClosed", 1, 3);
    const hh = next.sections[0].bars[0].beats[0].lanes.find(
      (l) => l.instrument === "hihatClosed",
    )!;
    expect(hh.groups).toHaveLength(2);
    expect(hh.groups![0].division).toBe(1); // unchanged
    expect(hh.groups![1].division).toBe(3); // changed
    expect(hh.groups![1].tuplet).toBe(3);
  });

  it("toggleSlot into a group-mode lane keeps the other lanes untouched", () => {
    const { score } = loadBar(
      `title: T\nmeter: 4/4\n[A]\n| hh: o , xx / x / x / x  bd: o / o / o / o |`,
    );
    const next = toggleSlot(score, 0, 0, "hihatClosed", 0, 1);
    const hh = next.sections[0].bars[0].beats[0].lanes.find(
      (l) => l.instrument === "hihatClosed",
    )!;
    const bd = next.sections[0].bars[0].beats[0].lanes.find(
      (l) => l.instrument === "kick",
    )!;
    // we toggled the first slot of group 1 — flipping its existing hit to null
    expect(hh.groups![1].slots[0]).toBeNull();
    // kick unchanged: still a whole-beat hit
    expect(bd.groups).toBeUndefined();
    expect(bd.slots[0]).not.toBeNull();
  });

  it("toggleSlot growing past current division updates lane.division", () => {
    const { score } = loadBar(
      `title: T\nmeter: 4/4\n[A]\n| hh: o / o / o / o |`,
    );
    // Start with lane.division=1 on beat 1. User clicks a slot implying
    // 1/16 grid (slotIndex=2 of 4 visual slots). Must not leave a sparse
    // slots array — division must grow so renderer has ticks for every slot.
    const next = toggleSlot(score, 0, 0, "hihatClosed", 2);
    const hh = next.sections[0].bars[0].beats[0].lanes.find(
      (l) => l.instrument === "hihatClosed",
    )!;
    expect(hh.division).toBeGreaterThanOrEqual(3);
    // Original slot 0 preserved, slot 2 is new hit, slot 1 is rest.
    expect(hh.slots[0]).not.toBeNull();
    expect(hh.slots[1]).toBeNull();
    expect(hh.slots[2]).not.toBeNull();
  });

  it("splitting with count=1 merges a split lane preserving every hit", () => {
    const { score } = loadBar(
      `title: T\nmeter: 4/4\n[A]\n| hh: o , xx / x / x / x |`,
    );
    const next = splitBeatIntoGroups(score, 0, 0, "hihatClosed", 1);
    const hh = next.sections[0].bars[0].beats[0].lanes.find(
      (l) => l.instrument === "hihatClosed",
    )!;
    expect(hh.groups).toBeUndefined();
    // All three hits (o, x, x) flatten into the merged lane.
    expect(hh.slots).toHaveLength(3);
    expect(hh.slots.filter((s) => s !== null)).toHaveLength(3);
  });
});

describe("edit operations — bar-level actions", () => {
  it("insertBarAfter duplicates the selected bar", () => {
    const { score } = loadBar(
      `title: T\nmeter: 4/4\n[A]\n| bd: o / o / o / o |`,
    );
    const next = insertBarAfter(score, 0);
    expect(next.sections[0].bars).toHaveLength(2);
    const b0 = next.sections[0].bars[0];
    const b1 = next.sections[0].bars[1];
    expect(b0.beats.length).toBe(b1.beats.length);
  });

  it("deleteBar drops the selected bar", () => {
    const { score } = loadBar(
      `title: T\nmeter: 4/4\n[A]\n| bd: o / o / o / o |\n| sn: x / x / x / x |`,
    );
    const next = deleteBar(score, 0);
    expect(next.sections[0].bars).toHaveLength(1);
    const sn = next.sections[0].bars[0].beats[0].lanes.find(
      (l) => l.instrument === "snare",
    );
    expect(sn).toBeDefined();
  });

  it("setBarRepeatPrevious converts a pattern bar into a repeat, preserving its notes for restoration", () => {
    const { score } = loadBar(
      `title: T\nmeter: 4/4\n[A]\n| bd: o / o / o / o |\n| bd: o / o / o / o |`,
    );
    const originalBeats = score.sections[0].bars[1].beats;
    const next = setBarRepeatPrevious(score, 1, "dot");
    const bar = next.sections[0].bars[1];
    expect(bar.repeatPrevious).toBe(true);
    expect(bar.repeatHint).toBe("dot");
    // Beats stay intact so toggling back to Pattern restores content.
    expect(bar.beats).toEqual(originalBeats);
  });

  it("toggling Pattern → % → Pattern round-trips the bar's content", () => {
    const { score } = loadBar(
      `title: T\nmeter: 4/4\n[A]\n| bd: o / o / o / o |\n| sn: - / o / - / o |`,
    );
    const original = score.sections[0].bars[1];
    const toRepeat = setBarRepeatPrevious(score, 1, "plain");
    const backToPattern = setBarRepeatPrevious(toRepeat, 1, null);
    const restored = backToPattern.sections[0].bars[1];
    expect(restored.repeatPrevious).toBe(false);
    expect(restored.beats).toEqual(original.beats);
  });

  it("setBarRepeatPrevious(null) turns a repeat back into an empty pattern bar", () => {
    const { score } = loadBar(
      `title: T\nmeter: 4/4\n[A]\n| bd: o / o / o / o |\n| % |`,
    );
    const next = setBarRepeatPrevious(score, 1, null);
    const bar = next.sections[0].bars[1];
    expect(bar.repeatPrevious).toBe(false);
    expect(bar.repeatHint).toBeUndefined();
    expect(bar.beats.length).toBe(4);
  });

  it("setBarRepeatPrevious(null) seeds the right beat count for non-4/4 meters", () => {
    const { score } = loadBar(
      `title: T\nmeter: 3/4\n[A]\n| bd: o / o / o |\n| % |`,
    );
    const next = setBarRepeatPrevious(score, 1, null);
    expect(next.sections[0].bars[1].beats).toHaveLength(3);
  });
});

describe("clearBar", () => {
  it("strips all lanes but keeps the bar with meter-sized empty beats", () => {
    const { score } = loadBar(
      `title: T\nmeter: 4/4\n[A]\n| bd: o / o / o / o |\n| sn: - / o / - / o |`,
    );
    const next = clearBar(score, 1);
    const bar = next.sections[0].bars[1];
    expect(bar.beats).toHaveLength(4);
    for (const beat of bar.beats) expect(beat.lanes).toEqual([]);
  });

  it("clears a `%` bar back into a plain empty pattern", () => {
    const { score } = loadBar(
      `title: T\nmeter: 4/4\n[A]\n| bd: o / o / o / o |\n| % |`,
    );
    const next = clearBar(score, 1);
    const bar = next.sections[0].bars[1];
    expect(bar.repeatPrevious).toBe(false);
    expect(bar.beats).toHaveLength(4);
  });

  it("cleared bars serialize to `|  |` and parse back to an empty bar", () => {
    const { score } = loadBar(
      `title: T\nmeter: 4/4\n[A]\n| bd: o / o / o / o |\n| bd: o / o / o / o |`,
    );
    const cleared = clearBar(score, 1);
    const text = serializeScore(cleared);
    expect(text).toMatch(/\|\s+\|/);
    const reparsed = parseDrumtab(text).score;
    expect(reparsed.sections[0].bars[1].beats.every((b) => b.lanes.length === 0)).toBe(true);
  });

  it("respects meter for beat count", () => {
    const { score } = loadBar(
      `title: T\nmeter: 3/4\n[A]\n| bd: o / o / o |`,
    );
    const next = clearBar(score, 0);
    expect(next.sections[0].bars[0].beats).toHaveLength(3);
  });
});

describe("edit operations — chained mutations are immutable", () => {
  it("each operation returns a new score, original untouched", () => {
    const { score: original } = loadBar(
      `title: T\nmeter: 4/4\n[A]\n| bd: o / o / o / o |`,
    );
    const before = JSON.stringify(original);
    const next = splitBeatIntoGroups(original, 0, 0, "kick", 2);
    const after = JSON.stringify(original);
    expect(after).toBe(before); // unchanged
    // And the new score differs.
    expect(JSON.stringify(next)).not.toBe(before);
  });

  it("chained: split → set sub-div → toggle hits results in final AST", () => {
    const { score } = loadBar(
      `title: T\nmeter: 4/4\n[A]\n| bd: - / - / - / - |`,
    );
    let s = splitBeatIntoGroups(score, 0, 0, "kick", 2);
    s = setGroupDivision(s, 0, 0, "kick", 1, 3); // second half triplet
    s = toggleSlot(s, 0, 0, "kick", 0, 1); // first triplet slot
    s = toggleSlot(s, 0, 0, "kick", 2, 1); // third triplet slot
    const kick = s.sections[0].bars[0].beats[0].lanes.find(
      (l) => l.instrument === "kick",
    )!;
    expect(kick.groups).toHaveLength(2);
    const g1 = kick.groups![1];
    expect(g1.division).toBe(3);
    expect(g1.slots[0]).not.toBeNull();
    expect(g1.slots[1]).toBeNull();
    expect(g1.slots[2]).not.toBeNull();
  });
});

describe("section edits", () => {
  it("renameSection updates the label", () => {
    const { score } = loadBar(
      `title: T\nmeter: 4/4\n[A]\n| bd: o / o / o / o |`,
    );
    const next = renameSection(score, 0, "Intro");
    expect(next.sections[0].label).toBe("Intro");
  });

  it("insertSectionAfterBar splits the current section at a bar boundary", () => {
    const { score } = loadBar(
      `title: T\nmeter: 4/4\n[A]\n| bd: o / o / o / o |\n| bd: o / - / o / - |\n| bd: - / o / - / o |`,
    );
    // Split after bar 0 (global index 0) into new section "B".
    const next = insertSectionAfterBar(score, 0, "B");
    expect(next.sections).toHaveLength(2);
    expect(next.sections[0].label).toBe("A");
    expect(next.sections[0].bars).toHaveLength(1);
    expect(next.sections[1].label).toBe("B");
    expect(next.sections[1].bars).toHaveLength(2);
  });

  it("insertSectionAfterBar appends a seeded section when splitting after the last bar", () => {
    // A zero-bar section would be invisible in the preview, so we seed
    // one blank bar the user can immediately click into.
    const { score } = loadBar(
      `title: T\nmeter: 4/4\n[A]\n| bd: o / o / o / o |`,
    );
    const next = insertSectionAfterBar(score, 0, "B");
    expect(next.sections).toHaveLength(2);
    expect(next.sections[1].bars).toHaveLength(1);
    const seeded = next.sections[1].bars[0];
    expect(seeded.beats).toHaveLength(4);
    expect(seeded.beats.every((b) => b.lanes.length === 0)).toBe(true);
  });

  it("deleteSection merges bars into the previous section", () => {
    const { score } = loadBar(
      `title: T\nmeter: 4/4\n[A]\n| bd: o / o / o / o |\n[B]\n| sn: - / o / - / o |`,
    );
    expect(score.sections).toHaveLength(2);
    const next = deleteSection(score, 1);
    expect(next.sections).toHaveLength(1);
    expect(next.sections[0].bars).toHaveLength(2);
  });

  it("deleteSection is a no-op when there's only one section", () => {
    const { score } = loadBar(
      `title: T\nmeter: 4/4\n[A]\n| bd: o / o / o / o |`,
    );
    const next = deleteSection(score, 0);
    expect(next.sections).toHaveLength(1);
  });
});

describe("bar clipboard ops", () => {
  const src = `title: T
meter: 4/4
[A]
| bd: o / - / o / - |
| sn: - / o / - / o |
[B]
| bd: o / o / o / o |
| bd: - / o / - / o |`;

  it("extractBars returns a deep copy of the range", () => {
    const { score } = loadBar(src);
    const bars = extractBars(score, 1, 2);
    expect(bars).toHaveLength(2);
    // Mutating the copy doesn't touch the source.
    bars[0].repeatPrevious = true;
    const bar1 = score.sections[0].bars[1];
    expect(bar1.repeatPrevious).toBe(false);
  });

  it("extractBars works across section boundaries", () => {
    const { score } = loadBar(src);
    const bars = extractBars(score, 1, 3);
    expect(bars).toHaveLength(3);
  });

  it("deleteBars removes an inclusive range", () => {
    const { score } = loadBar(src);
    const next = deleteBars(score, 0, 1);
    // Section A used to have 2 bars, both removed.
    expect(next.sections[0].bars).toHaveLength(0);
    expect(next.sections[1].bars).toHaveLength(2);
  });

  it("pasteBarsBefore inserts deep-cloned bars ahead of the target", () => {
    const { score } = loadBar(src);
    const clip = extractBars(score, 2, 2); // one B-section bar
    const next = pasteBarsBefore(score, 0, clip);
    const flat = next.sections.flatMap((s) => s.bars);
    expect(flat).toHaveLength(5);
    // First bar is now a copy of what used to be bar 2.
    expect(JSON.stringify(flat[0].beats)).toBe(
      JSON.stringify(clip[0].beats),
    );
  });

  it("pasteBarsBefore into an empty index appends at the end", () => {
    const { score } = loadBar(src);
    const clip = extractBars(score, 0, 0);
    // globalIndex past end falls through to append-to-last-section.
    const next = pasteBarsBefore(score, 99, clip);
    expect(next.sections[1].bars).toHaveLength(3);
  });

  describe("cycleDots", () => {
    it("cycles 0 → 1 → 2 → 0 on a slot's hit and rebuilds groups", () => {
      const { score } = parseDrumtab(
        `title: T\nmeter: 4/4\n[A]\n| bd: oo / - / - / - |`,
      );
      let s = cycleDots(score, 0, 0, "kick", 0);
      let lane = s.sections[0].bars[0].beats[0].lanes[0];
      expect(lane.groups).toBeDefined();
      expect(lane.groups![0].ratio).toBeCloseTo(0.75);
      expect(lane.groups![0].slots[0]?.dots).toBe(1);

      s = cycleDots(s, 0, 0, "kick", 0);
      lane = s.sections[0].bars[0].beats[0].lanes[0];
      expect(lane.groups![0].ratio).toBeCloseTo(0.875);
      expect(lane.groups![0].slots[0]?.dots).toBe(2);

      s = cycleDots(s, 0, 0, "kick", 0);
      lane = s.sections[0].bars[0].beats[0].lanes[0];
      expect(lane.groups).toBeUndefined();
      expect(lane.slots[0]?.dots).toBeUndefined();
    });

    it("is a no-op on rests and out-of-range slots", () => {
      const { score } = parseDrumtab(
        `title: T\nmeter: 4/4\n[A]\n| bd: o- / - / - / - |`,
      );
      const s1 = cycleDots(score, 0, 0, "kick", 1); // slot is rest
      expect(s1.sections[0].bars[0].beats[0].lanes[0].slots[1]).toBeNull();
      const s2 = cycleDots(score, 0, 0, "kick", 99); // out of range
      expect(s2).toEqual(score);
    });
  });
});

describe("repeat / ending edit ops", () => {
  const baseSrc = `title: T\nmeter: 4/4\n[A]\n| bd: o / o / o / o |\n| bd: o / o / o / o |\n| bd: o / o / o / o |`;

  it("toggleBarRepeatStart flips on and off", () => {
    const { score } = parseDrumtab(baseSrc);
    const on = toggleBarRepeatStart(score, 1);
    expect(on.sections[0].bars[1].repeatStart).toBe(true);
    const off = toggleBarRepeatStart(on, 1);
    expect(off.sections[0].bars[1].repeatStart).toBeFalsy();
  });

  it("toggleBarRepeatEnd defaults times=2 and toggles off", () => {
    const { score } = parseDrumtab(baseSrc);
    const on = toggleBarRepeatEnd(score, 1);
    expect(on.sections[0].bars[1].repeatEnd).toEqual({ times: 2 });
    const off = toggleBarRepeatEnd(on, 1);
    expect(off.sections[0].bars[1].repeatEnd).toBeUndefined();
  });

  it("toggleBarRepeatEnd with custom times", () => {
    const { score } = parseDrumtab(baseSrc);
    const on = toggleBarRepeatEnd(score, 1, 4);
    expect(on.sections[0].bars[1].repeatEnd).toEqual({ times: 4 });
  });

  it("cycleBarEnding cycles undefined → '1' → '2' → undefined", () => {
    const { score } = parseDrumtab(baseSrc);
    let s = cycleBarEnding(score, 1);
    expect(s.sections[0].bars[1].ending).toBe("1");
    s = cycleBarEnding(s, 1);
    expect(s.sections[0].bars[1].ending).toBe("2");
    s = cycleBarEnding(s, 1);
    expect(s.sections[0].bars[1].ending).toBeUndefined();
  });
});

describe("clearLaneBeat", () => {
  it("removes the target instrument lane from the given beat only", () => {
    const src = `title: T\nmeter: 4/4\n[A]\n| bd: o / o / o / o  sn: o / o / o / o |`;
    const { score } = parseDrumtab(src);
    const next = clearLaneBeat(score, 0, 1, "kick"); // clear kick in beat 1
    const beat1 = next.sections[0].bars[0].beats[1];
    expect(beat1.lanes.find((l) => l.instrument === "kick")).toBeUndefined();
    // snare in same beat still there
    expect(beat1.lanes.find((l) => l.instrument === "snare")).toBeDefined();
    // kick in other beats untouched
    expect(
      next.sections[0].bars[0].beats[0].lanes.find(
        (l) => l.instrument === "kick",
      ),
    ).toBeDefined();
  });

  it("is a no-op on missing bar / beat", () => {
    const { score } = parseDrumtab(
      `title: T\nmeter: 4/4\n[A]\n| bd: o / o / o / o |`,
    );
    expect(clearLaneBeat(score, 99, 0, "kick")).toEqual(score);
    expect(clearLaneBeat(score, 0, 99, "kick")).toEqual(score);
  });
});

describe("edit ops on dot-expanded lanes", () => {
  it("toggleSlot on dot-expanded lane addresses slots flatly across groups", () => {
    const src = `title: T\nmeter: 4/4\n[A]\n| bd: o.- / - / - / - |`;
    const { score } = parseDrumtab(src);
    // dot-expanded: groups are [ratio 0.75 + 1 slot, ratio 0.25 + 1 slot].
    // toggleSlot with flat slotIndex=1 should toggle the 2nd group's slot.
    const next = toggleSlot(score, 0, 0, "kick", 1);
    const lane = next.sections[0].bars[0].beats[0].lanes.find(
      (l) => l.instrument === "kick",
    )!;
    expect(lane.groups![1].slots[0]).not.toBeNull();
  });

  it("toggleArticulation on a dot-expanded slot finds the right hit", () => {
    const src = `title: T\nmeter: 4/4\n[A]\n| bd: o.o / - / - / - |`;
    const { score } = parseDrumtab(src);
    // slot 1 is the 16th hit; accent it.
    const next = toggleArticulation(score, 0, 0, "kick", 1, "accent");
    const lane = next.sections[0].bars[0].beats[0].lanes[0];
    expect(lane.groups![1].slots[0]?.articulations).toContain("accent");
  });
});

describe("findOrCreateLane path", () => {
  it("toggleSlot on an instrument not yet in the beat creates a new lane", () => {
    // Start with only kick in the bar.
    const { score } = parseDrumtab(
      `title: T\nmeter: 4/4\n[A]\n| bd: o / o / o / o |`,
    );
    // Add a snare hit at beat 0 slot 0.
    const next = toggleSlot(score, 0, 0, "snare", 0);
    const snareLane = next.sections[0].bars[0].beats[0].lanes.find(
      (l) => l.instrument === "snare",
    );
    expect(snareLane).toBeDefined();
    expect(snareLane!.slots[0]).not.toBeNull();
  });
});

describe("toggleSlot grows a split-group's division when needed", () => {
  it("writing past a group's current division pads it with nulls", () => {
    // Start with a 2-slot group; toggle slot 5 → group must grow to 6.
    const { score } = parseDrumtab(
      `title: T\nmeter: 4/4\n[A]\n| bd: oo , -- / - / - / - |`,
    );
    const next = toggleSlot(score, 0, 0, "kick", 5, 1);
    const g = next.sections[0].bars[0].beats[0].lanes[0].groups![1];
    expect(g.slots.length).toBe(6);
    expect(g.slots[5]).not.toBeNull();
  });

  it("toggle-off on a single hit slot turns into a null", () => {
    const { score } = parseDrumtab(
      `title: T\nmeter: 4/4\n[A]\n| bd: o / - / - / - |`,
    );
    const s = toggleSlot(score, 0, 0, "kick", 0);
    expect(
      s.sections[0].bars[0].beats[0].lanes[0].slots[0],
    ).toBeNull();
  });
});

describe("toggleArticulation toggles on and off", () => {
  it("adds the articulation when absent, removes when present", () => {
    const { score } = parseDrumtab(
      `title: T\nmeter: 4/4\n[A]\n| sn: o / - / - / - |`,
    );
    const addAccent = toggleArticulation(score, 0, 0, "snare", 0, "accent");
    expect(
      addAccent.sections[0].bars[0].beats[0].lanes[0].slots[0]!.articulations,
    ).toContain("accent");
    const removeAccent = toggleArticulation(
      addAccent,
      0,
      0,
      "snare",
      0,
      "accent",
    );
    expect(
      removeAccent.sections[0].bars[0].beats[0].lanes[0].slots[0]!.articulations,
    ).not.toContain("accent");
  });
});

describe("setSticking", () => {
  it("sets R/L on a flat-lane hit", () => {
    const { score } = parseDrumtab(
      `title: T\nmeter: 4/4\n[A]\n| sn: o / o / o / o |`,
    );
    const s = setSticking(score, 0, 0, "snare", 0, "R");
    const hit = s.sections[0].bars[0].beats[0].lanes[0].slots[0];
    expect(hit?.sticking).toBe("R");
  });

  it("setSticking(null) clears", () => {
    const { score } = parseDrumtab(
      `title: T\nmeter: 4/4\n[A]\n| sn: o/R / o / o / o |`,
    );
    const s = setSticking(score, 0, 0, "snare", 0, null);
    const hit = s.sections[0].bars[0].beats[0].lanes[0].slots[0];
    expect(hit?.sticking).toBeUndefined();
  });

  it("is a no-op on a rest slot", () => {
    const { score } = parseDrumtab(
      `title: T\nmeter: 4/4\n[A]\n| sn: - / o / o / o |`,
    );
    const s = setSticking(score, 0, 0, "snare", 0, "R");
    expect(s.sections[0].bars[0].beats[0].lanes[0].slots[0]).toBeNull();
  });

  it("is a no-op on missing lane", () => {
    const { score } = parseDrumtab(
      `title: T\nmeter: 4/4\n[A]\n| bd: o / o / o / o |`,
    );
    const s = setSticking(score, 0, 0, "snare", 0, "R");
    expect(s).toEqual(score);
  });

  it("sets sticking on a split-lane slot via groupIndex", () => {
    const { score } = parseDrumtab(
      `title: T\nmeter: 4/4\n[A]\n| sn: oo , oo / - / - / - |`,
    );
    const s = setSticking(score, 0, 0, "snare", 1, "L", 1);
    const lane = s.sections[0].bars[0].beats[0].lanes[0];
    expect(lane.groups![1].slots[1]?.sticking).toBe("L");
  });
});

describe("pasteBarsAtSectionEnd", () => {
  it("appends to the target bar's section", () => {
    const { score } = parseDrumtab(
      `title: T\nmeter: 4/4\n[A]\n| bd: o / o / o / o |\n[B]\n| sn: o / o / o / o |`,
    );
    const clip = extractBars(score, 0, 0); // one bar from A
    // Point the globalIndex at a bar in section B; clip should get
    // appended to section B, not A.
    const next = pasteBarsAtSectionEnd(score, 1, clip);
    expect(next.sections[1].bars).toHaveLength(2);
    expect(next.sections[0].bars).toHaveLength(1);
  });

  it("falls back to the last section when the index is out of range", () => {
    const { score } = parseDrumtab(
      `title: T\nmeter: 4/4\n[A]\n| bd: o / o / o / o |\n[B]\n| sn: o / o / o / o |`,
    );
    const clip = extractBars(score, 0, 0);
    const next = pasteBarsAtSectionEnd(score, 99, clip);
    expect(next.sections[1].bars).toHaveLength(2);
  });

  it("is a no-op for empty clipboard", () => {
    const { score } = parseDrumtab(
      `title: T\nmeter: 4/4\n[A]\n| bd: o / o / o / o |`,
    );
    const next = pasteBarsAtSectionEnd(score, 0, []);
    expect(next).toEqual(score);
  });
});
