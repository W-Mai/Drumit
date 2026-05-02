import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  ThemeContext,
  type ThemeContextValue,
  type ThemePref,
  type ThemeResolved,
} from "./context";

const STORAGE_KEY = "drumit.theme";

function readSavedPref(): ThemePref {
  if (typeof window === "undefined") return "auto";
  const v = window.localStorage.getItem(STORAGE_KEY);
  if (v === "light" || v === "dark" || v === "sepia" || v === "auto") return v;
  return "auto";
}

function readOsPrefersDark(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function applyThemeAttribute(resolved: ThemeResolved) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", resolved);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [pref, setPrefState] = useState<ThemePref>(readSavedPref);
  // Track OS preference as state so "auto" stays reactive to system flips
  // without setState-in-effect patterns.
  const [osPrefersDark, setOsPrefersDark] = useState<boolean>(readOsPrefersDark);

  const resolved: ThemeResolved = useMemo(() => {
    if (pref !== "auto") return pref;
    return osPrefersDark ? "dark" : "light";
  }, [pref, osPrefersDark]);

  const setPref = useCallback((p: ThemePref) => {
    setPrefState(p);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, p);
    }
  }, []);

  // Apply the resolved theme to <html>. One side-effect only: writing the
  // attribute. No setState here.
  useEffect(() => {
    applyThemeAttribute(resolved);
  }, [resolved]);

  // Subscribe once to OS changes; update the OS state which flows into
  // `resolved` via the memo. React to everything regardless of pref — when
  // the user pins a theme, resolved simply ignores osPrefersDark.
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => setOsPrefersDark(e.matches);
    mql.addEventListener?.("change", onChange);
    return () => mql.removeEventListener?.("change", onChange);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ pref, resolved, setPref }),
    [pref, resolved, setPref],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}
