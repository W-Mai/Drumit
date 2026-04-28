import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearStoredSource,
  loadStoredSource,
  saveStoredSource,
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
      "drumit:score",
      JSON.stringify({ version: 999, source: "x", savedAt: 0 }),
    );
    expect(loadStoredSource()).toBeNull();
  });
});
