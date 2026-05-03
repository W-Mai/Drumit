import { forwardRef } from "react";
import { cn } from "../../lib/utils";

export type ButtonVariant =
  | "primary" // filled dark, main action
  | "secondary" // outline, light
  | "ghost" // text only
  | "success" // emerald
  | "danger" // red
  | "accent"; // amber

export type ButtonSize = "xs" | "sm" | "md";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  pill?: boolean;
  /** Scales down on press. Use for transport / primary actions. */
  pressable?: boolean;
}

const variantClass: Record<ButtonVariant, string> = {
  primary:
    "bg-stone-900 text-stone-50 hover:bg-stone-700 border border-stone-900",
  secondary:
    "bg-white text-stone-700 border border-stone-200 hover:bg-stone-100 hover:text-stone-900",
  ghost: "text-stone-600 hover:bg-stone-100 border border-transparent",
  success:
    "bg-emerald-500 text-white hover:bg-emerald-600 border border-emerald-500",
  danger:
    "bg-white text-red-600 border border-red-200 hover:bg-red-600 hover:text-white hover:border-red-600",
  accent:
    "bg-amber-500 text-white hover:bg-amber-600 border border-amber-500",
};

const sizeClass: Record<ButtonSize, string> = {
  xs: "px-2 py-0.5 text-[11px]",
  sm: "px-3 py-1 text-xs",
  md: "px-4 py-1.5 text-sm",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = "secondary",
      size = "sm",
      pill = true,
      pressable = false,
      className,
      type = "button",
      ...rest
    },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type}
        className={cn(
          "inline-flex items-center justify-center font-bold transition select-none",
          "disabled:cursor-not-allowed disabled:opacity-40",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1",
          pill ? "rounded-full" : "rounded-md",
          pressable && "motion-press",
          variantClass[variant],
          sizeClass[size],
          className,
        )}
        {...rest}
      />
    );
  },
);
