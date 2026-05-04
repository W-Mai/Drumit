import { cn } from "../lib/utils";

interface Props {
  beats: number;
  beatIndex: number;
  /** 0..1 within the current beat — used to fade the current pill in. */
  beatProgress: number;
  active: boolean;
  playing: boolean;
  label?: string;
  className?: string;
}

export function BeatStrip({
  beats,
  beatIndex,
  beatProgress,
  active,
  playing,
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
        // When it's this pill's turn, flash it full-width and let the
        // opacity fade as the beat progresses into the next one — so a
        // 4-beat bar reads as 4 distinct blinks instead of a slowly-
        // filling progress bar that always leaves the last pill "half
        // done" at the end of the bar.
        const opacity = isCurrent
          ? 1 - Math.min(0.7, Math.max(0, beatProgress) * 0.7)
          : 0;
        return (
          <div
            key={i}
            className="relative h-[6px] min-w-[10px] flex-1 overflow-hidden rounded-full bg-stone-300 dark:bg-stone-200/30"
          >
            <div
              className={cn(
                "absolute inset-0 transition-opacity duration-75 ease-out",
                isDownbeat ? "bg-amber-500" : "bg-emerald-500",
              )}
              style={{ opacity }}
            />
          </div>
        );
      })}
    </div>
  );
}
