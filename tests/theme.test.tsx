// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "../src/theme/ThemeProvider";
import { useTheme } from "../src/theme/useTheme";

function wrapper({ children }: { children: React.ReactNode }) {
  return <ThemeProvider>{children}</ThemeProvider>;
}

function mockMatchMedia(prefersDark: boolean) {
  const listeners = new Set<(e: MediaQueryListEvent) => void>();
  const mql = {
    matches: prefersDark,
    media: "(prefers-color-scheme: dark)",
    addEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) =>
      listeners.add(cb),
    removeEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) =>
      listeners.delete(cb),
    addListener: () => {},
    removeListener: () => {},
    onchange: null,
    dispatchEvent: () => true,
  } as unknown as MediaQueryList;
  window.matchMedia = vi.fn().mockReturnValue(mql);
  return { mql, fire: (matches: boolean) => {
    (mql as unknown as { matches: boolean }).matches = matches;
    listeners.forEach((cb) =>
      cb({ matches } as unknown as MediaQueryListEvent),
    );
  }};
}

describe("theme", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });
  afterEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  it("defaults to auto and resolves via matchMedia", () => {
    mockMatchMedia(false);
    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.pref).toBe("auto");
    expect(result.current.resolved).toBe("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("auto resolves to dark when OS prefers dark", () => {
    mockMatchMedia(true);
    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.resolved).toBe("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("setPref persists and applies", () => {
    mockMatchMedia(false);
    const { result } = renderHook(() => useTheme(), { wrapper });
    act(() => result.current.setPref("sepia"));
    expect(result.current.pref).toBe("sepia");
    expect(result.current.resolved).toBe("sepia");
    expect(window.localStorage.getItem("drumit.theme")).toBe("sepia");
    expect(document.documentElement.getAttribute("data-theme")).toBe("sepia");
  });

  it("reads persisted value", () => {
    window.localStorage.setItem("drumit.theme", "dark");
    mockMatchMedia(false);
    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.pref).toBe("dark");
    expect(result.current.resolved).toBe("dark");
  });

  it("auto follows live OS changes", () => {
    const mm = mockMatchMedia(false);
    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.resolved).toBe("light");
    act(() => mm.fire(true));
    expect(result.current.resolved).toBe("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("manual pref ignores OS changes", () => {
    const mm = mockMatchMedia(false);
    const { result } = renderHook(() => useTheme(), { wrapper });
    act(() => result.current.setPref("light"));
    act(() => mm.fire(true));
    expect(result.current.resolved).toBe("light");
  });
});
