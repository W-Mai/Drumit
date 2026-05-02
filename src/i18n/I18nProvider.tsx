import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { dict, type Locale } from "./dict";
import { I18nContext, type I18nContextValue } from "./context";

const STORAGE_KEY = "drumit.locale";

function detectInitialLocale(): Locale {
  if (typeof window === "undefined") return "en";
  const saved = window.localStorage.getItem(STORAGE_KEY);
  if (saved === "zh" || saved === "en") return saved;
  const nav = window.navigator?.language ?? "en";
  return nav.toLowerCase().startsWith("zh") ? "zh" : "en";
}

function interpolate(
  tpl: string,
  vars?: Record<string, string | number>,
): string {
  if (!vars) return tpl;
  return tpl.replace(/\{(\w+)\}/g, (_, k) =>
    k in vars ? String(vars[k]) : `{${k}}`,
  );
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(detectInitialLocale);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, l);
    }
  }, []);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("lang", locale);
    }
  }, [locale]);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      const tbl = dict[locale];
      const tpl = tbl[key];
      if (tpl === undefined) {
        if (import.meta.env?.DEV) {
          console.warn(`[i18n] missing key: ${key} (locale=${locale})`);
        }
        return key;
      }
      return interpolate(tpl, vars);
    },
    [locale],
  );

  const value = useMemo<I18nContextValue>(
    () => ({ locale, setLocale, t }),
    [locale, setLocale, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
