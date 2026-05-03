import { cn } from "../../lib/utils";

/** Wraps `<label>` for a simple form row: "Label: [control]". */
export function Field({
  label,
  children,
  title,
  disabled,
  className,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  title?: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <label
      title={title}
      className={cn(
        "flex items-center gap-1 text-xs",
        disabled ? "text-stone-300" : "text-stone-600",
        className,
      )}
    >
      {label ? <span>{label}</span> : null}
      {children}
    </label>
  );
}
