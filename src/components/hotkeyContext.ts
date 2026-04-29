import { createContext, useContext } from "react";
import type { Instrument } from "../notation/types";

export interface HotkeyContextValue {
  currentInstrument: Instrument | null;
  autoAdvance: boolean;
  setCurrentInstrument: (i: Instrument | null) => void;
  setAutoAdvance: (v: boolean) => void;
}

export const HotkeyCtx = createContext<HotkeyContextValue | null>(null);

export function useHotkeyContext(): HotkeyContextValue {
  const v = useContext(HotkeyCtx);
  if (!v) {
    return {
      currentInstrument: null,
      autoAdvance: true,
      setCurrentInstrument: () => undefined,
      setAutoAdvance: () => undefined,
    };
  }
  return v;
}
