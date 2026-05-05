import { useEffect } from "react";

// Tracks the element the pointer is currently over, globally. Hotkey
// scope resolution uses this in addition to keydown's e.target, so the
// active panel can be picked just by hovering — no click / focus
// needed.
let hoverTarget: Element | null = null;
if (typeof document !== "undefined") {
  document.addEventListener(
    "pointermove",
    (e) => {
      hoverTarget = e.target as Element | null;
    },
    { passive: true, capture: true },
  );
  // Only clear when the pointer leaves the page entirely. A
  // per-element pointerleave would fire as the mouse crosses between
  // siblings during re-renders (capture phase sees every child's
  // leave), yanking the hover scope mid-typing.
  window.addEventListener("blur", () => {
    hoverTarget = null;
  });
}

export interface Hotkey {
  /** `e.key` value — e.g. " " for Space, "ArrowLeft", "l". Omit to match by `code` only. */
  key?: string;
  /** `e.code` value — e.g. "Digit2" (useful with shift: true). */
  code?: string;
  /** Modifier flags (optional). */
  meta?: boolean;
  shift?: boolean;
  alt?: boolean;
  ctrl?: boolean;
  /** Description for discoverability. */
  description?: string;
  /**
   * Optional DOM scope: only fire when `e.target` lies inside an element
   * with `data-drumit-scope="<scope>"`. Leave empty to match any target
   * (the legacy document-wide behaviour).
   */
  scope?: string;
  handler: (e: KeyboardEvent) => void;
}

/**
 * Register a list of hotkeys on the document. Skips when the event target
 * is an editable element (input / textarea / contenteditable) so typing
 * doesn't trigger hotkeys.
 *
 * Hotkeys can opt into a scope via `scope: "preview" | "editor" | ...`;
 * see `Hotkey.scope` for semantics.
 */
export function useHotkeys(hotkeys: Hotkey[], enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && isEditable(target)) return;
      // Scope resolution: pointer position wins, keydown target is a
      // fallback. Lets 'which panel is hot' match where the mouse is,
      // without demanding a click/focus beforehand. If the hover node
      // got unmounted (common during React re-renders mid-keystroke),
      // fall through to e.target so the hotkey still dispatches.
      const hoverAlive =
        hoverTarget && hoverTarget.isConnected ? hoverTarget : null;
      const scopeTarget = (hoverAlive as HTMLElement | null) ?? target;
      for (const hk of hotkeys) {
        if (hk.key !== undefined && e.key !== hk.key) continue;
        if (hk.code !== undefined && e.code !== hk.code) continue;
        if (hk.key === undefined && hk.code === undefined) continue;
        if (!!hk.meta !== e.metaKey) continue;
        if (!!hk.shift !== e.shiftKey) continue;
        if (!!hk.alt !== e.altKey) continue;
        if (!!hk.ctrl !== e.ctrlKey) continue;
        if (hk.scope && !isWithinScope(scopeTarget, hk.scope)) continue;
        e.preventDefault();
        hk.handler(e);
        break;
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [hotkeys, enabled]);
}

function isWithinScope(
  target: HTMLElement | null,
  scope: string,
): boolean {
  if (!target) return false;
  return target.closest(`[data-drumit-scope="${scope}"]`) !== null;
}

function isEditable(el: HTMLElement): boolean {
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}
