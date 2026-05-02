import { createContext } from "react";

/** User-selectable theme mode; "auto" follows the OS. */
export type ThemePref = "light" | "dark" | "sepia" | "auto";

/** Resolved effective theme (what actually lands on `data-theme`). */
export type ThemeResolved = "light" | "dark" | "sepia";

export type ThemeContextValue = {
  pref: ThemePref;
  resolved: ThemeResolved;
  setPref: (p: ThemePref) => void;
};

export const ThemeContext = createContext<ThemeContextValue | null>(null);

export const THEME_OPTIONS: { value: ThemePref; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "sepia", label: "Sepia" },
  { value: "auto", label: "Auto" },
];
