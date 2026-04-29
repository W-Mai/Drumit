import { useMemo, useState } from "react";
import type { Instrument } from "../notation/types";
import { HotkeyCtx } from "./hotkeyContext";

export function HotkeyContextProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [currentInstrument, setCurrentInstrument] = useState<Instrument | null>(
    null,
  );
  const [autoAdvance, setAutoAdvance] = useState(true);
  const value = useMemo(
    () => ({
      currentInstrument,
      autoAdvance,
      setCurrentInstrument,
      setAutoAdvance,
    }),
    [currentInstrument, autoAdvance],
  );
  return <HotkeyCtx.Provider value={value}>{children}</HotkeyCtx.Provider>;
}
