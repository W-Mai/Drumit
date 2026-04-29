// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import {
  useMediaQuery,
  useIsTouchDevice,
  useIsDesktop,
} from "../src/lib/useMediaQuery";

interface MockMediaQueryList {
  matches: boolean;
  media: string;
  onchange: null;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
  dispatchEvent: ReturnType<typeof vi.fn>;
}

function installMatchMedia(
  resolve: (query: string) => { matches: boolean },
): Map<string, MockMediaQueryList> {
  const registry = new Map<string, MockMediaQueryList>();
  window.matchMedia = vi.fn((query: string) => {
    // useSyncExternalStore calls matchMedia(query) multiple times per
    // render (subscribe + getSnapshot). A single stable MediaQueryList
    // per query string models the real browser behaviour and keeps
    // listener registrations live across those calls.
    const existing = registry.get(query);
    if (existing) return existing as unknown as MediaQueryList;
    const mql: MockMediaQueryList = {
      matches: resolve(query).matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    };
    registry.set(query, mql);
    return mql as unknown as MediaQueryList;
  }) as unknown as typeof window.matchMedia;
  return registry;
}

function fireChange(mql: MockMediaQueryList, matches: boolean) {
  mql.matches = matches;
  const listener = mql.addEventListener.mock.calls.find(
    ([type]) => type === "change",
  )?.[1] as ((e: MediaQueryListEvent) => void) | undefined;
  if (!listener) throw new Error("no change listener registered");
  listener({ matches, media: mql.media } as MediaQueryListEvent);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useMediaQuery", () => {
  it("returns the initial match result from window.matchMedia", () => {
    installMatchMedia(() => ({ matches: true }));
    const { result } = renderHook(() => useMediaQuery("(min-width: 1024px)"));
    expect(result.current).toBe(true);
  });

  it("updates when the media query fires a change event", () => {
    const registry = installMatchMedia(() => ({ matches: false }));
    const { result } = renderHook(() => useMediaQuery("(min-width: 640px)"));
    expect(result.current).toBe(false);

    const mql = registry.get("(min-width: 640px)")!;
    act(() => fireChange(mql, true));
    expect(result.current).toBe(true);

    act(() => fireChange(mql, false));
    expect(result.current).toBe(false);
  });

  it("removes its change listener on unmount", () => {
    const registry = installMatchMedia(() => ({ matches: false }));
    const { unmount } = renderHook(() => useMediaQuery("(pointer: coarse)"));
    const mql = registry.get("(pointer: coarse)")!;
    expect(mql.removeEventListener).not.toHaveBeenCalled();
    unmount();
    expect(mql.removeEventListener).toHaveBeenCalledWith(
      "change",
      expect.any(Function),
    );
  });

  it("re-subscribes when the query argument changes", () => {
    const registry = installMatchMedia((q) => ({
      matches: q === "(min-width: 1024px)",
    }));
    const { result, rerender } = renderHook(
      ({ q }) => useMediaQuery(q),
      { initialProps: { q: "(min-width: 640px)" } },
    );
    expect(result.current).toBe(false);

    rerender({ q: "(min-width: 1024px)" });
    expect(result.current).toBe(true);

    const mql640 = registry.get("(min-width: 640px)")!;
    expect(mql640.removeEventListener).toHaveBeenCalled();
  });
});

describe("useIsTouchDevice", () => {
  it("queries (pointer: coarse)", () => {
    const registry = installMatchMedia(() => ({ matches: true }));
    const { result } = renderHook(() => useIsTouchDevice());
    expect(result.current).toBe(true);
    expect(registry.has("(pointer: coarse)")).toBe(true);
  });
});

describe("useIsDesktop", () => {
  it("queries (min-width: 1024px)", () => {
    const registry = installMatchMedia(() => ({ matches: false }));
    const { result } = renderHook(() => useIsDesktop());
    expect(result.current).toBe(false);
    expect(registry.has("(min-width: 1024px)")).toBe(true);
  });
});
