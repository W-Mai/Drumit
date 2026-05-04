import { cn } from "../lib/utils";

interface Props {
  beats: number;
  beatIndex: number;
  /** 0..1 within the current beat — used to fade the current pill in. */
  beatProgress: number;
  active: boolean;
  playing: boolean;
  /** Count-in phase: strip ticks through its lead-in beats, but the
   *  rest of the UI stays idle. Visually tints each pill a different
   *  color so the user knows they're in pickup territory, not real time. */
  countIn?: boolean;
  label?: string;
  className?: string;
}

export function BeatStrip({
  beats,
  beatIndex,
  beatProgress,
  active,
  playing,
  countIn,
  label,
  className,
}: Props) {
  return (
    <div
      role="img"
      aria-label={label}
      className={cn(
        "flex min-w-0 items-center gap-1",
        !active && "opacity-40",
        className,
      )}
    >
      {Array.from({ length: beats }, (_, i) => {
        const isCurrent = playing && active && i === beatIndex;
        const isDownbeat = i === 0;
        // Flash each pill on its own beat; fade as the beat elapses.
        // Every beat uses the same amber because the metronome clicks
        // every beat too — only the sound timbre differs between
        // downbeat and off-beats, not the fact that a beat happens.
        // The downbeat is still marked visually by a slightly
        // brighter/larger dot, not by being the only lit pill.
        const opacity = isCurrent
          ? 1 - Math.min(0.7, Math.max(0, beatProgress) * 0.7)
          : 0;
        return (
          <div
            key={i}
            className={cn(
              "relative h-[6px] min-w-[10px] flex-1 overflow-hidden rounded-full",
              isDownbeat
                ? "bg-amber-200/60 dark:bg-amber-500/30"
                : "bg-stone-300 dark:bg-stone-200/30",
            )}
          >
            <div
              className={cn(
                "absolute inset-0 transition-opacity duration-75 ease-out",
                countIn ? "bg-sky-500" : "bg-amber-500",
              )}
              style={{ opacity }}
            />
          </div>
        );
      })}
    </div>
  );
}
