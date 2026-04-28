import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearStoredSource,
  clearWorkspace,
  loadStoredSource,
  loadWorkspace,
  saveStoredSource,
  saveWorkspace,
} from "../src/lib/storage";

// Minimal in-memory localStorage polyfill for the test environment.
class MemStorage implements Storage {
  private store = new Map<string, string>();
  get length(): number {
    return this.store.size;
  }
  clear(): void {
    this.store.clear();
  }
  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }
  key(index: number): string | null {
    return [...this.store.keys()][index] ?? null;
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

describe("storage", () => {
  beforeEach(() => {
    (globalThis as unknown as { localStorage: Storage }).localStorage =
      new MemStorage();
  });
  afterEach(() => {
    (globalThis as unknown as { localStorage: Storage | undefined })
      .localStorage = undefined;
  });

  it("returns null when nothing has been saved", () => {
    expect(loadStoredSource()).toBeNull();
  });

  it("round-trips a drumtab source", () => {
    saveStoredSource("title: X\nmeter: 4/4\n[A]\n| bd: o / o / o / o |");
    const got = loadStoredSource();
    expect(got).toBe("title: X\nmeter: 4/4\n[A]\n| bd: o / o / o / o |");
  });

  it("clear removes the entry", () => {
    saveStoredSource("x");
    clearStoredSource();
    expect(loadStoredSource()).toBeNull();
  });

  it("ignores corrupt data and returns null", () => {
    localStorage.setItem("drumit:score", "{not json");
    expect(loadStoredSource()).toBeNull();
  });

  it("ignores entries with a different version", () => {
    localStorage.setItem(
      "drumit:workspace",
      JSON.stringify({ version: 999, documents: [], activeId: null }),
    );
    expect(loadWorkspace()).toBeNull();
  });
});

describe("workspace", () => {
  beforeEach(() => {
    (globalThis as unknown as { localStorage: Storage }).localStorage =
      new MemStorage();
  });
  afterEach(() => {
    (globalThis as unknown as { localStorage: Storage | undefined })
      .localStorage = undefined;
  });

  it("migrates a v1 single-doc blob into a workspace", () => {
    localStorage.setItem(
      "drumit:score",
      JSON.stringify({ version: 1, source: "title: Old", savedAt: 123 }),
    );
    const ws = loadWorkspace();
    expect(ws).not.toBeNull();
    expect(ws!.documents).toHaveLength(1);
    expect(ws!.documents[0].source).toBe("title: Old");
    // Legacy key should be removed after migration.
    expect(localStorage.getItem("drumit:score")).toBeNull();
    // Next call reads the migrated workspace.
    expect(loadWorkspace()).not.toBeNull();
  });

  it("saveWorkspace + loadWorkspace round trip", () => {
    saveWorkspace({
      version: 2,
      documents: [
        { id: "a", name: "First", source: "x", savedAt: 1 },
        { id: "b", name: "Second", source: "y", savedAt: 2 },
      ],
      activeId: "b",
    });
    const ws = loadWorkspace();
    expect(ws?.documents).toHaveLength(2);
    expect(ws?.activeId).toBe("b");
  });

  it("clearWorkspace wipes both keys", () => {
    saveWorkspace({
      version: 2,
      documents: [{ id: "a", name: "", source: "x", savedAt: 1 }],
      activeId: "a",
    });
    localStorage.setItem(
      "drumit:score",
      JSON.stringify({ version: 1, source: "legacy", savedAt: 1 }),
    );
    clearWorkspace();
    expect(loadWorkspace()).toBeNull();
    expect(localStorage.getItem("drumit:score")).toBeNull();
  });
});
