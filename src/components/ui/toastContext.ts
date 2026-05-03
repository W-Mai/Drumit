import { createContext } from "react";

export type ToastTone = "info" | "success" | "warning" | "danger";

export type ToastInput = {
  message: string;
  tone?: ToastTone;
  /** Milliseconds before auto-dismiss. 0 = sticky until clicked. */
  duration?: number;
  /** Optional action button label + callback. */
  action?: { label: string; onClick: () => void };
};

export type ToastApi = {
  toast: (input: ToastInput) => void;
};

export const ToastContext = createContext<ToastApi | null>(null);
