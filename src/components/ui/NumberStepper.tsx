import { useState } from "react";
import { cn } from "../../lib/utils";
import { useI18n } from "../../i18n/useI18n";

interface Props {
  value: number;
  onChange(value: number): void;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
  disabled?: boolean;
  title?: string;
  suffix?: React.ReactNode;
}

export function NumberStepper({
  value,
  onChange,
  min = -Infinity,
  max = Infinity,
  step = 1,
  className,
  disabled,
  title,
  suffix,
}: Props) {
  const { t } = useI18n();
  const clamp = (n: number) => Math.max(min, Math.min(max, n));
  const commit = (n: number) => {
    if (Number.isNaN(n)) return;
    onChange(clamp(n));
  };
  // Draft so mid-typing values below `min` don't snap back each keystroke.
  const [draft, setDraft] = useState<string>(String(value));
  const [lastValue, setLastValue] = useState<number>(value);
  if (value !== lastValue) {
    setLastValue(value);
    setDraft(String(value));
  }
  const commitDraft = () => {
    const n = Number.parseInt(draft, 10);
    if (Number.isNaN(n)) {
      setDraft(String(value));
      return;
    }
    const c = clamp(n);
    setDraft(String(c));
    if (c !== value) onChange(c);
  };

  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-stretch overflow-hidden rounded-md border border-stone-200 bg-white text-xs font-bold text-stone-700",
        disabled && "cursor-not-allowed opacity-40",
        className,
      )}
    >
      <button
        type="button"
        disabled={disabled || value <= min}
        onClick={() => commit(value - step)}
        className="motion-press flex w-5 items-center justify-center text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-900 disabled:cursor-not-allowed disabled:opacity-40"
        aria-label={t("common.decrease")}
        tabIndex={-1}
      >
        −
      </button>
      <input
        type="number"
        inputMode="numeric"
        value={draft}
        min={min === -Infinity ? undefined : min}
        max={max === Infinity ? undefined : max}
        step={step}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commitDraft}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commitDraft();
            (e.target as HTMLInputElement).blur();
          } else if (e.key === "Escape") {
            setDraft(String(value));
            (e.target as HTMLInputElement).blur();
          }
        }}
        /* Base font-size ≥ 16px prevents iOS Safari's focus-zoom; override
           back to the compact xs size on pointer:fine where zoom isn't an
           issue. */
        className="w-12 appearance-none bg-transparent px-1 text-center text-base outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none sm:text-xs"
      />
      <button
        type="button"
        disabled={disabled || value >= max}
        onClick={() => commit(value + step)}
        className="motion-press flex w-5 items-center justify-center text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-900 disabled:cursor-not-allowed disabled:opacity-40"
        aria-label={t("common.increase")}
        tabIndex={-1}
      >
        +
      </button>
      {suffix ? (
        <span className="flex items-center border-l border-stone-200 px-1.5 text-stone-500">
          {suffix}
        </span>
      ) : null}
    </span>
  );
}
