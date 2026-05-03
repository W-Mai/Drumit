import { cn } from "../../lib/utils";

export function ChipGroup({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex flex-wrap items-center gap-0.5 rounded-full border border-stone-200 bg-stone-50 p-0.5",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Chip({
  active,
  onClick,
  disabled,
  children,
  className,
  title,
}: {
  active?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "motion-press rounded-full px-2.5 py-0.5 text-[11px] font-bold transition-[background-color,color,box-shadow] duration-150 ease-out",
        active
          ? "bg-stone-900 text-stone-50 shadow-sm"
          : "text-stone-600 hover:bg-stone-200",
        disabled && "cursor-not-allowed opacity-40",
        className,
      )}
    >
      {children}
    </button>
  );
}
