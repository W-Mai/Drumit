import { createContext, useContext } from "react";
import type { ReactNode } from "react";

export type DialogTone = "neutral" | "danger" | "primary";

interface Base {
  title?: ReactNode;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: DialogTone;
}

export type AlertRequest = Base & { kind: "alert" };
export type ConfirmRequest = Base & { kind: "confirm" };
export type PromptRequest = Base & {
  kind: "prompt";
  defaultValue?: string;
  placeholder?: string;
  validate?: (value: string) => string | null;
};

export type DialogRequest = AlertRequest | ConfirmRequest | PromptRequest;

export interface DialogApi {
  alert(req: Omit<AlertRequest, "kind">): Promise<void>;
  confirm(req: Omit<ConfirmRequest, "kind">): Promise<boolean>;
  prompt(req: Omit<PromptRequest, "kind">): Promise<string | null>;
}

export const DialogContext = createContext<DialogApi | null>(null);

export function useDialog(): DialogApi {
  const api = useContext(DialogContext);
  if (!api) throw new Error("useDialog must be used inside <DialogProvider>");
  return api;
}
