import { motion } from "motion/react";
import { cn } from "../../lib/utils";

interface Props {
  checked: boolean;
  onChange(checked: boolean): void;
  disabled?: boolean;
  label?: React.ReactNode;
  title?: string;
  size?: "sm" | "md";
}

export function Switch({
  checked,
  onChange,
  disabled,
  label,
  title,
  size = "sm",
}: Props) {
  const w = size === "sm" ? 28 : 36;
  const h = size === "sm" ? 16 : 20;
  const knob = h - 4;
  return (
    <label
      title={title}
      className={cn(
        "inline-flex items-center gap-1.5 text-xs text-stone-600 select-none",
        disabled && "cursor-not-allowed opacity-40",
      )}
    >
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative inline-flex shrink-0 items-center rounded-full transition-colors duration-150 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1",
          checked ? "bg-amber-500" : "bg-stone-300",
          disabled && "cursor-not-allowed",
        )}
        style={{ width: w, height: h }}
      >
        <motion.span
          layout
          transition={{ type: "spring", stiffness: 520, damping: 34 }}
          className="inline-block rounded-full bg-white shadow-sm"
          style={{
            width: knob,
            height: knob,
            marginLeft: checked ? w - knob - 2 : 2,
          }}
        />
      </button>
      {label ? <span>{label}</span> : null}
    </label>
  );
}
