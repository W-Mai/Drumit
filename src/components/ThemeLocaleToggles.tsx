import { useState } from "react";
import { useI18n } from "../i18n/useI18n";
import { LOCALE_OPTIONS, type Locale } from "../i18n/dict";
import { useTheme } from "../theme/useTheme";
import { THEME_OPTIONS, type ThemePref } from "../theme/context";
import { FloatingMenu } from "./FloatingMenu";

const THEME_GLYPH: Record<ThemePref, string> = {
  light: "☀",
  dark: "☾",
  sepia: "⛬",
  auto: "◐",
};

function iconClass(active?: boolean) {
  return (
    "motion-press flex size-7 items-center justify-center rounded-full border text-sm font-semibold transition-colors " +
    (active
      ? "border-amber-400 bg-amber-50 text-amber-900 dark:bg-amber-900 dark:text-amber-100"
      : "border-stone-200 bg-white text-stone-600 hover:bg-stone-50 hover:text-stone-900")
  );
}

export function ThemeToggle() {
  const { t } = useI18n();
  const { pref, resolved, setPref } = useTheme();
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  return (
    <>
      <button
        ref={setAnchor}
        type="button"
        aria-label={t("header.theme")}
        title={t("header.theme")}
        onClick={() => setOpen((v) => !v)}
        className={iconClass(open)}
      >
        <span className="text-[13px] leading-none">{THEME_GLYPH[pref]}</span>
      </button>
      <FloatingMenu
        anchor={anchor}
        open={open}
        onClose={() => setOpen(false)}
        placement="bottom"
      >
        <div className="flex min-w-[9rem] flex-col gap-0.5 rounded-lg border border-stone-200 bg-white p-1 shadow-xl">
          {THEME_OPTIONS.map((opt) => {
            const selected = opt.value === pref;
            const effective =
              opt.value === "auto" ? `auto (${resolved})` : opt.label;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  setPref(opt.value);
                  setOpen(false);
                }}
                className={
                  "motion-press flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-[12px] " +
                  (selected
                    ? "bg-amber-100 text-stone-900 dark:bg-amber-500/30 dark:text-amber-50"
                    : "text-stone-700 hover:bg-stone-100")
                }
              >
                <span className="flex items-center gap-2">
                  <span className="inline-flex size-4 items-center justify-center text-[11px]">
                    {THEME_GLYPH[opt.value]}
                  </span>
                  {effective}
                </span>
                {selected ? (
                  <span className="text-[10px] text-amber-700">●</span>
                ) : null}
              </button>
            );
          })}
        </div>
      </FloatingMenu>
    </>
  );
}

export function LocaleToggle() {
  const { t, locale, setLocale } = useI18n();
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  return (
    <>
      <button
        ref={setAnchor}
        type="button"
        aria-label={t("header.locale")}
        title={t("header.locale")}
        onClick={() => setOpen((v) => !v)}
        className={iconClass(open)}
      >
        <span className="text-[10px] leading-none font-bold uppercase">
          {locale}
        </span>
      </button>
      <FloatingMenu
        anchor={anchor}
        open={open}
        onClose={() => setOpen(false)}
        placement="bottom"
      >
        <div className="flex min-w-[7rem] flex-col gap-0.5 rounded-lg border border-stone-200 bg-white p-1 shadow-xl">
          {LOCALE_OPTIONS.map((opt) => {
            const selected = opt.value === locale;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  setLocale(opt.value as Locale);
                  setOpen(false);
                }}
                className={
                  "motion-press rounded-md px-2 py-1.5 text-left text-[12px] " +
                  (selected
                    ? "bg-amber-100 text-stone-900 dark:bg-amber-500/30 dark:text-amber-50"
                    : "text-stone-700 hover:bg-stone-100")
                }
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </FloatingMenu>
    </>
  );
}
