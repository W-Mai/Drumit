import { createContext } from "react";

export type ThemePref = "light" | "dark" | "sepia" | "cyberpunk" | "auto";

export type ThemeResolved = "light" | "dark" | "sepia" | "cyberpunk";

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
  { value: "cyberpunk", label: "Cyberpunk" },
  { value: "auto", label: "Auto" },
];
