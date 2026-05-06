// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useHotkeys } from "../src/lib/useHotkeys";

function dispatchKey(
  key: string,
  options: KeyboardEventInit = {},
  target: HTMLElement = document.body,
) {
  const ev = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    ...options,
  });
  target.dispatchEvent(ev);
  return ev;
}

describe("useHotkeys matching for ,/|/+ punctuation keys", () => {
  it("fires on ',' without any modifier", () => {
    const handler = vi.fn();
    renderHook(() =>
      useHotkeys([{ key: ",", handler }]),
    );
    dispatchKey(",");
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("fires on '|' which always carries shift", () => {
    const handler = vi.fn();
    renderHook(() =>
      useHotkeys([{ key: "|", shift: true, handler }]),
    );
    // '|' is shift+\ on a US keyboard — keyboards always report shiftKey=true.
    dispatchKey("|", { shiftKey: true });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("does NOT fire on '|' if shift flag is missing on the registration", () => {
    // Regression: this is the bug that hid '|'. The handler must declare
    // shift: true because '|' inherently arrives with shiftKey=true.
    const handler = vi.fn();
    renderHook(() =>
      useHotkeys([{ key: "|", handler }]),
    );
    dispatchKey("|", { shiftKey: true });
    expect(handler).not.toHaveBeenCalled();
  });

  it("fires on '+' when registered with shift: true", () => {
    const handler = vi.fn();
    renderHook(() =>
      useHotkeys([{ key: "+", shift: true, handler }]),
    );
    dispatchKey("+", { shiftKey: true });
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
