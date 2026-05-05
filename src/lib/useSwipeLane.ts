import { useCallback, useEffect, useRef } from "react";

interface Options {
  onPrev: () => void;
  onNext: () => void;
  /** Horizontal travel required to trigger. Default 60px. */
  threshold?: number;
  /** Vertical slop tolerated before we bail (treat as scroll). 40px. */
  verticalCancel?: number;
}

/**
 * Attach-to-element swipe recogniser for the lane pager. Primary button
 * pointer-down starts tracking; a horizontal move past `threshold`
 * without exceeding `verticalCancel` vertically triggers the matching
 * callback. The hook deliberately ignores multi-touch, mouse wheel
 * clicks, and any gesture on an interactive child (buttons handle
 * their own onClick).
 */
export function useSwipeLane({
  onPrev,
  onNext,
  threshold = 60,
  verticalCancel = 40,
}: Options) {
  const nodeRef = useRef<HTMLElement | null>(null);
  const startRef = useRef<{ x: number; y: number; id: number } | null>(null);

  // Keep latest callbacks in a ref so the listeners stay stable
  // across re-renders without needing to reattach.
  const cbRef = useRef({ onPrev, onNext });
  useEffect(() => {
    cbRef.current = { onPrev, onNext };
  }, [onPrev, onNext]);

  useEffect(() => {
    const node = nodeRef.current;
    if (!node) return;

    const onPointerDown = (e: PointerEvent) => {
      // Skip if the press started on an interactive child — don't hijack
      // clicks on the chevrons / dot buttons.
      const target = e.target as HTMLElement | null;
      if (target?.closest("button,a,input,select,textarea")) return;
      if (e.button !== 0) return;
      startRef.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
    };

    const onPointerMove = (e: PointerEvent) => {
      const start = startRef.current;
      if (!start || start.id !== e.pointerId) return;
      const dy = Math.abs(e.clientY - start.y);
      if (dy > verticalCancel) {
        // User is scrolling vertically — bail out so we don't then
        // fire a swipe when they let go far to the side.
        startRef.current = null;
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      const start = startRef.current;
      if (!start || start.id !== e.pointerId) return;
      startRef.current = null;
      const dx = e.clientX - start.x;
      const dy = Math.abs(e.clientY - start.y);
      if (dy > verticalCancel) return;
      if (dx >= threshold) cbRef.current.onPrev();
      else if (dx <= -threshold) cbRef.current.onNext();
    };

    const onPointerCancel = () => {
      startRef.current = null;
    };

    node.addEventListener("pointerdown", onPointerDown);
    node.addEventListener("pointermove", onPointerMove);
    node.addEventListener("pointerup", onPointerUp);
    node.addEventListener("pointercancel", onPointerCancel);
    return () => {
      node.removeEventListener("pointerdown", onPointerDown);
      node.removeEventListener("pointermove", onPointerMove);
      node.removeEventListener("pointerup", onPointerUp);
      node.removeEventListener("pointercancel", onPointerCancel);
    };
  }, [threshold, verticalCancel]);

  return useCallback((el: HTMLDivElement | null) => {
    nodeRef.current = el;
  }, []);
}
