import { cn } from "../../lib/utils";

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
  const clamp = (n: number) => Math.max(min, Math.min(max, n));
  const commit = (n: number) => {
    if (Number.isNaN(n)) return;
    onChange(clamp(n));
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
        aria-label="Decrease"
        tabIndex={-1}
      >
        −
      </button>
      <input
        type="number"
        inputMode="numeric"
        value={value}
        min={min === -Infinity ? undefined : min}
        max={max === Infinity ? undefined : max}
        step={step}
        disabled={disabled}
        onChange={(e) => commit(Number.parseInt(e.target.value, 10))}
        className="w-12 appearance-none bg-transparent px-1 text-center outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <button
        type="button"
        disabled={disabled || value >= max}
        onClick={() => commit(value + step)}
        className="motion-press flex w-5 items-center justify-center text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-900 disabled:cursor-not-allowed disabled:opacity-40"
        aria-label="Increase"
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
