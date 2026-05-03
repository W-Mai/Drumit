import { cn } from "../../lib/utils";

export type BadgeTone = "neutral" | "success" | "warning" | "danger" | "accent";

const toneClass: Record<BadgeTone, string> = {
  neutral: "bg-stone-100 text-stone-600",
  success: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-100",
  warning: "bg-amber-50 text-amber-800 dark:bg-amber-900 dark:text-amber-100",
  danger: "bg-red-50 text-red-700 dark:bg-red-900 dark:text-red-100",
  accent: "bg-amber-100 text-stone-900 dark:bg-amber-500/30 dark:text-amber-50",
};

export function Badge({
  tone = "neutral",
  children,
  className,
  title,
}: {
  tone?: BadgeTone;
  children: React.ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "rounded px-2 py-0.5 text-[10px] font-bold transition-colors duration-150 ease-out",
        toneClass[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
