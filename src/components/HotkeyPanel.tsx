import { motion } from "motion/react";
import { INSTRUMENT_BY_DIGIT } from "../notation/hotkeyMap";
import { instrumentLabels } from "../notation/instruments";
import { InstrumentIcon } from "./InstrumentIcon";
import { useHotkeyContext } from "./hotkeyContext";
import { useI18n } from "../i18n/useI18n";

type SectionData = {
  title: string;
  items: Array<{ keys: string[]; label: string }>;
};

/**
 * Compact, multi-column shortcut reference used inside the hover/click
 * popover attached to the Bar editor header. Renders the instrument list
 * on the left and the remaining sections flowing across two more columns
 * so the whole cheatsheet fits in a single viewport-friendly card.
 */
export function HotkeyPanel() {
  const { t } = useI18n();
  const { currentInstrument } = useHotkeyContext();
  const instruments = Object.entries(INSTRUMENT_BY_DIGIT).map(
    ([digit, instrument]) => ({ digit, instrument }),
  );

  const sections: SectionData[] = [
    {
      title: t("hotkeys.section.transport"),
      items: [
        { keys: ["Space"], label: t("hotkeys.play_pause") },
        { keys: ["Esc"], label: t("hotkeys.stop") },
        { keys: ["L"], label: t("hotkeys.toggle_loop") },
        { keys: ["M"], label: t("hotkeys.toggle_click") },
      ],
    },
    {
      title: t("hotkeys.section.history"),
      items: [
        { keys: ["⌘Z"], label: t("hotkeys.undo") },
        { keys: ["⇧⌘Z"], label: t("hotkeys.redo") },
      ],
    },
    {
      title: t("hotkeys.section.navigation"),
      items: [
        { keys: ["←", "→"], label: t("hotkeys.slot_cell") },
        { keys: ["↑", "↓"], label: t("hotkeys.lane") },
        { keys: ["Home", "End"], label: t("hotkeys.bar_start_end") },
        {
          keys: ["⌘←", "⌘→", "[", "]"],
          label: t("hotkeys.prev_next_bar"),
        },
        { keys: ["⌘⏎"], label: t("hotkeys.insert_bar_after") },
        { keys: ["Tab"], label: t("hotkeys.autoadvance") },
        { keys: ["Del"], label: t("hotkeys.clear_slot") },
      ],
    },
    {
      title: t("hotkeys.section.modifiers"),
      items: [
        { keys: [">"], label: t("hotkeys.accent") },
        { keys: ["g", "("], label: t("hotkeys.ghost") },
        { keys: ["f"], label: t("hotkeys.flam") },
        { keys: ["r", "~"], label: t("hotkeys.roll") },
        { keys: ["!"], label: t("hotkeys.choke") },
        { keys: ["⇧R"], label: t("hotkeys.sticking_r") },
        { keys: ["⇧L"], label: t("hotkeys.sticking_l") },
      ],
    },
    {
      title: t("hotkeys.section.division"),
      items: [
        { keys: ["⌥1"], label: t("hotkeys.div_quarter") },
        { keys: ["⌥2"], label: t("hotkeys.div_eighth") },
        { keys: ["⌥3"], label: t("hotkeys.div_triplet") },
        { keys: ["⌥4"], label: t("hotkeys.div_sixteenth") },
        { keys: ["⌥6"], label: t("hotkeys.div_sextuplet") },
        { keys: ["⌥8"], label: t("hotkeys.div_32nd") },
      ],
    },
  ];

  return (
    <motion.div
      className="flex flex-col gap-2 p-1 text-[11px] text-stone-700"
      initial="hidden"
      animate="visible"
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: 0.02 } },
      }}
    >
      <header className="px-1">
        <h3 className="text-[10px] font-extrabold tracking-wide text-stone-500 uppercase">
          {t("hotkeys.title")}
        </h3>
      </header>
      <div className="grid grid-cols-[auto_1fr_1fr] gap-4 px-1">
        <section className="min-w-[150px]">
          <SectionLabel>{t("hotkeys.section.instruments")}</SectionLabel>
          <ul className="flex flex-col gap-0.5">
            {instruments.map(({ digit, instrument }) => {
              const isCurrent = currentInstrument === instrument;
              return (
                <motion.li
                  key={digit}
                  variants={{
                    hidden: { opacity: 0, x: -4 },
                    visible: { opacity: 1, x: 0 },
                  }}
                  className={
                    "flex items-center gap-1.5 rounded px-1 py-0.5 " +
                    (isCurrent ? "bg-amber-100 text-stone-900 dark:bg-amber-500/30 dark:text-amber-50" : "")
                  }
                >
                  <Kbd>{digit}</Kbd>
                  <InstrumentIcon
                    instrument={instrument}
                    className="size-3.5 shrink-0 text-stone-600"
                  />
                  <span className="truncate">
                    {instrumentLabels[instrument]}
                  </span>
                </motion.li>
              );
            })}
          </ul>
        </section>
        <div className="flex flex-col gap-3">
          <Section s={sections[0]} />
          <Section s={sections[1]} />
          <Section s={sections[2]} />
        </div>
        <div className="flex flex-col gap-3">
          <Section s={sections[3]} />
          <Section s={sections[4]} />
        </div>
      </div>
    </motion.div>
  );
}

function Section({ s }: { s: SectionData }) {
  return (
    <section>
      <SectionLabel>{s.title}</SectionLabel>
      <ul className="flex flex-col gap-0.5">
        {s.items.map(({ keys, label }) => (
          <li
            key={label}
            className="flex items-center justify-between gap-2"
          >
            <span className="truncate">{label}</span>
            <span className="flex shrink-0 gap-0.5">
              {keys.map((k) => (
                <Kbd key={k}>{k}</Kbd>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-1 text-[9px] font-extrabold tracking-wide text-stone-500 uppercase">
      {children}
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex min-w-[18px] items-center justify-center rounded border border-stone-300 bg-stone-50 px-1 font-mono text-[10px] font-bold text-stone-700">
      {children}
    </kbd>
  );
}
