import { createContext } from "react";
import type { Locale } from "./dict";

export type I18nContextValue = {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
};

export const I18nContext = createContext<I18nContextValue | null>(null);
