import { forwardRef } from "react";
import { cn } from "../../lib/utils";

/** Wraps `<label>` for a simple form row. */
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

export const TextInput = forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(function TextInput({ className, ...rest }, ref) {
  return (
    <input
      ref={ref}
      className={cn(
        "rounded border border-stone-200 bg-white px-2 py-0.5 text-xs font-bold text-stone-700 outline-none focus:border-stone-500",
        className,
      )}
      {...rest}
    />
  );
});

export const Select = forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(function Select({ className, ...rest }, ref) {
  return (
    <select
      ref={ref}
      className={cn(
        "rounded border border-stone-200 bg-white px-2 py-0.5 text-xs font-bold text-stone-700",
        className,
      )}
      {...rest}
    />
  );
});
