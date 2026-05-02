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
  const isTouch = useMediaQuery("(pointer: coarse)");
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);

  if (isTouch) {
    return (
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={cn(
          "motion-press rounded border border-stone-200 bg-white font-bold text-stone-700 transition-colors",
          size === "xs"
            ? "px-2 py-0.5 text-[11px]"
            : "px-2 py-0.5 text-xs",
          className,
        )}
        title={title}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }

  const current = options.find((o) => o.value === value);
  return (
    <>
      <button
        ref={setAnchor}
        type="button"
        disabled={disabled}
        title={title}
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
        className="min-w-[140px]"
      >
        <div className="flex flex-col gap-0.5">
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              disabled={o.disabled}
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
              className={cn(
                "motion-press flex items-start gap-2 rounded px-2 py-1 text-left text-xs transition-colors",
                o.value === value
                  ? "bg-stone-900 text-amber-100"
                  : "text-stone-700 hover:bg-stone-100",
                o.disabled && "cursor-not-allowed opacity-40",
              )}
            >
              <span className="flex-1 truncate font-bold">{o.label}</span>
              {o.description ? (
                <span className="shrink-0 text-[10px] font-medium text-stone-400">
                  {o.description}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </FloatingMenu>
    </>
  );
}
