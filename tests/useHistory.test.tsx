// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useHistory } from "../src/lib/useHistory";

beforeEach(() => {
  // nothing to mock
});

describe("useHistory hook", () => {
  it("starts with empty store (canUndo / canRedo both false)", () => {
    const { result } = renderHook(() => useHistory());
    expect(result.current.canUndo("k1")).toBe(false);
    expect(result.current.canRedo("k1")).toBe(false);
  });

  it("record seeds the stack and keeps canUndo false until a second record", () => {
    const { result } = renderHook(() => useHistory());
    act(() => {
      result.current.record("k", "a");
    });
    expect(result.current.canUndo("k")).toBe(false);
    act(() => {
      result.current.record("k", "b");
    });
    expect(result.current.canUndo("k")).toBe(true);
  });

  it("undo / redo step through the stack", () => {
    const { result } = renderHook(() => useHistory());
    act(() => {
      result.current.record("k", "a");
      result.current.record("k", "b");
      result.current.record("k", "c");
    });
    let u: string | null = null;
    act(() => {
      u = result.current.undo("k");
    });
    expect(u).toBe("b");
    act(() => {
      u = result.current.undo("k");
    });
    expect(u).toBe("a");
    expect(result.current.canUndo("k")).toBe(false);
    let r: string | null = null;
    act(() => {
      r = result.current.redo("k");
    });
    expect(r).toBe("b");
  });

  it("undo returns null when there's no history for a key", () => {
    const { result } = renderHook(() => useHistory());
    expect(result.current.undo("missing")).toBeNull();
  });

  it("redo returns null at tip of stack", () => {
    const { result } = renderHook(() => useHistory());
    act(() => {
      result.current.record("k", "a");
      result.current.record("k", "b");
    });
    expect(result.current.redo("k")).toBeNull();
  });

  it("record of the same snapshot is a no-op", () => {
    const { result } = renderHook(() => useHistory());
    act(() => {
      result.current.record("k", "a");
      result.current.record("k", "a");
      result.current.record("k", "a");
    });
    // Still at the single seed — no undo available.
    expect(result.current.canUndo("k")).toBe(false);
  });

  it("reset drops a specific key's history", () => {
    const { result } = renderHook(() => useHistory());
    act(() => {
      result.current.record("k", "a");
      result.current.record("k", "b");
    });
    expect(result.current.canUndo("k")).toBe(true);
    act(() => {
      result.current.reset("k");
    });
    expect(result.current.canUndo("k")).toBe(false);
  });

  it("keys are independent", () => {
    const { result } = renderHook(() => useHistory());
    act(() => {
      result.current.record("a", "1");
      result.current.record("a", "2");
      result.current.record("b", "X");
    });
    expect(result.current.canUndo("a")).toBe(true);
    expect(result.current.canUndo("b")).toBe(false);
    act(() => {
      result.current.undo("a");
    });
    expect(result.current.canUndo("a")).toBe(false);
    // Key `b` still has its single entry.
    expect(result.current.canUndo("b")).toBe(false);
  });

  it("record after undo truncates forward history", () => {
    const { result } = renderHook(() => useHistory());
    act(() => {
      result.current.record("k", "a");
      result.current.record("k", "b");
      result.current.record("k", "c");
      result.current.undo("k"); // back to b
      result.current.undo("k"); // back to a
      result.current.record("k", "d"); // truncate c
    });
    expect(result.current.redo("k")).toBeNull();
  });

  it("respects maxDepth by dropping oldest", () => {
    const { result } = renderHook(() => useHistory(3));
    act(() => {
      result.current.record("k", "a");
      result.current.record("k", "b");
      result.current.record("k", "c");
      result.current.record("k", "d"); // pushes a off the stack
    });
    // Undo twice from "d" gets us to "b"; third undo is blocked.
    let u: string | null = null;
    act(() => {
      u = result.current.undo("k");
    });
    expect(u).toBe("c");
    act(() => {
      u = result.current.undo("k");
    });
    expect(u).toBe("b");
    act(() => {
      u = result.current.undo("k");
    });
    expect(u).toBeNull();
  });
});
