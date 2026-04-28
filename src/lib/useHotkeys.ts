import { useEffect } from "react";

export interface Hotkey {
  /** `e.key` value — e.g. " " for Space, "ArrowLeft", "l". */
  key: string;
  /** Modifier flags (optional). */
  meta?: boolean;
  shift?: boolean;
  alt?: boolean;
  ctrl?: boolean;
  /** Description for discoverability. */
  description?: string;
  handler: (e: KeyboardEvent) => void;
}

/**
 * Register a list of hotkeys on the document. Skips when the event target
 * is an editable element (input / textarea / contenteditable) so typing
 * doesn't trigger hotkeys.
 */
export function useHotkeys(hotkeys: Hotkey[], enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && isEditable(target)) return;
      for (const hk of hotkeys) {
        if (e.key !== hk.key) continue;
        if (!!hk.meta !== e.metaKey) continue;
        if (!!hk.shift !== e.shiftKey) continue;
        if (!!hk.alt !== e.altKey) continue;
        if (!!hk.ctrl !== e.ctrlKey) continue;
        e.preventDefault();
        hk.handler(e);
        break;
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [hotkeys, enabled]);
}

function isEditable(el: HTMLElement): boolean {
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}
