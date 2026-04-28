import { describe, expect, it } from "vitest";
import { parseDrumtab } from "../src/notation/parser";
import {
  deleteBar,
  insertBarAfter,
  setBarRepeatPrevious,
  setLaneDivision,
  setGroupDivision,
  splitBeatIntoGroups,
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

  it("splitting with count=1 merges a split lane back to a single group", () => {
    const { score } = loadBar(
      `title: T\nmeter: 4/4\n[A]\n| hh: o , xx / x / x / x |`,
    );
    const next = splitBeatIntoGroups(score, 0, 0, "hihatClosed", 1);
    const hh = next.sections[0].bars[0].beats[0].lanes.find(
      (l) => l.instrument === "hihatClosed",
    )!;
    expect(hh.groups).toBeUndefined();
    // first group's slot (single hit) survives as the merged content
    expect(hh.slots).toHaveLength(1);
    expect(hh.slots[0]).not.toBeNull();
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

  it("setBarRepeatPrevious converts a pattern bar into a repeat", () => {
    const { score } = loadBar(
      `title: T\nmeter: 4/4\n[A]\n| bd: o / o / o / o |\n| bd: o / o / o / o |`,
    );
    const next = setBarRepeatPrevious(score, 1, "dot");
    expect(next.sections[0].bars[1].repeatPrevious).toBe(true);
    expect(next.sections[0].bars[1].repeatHint).toBe("dot");
    expect(next.sections[0].bars[1].beats).toHaveLength(0);
  });

  it("setBarRepeatPrevious(null) turns a repeat back into an empty pattern bar", () => {
    const { score } = loadBar(
      `title: T\nmeter: 4/4\n[A]\n| bd: o / o / o / o |\n| % |`,
    );
    const next = setBarRepeatPrevious(score, 1, null);
    const bar = next.sections[0].bars[1];
    expect(bar.repeatPrevious).toBe(false);
    expect(bar.repeatHint).toBeUndefined();
    expect(bar.beats.length).toBeGreaterThan(0);
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
