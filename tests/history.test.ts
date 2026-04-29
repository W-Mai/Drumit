import { describe, expect, it } from "vitest";
import {
  historyRecord,
  historyRedo,
  historyUndo,
  type HistoryEntry,
} from "../src/lib/useHistory";

describe("historyRecord", () => {
  it("seeds an initial entry when given undefined", () => {
    const next = historyRecord(undefined, "a");
    expect(next).toEqual({ stack: ["a"], index: 0 });
  });

  it("appends a new snapshot and moves the cursor to the tip", () => {
    let entry: HistoryEntry | undefined;
    entry = historyRecord(entry, "a");
    entry = historyRecord(entry, "b");
    entry = historyRecord(entry, "c");
    expect(entry).toEqual({ stack: ["a", "b", "c"], index: 2 });
  });

  it("is a no-op when the snapshot equals the current one", () => {
    let entry: HistoryEntry | undefined;
    entry = historyRecord(entry, "a");
    const before = entry;
    entry = historyRecord(entry, "a");
    expect(entry).toBe(before);
  });

  it("truncates forward history after an undo+record sequence", () => {
    let entry: HistoryEntry | undefined;
    entry = historyRecord(entry, "a");
    entry = historyRecord(entry, "b");
    entry = historyRecord(entry, "c"); // stack [a,b,c], index 2
    const undone = historyUndo(entry);
    expect(undone).not.toBeNull();
    entry = undone!.entry; // index 1 (at "b"), stack still [a,b,c]
    entry = historyRecord(entry, "d"); // should drop "c", push "d"
    expect(entry).toEqual({ stack: ["a", "b", "d"], index: 2 });
  });

  it("enforces maxDepth by dropping oldest entries", () => {
    let entry: HistoryEntry | undefined;
    for (const s of ["a", "b", "c", "d", "e"]) {
      entry = historyRecord(entry, s, 3);
    }
    // Only last 3 kept, cursor at tip.
    expect(entry).toEqual({ stack: ["c", "d", "e"], index: 2 });
  });
});

describe("historyUndo", () => {
  it("returns null when no entry exists", () => {
    expect(historyUndo(undefined)).toBeNull();
  });

  it("returns null when already at the start", () => {
    const entry = historyRecord(undefined, "a");
    expect(historyUndo(entry)).toBeNull();
  });

  it("steps back by one and returns the target snapshot", () => {
    let entry: HistoryEntry | undefined;
    entry = historyRecord(entry, "a");
    entry = historyRecord(entry, "b");
    const stepped = historyUndo(entry);
    expect(stepped).not.toBeNull();
    expect(stepped!.snapshot).toBe("a");
    expect(stepped!.entry).toEqual({ stack: ["a", "b"], index: 0 });
  });
});

describe("historyRedo", () => {
  it("returns null when already at the tip", () => {
    let entry: HistoryEntry | undefined;
    entry = historyRecord(entry, "a");
    entry = historyRecord(entry, "b");
    expect(historyRedo(entry)).toBeNull();
  });

  it("steps forward by one after an undo", () => {
    let entry: HistoryEntry | undefined;
    entry = historyRecord(entry, "a");
    entry = historyRecord(entry, "b");
    entry = historyRecord(entry, "c");
    const undone = historyUndo(entry)!;
    const redone = historyRedo(undone.entry);
    expect(redone).not.toBeNull();
    expect(redone!.snapshot).toBe("c");
    expect(redone!.entry.index).toBe(2);
  });

  it("returns null after a new record truncates forward history", () => {
    let entry: HistoryEntry | undefined;
    entry = historyRecord(entry, "a");
    entry = historyRecord(entry, "b");
    const undone = historyUndo(entry)!;
    entry = historyRecord(undone.entry, "c"); // truncate, now tip is c
    expect(historyRedo(entry)).toBeNull();
  });
});
