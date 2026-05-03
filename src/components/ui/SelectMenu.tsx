import { useState } from "react";
import { FloatingMenu } from "../FloatingMenu";
import { useMediaQuery } from "../../lib/useMediaQuery";
import { cn } from "../../lib/utils";

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
}

interface Props {
  value: string;
  options: SelectOption[];
  onChange(value: string): void;
  className?: string;
  size?: "xs" | "sm";
  placeholder?: string;
  disabled?: boolean;
  title?: string;
}

export function SelectMenu({
  value,
  options,
  onChange,
  className,
  size = "sm",
  placeholder,
  disabled,
  title,
}: Props) {
  // Narrow viewports get a bottom-sheet rendition of the same menu
  // (driven by FloatingMenu's mobileSheet) so the look stays consistent
  // with the rest of the app instead of popping the OS picker wheel.
  const isTouch = useMediaQuery("(pointer: coarse)");
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);

  const current = options.find((o) => o.value === value);

  return (
    <>
      <button
        ref={setAnchor}
        type="button"
        disabled={disabled}
        title={title}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "motion-press inline-flex items-center gap-1 rounded border border-stone-200 bg-white font-bold text-stone-700 transition-colors hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-40",
          open && "border-stone-500",
          size === "xs"
            ? "px-2 py-0.5 text-[11px]"
            : "px-2 py-0.5 text-xs",
          className,
        )}
      >
        <span className="truncate">
          {current?.label ?? placeholder ?? value}
        </span>
        <span className="text-[9px] opacity-60">▾</span>
      </button>
      <FloatingMenu
        anchor={anchor}
        open={open}
        onClose={() => setOpen(false)}
        className="min-w-[160px]"
        mobileSheet
      >
        <div
          role="listbox"
          className={cn("flex flex-col", isTouch ? "gap-1" : "gap-0.5")}
        >
          {options.map((o) => {
            const selected = o.value === value;
            return (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={selected}
                disabled={o.disabled}
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                className={cn(
                  "motion-press flex items-start gap-2 rounded text-left transition-colors",
                  // Touch targets get a 44px-ish minimum height and a
                  // larger font so they feel native on mobile.
                  isTouch
                    ? "min-h-11 px-3 py-2.5 text-sm"
                    : "px-2 py-1 text-xs",
                  selected
                    ? "surface-ink-amber"
                    : "text-stone-700 hover:bg-stone-100",
                  o.disabled && "cursor-not-allowed opacity-40",
                )}
              >
                <span className="flex-1 truncate font-bold">{o.label}</span>
                {o.description ? (
                  <span
                    className={cn(
                      "shrink-0 font-medium text-stone-400",
                      isTouch ? "text-[11px]" : "text-[10px]",
                    )}
                  >
                    {o.description}
                  </span>
                ) : null}
                {selected && isTouch ? (
                  <span
                    aria-hidden="true"
                    className="shrink-0 text-xs text-amber-300"
                  >
                    ✓
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </FloatingMenu>
    </>
  );
}
