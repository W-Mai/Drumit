import { useCallback, useRef, useState } from "react";

export type FlashColor = "amber" | "emerald";

export function useFlashBars(durationMs = 600) {
  const [flashes, setFlashes] = useState<Map<number, FlashColor>>(new Map());
  const timers = useRef<Map<number, number>>(new Map());

  const flash = useCallback(
    (barIndices: number[], color: FlashColor) => {
      setFlashes((prev) => {
        const next = new Map(prev);
        for (const i of barIndices) next.set(i, color);
        return next;
      });
      for (const i of barIndices) {
        const existing = timers.current.get(i);
        if (existing !== undefined) window.clearTimeout(existing);
        const t = window.setTimeout(() => {
          setFlashes((prev) => {
            const next = new Map(prev);
            next.delete(i);
            return next;
          });
          timers.current.delete(i);
        }, durationMs);
        timers.current.set(i, t);
      }
    },
    [durationMs],
  );

  return { flashes, flash };
}
