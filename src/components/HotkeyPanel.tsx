import { motion } from "motion/react";
import { INSTRUMENT_BY_DIGIT } from "../notation/hotkeyMap";
import { instrumentLabels } from "../notation/instruments";
import { InstrumentIcon } from "./InstrumentIcon";
import { useHotkeyContext } from "./hotkeyContext";

type Section = {
  title: string;
  items: Array<{ keys: string[]; label: string }>;
};

const SECTIONS: Section[] = [
  {
    title: "Transport",
    items: [
      { keys: ["Space"], label: "Play / Pause" },
      { keys: ["Esc"], label: "Stop" },
      { keys: ["L"], label: "Toggle loop" },
      { keys: ["M"], label: "Toggle click" },
    ],
  },
  {
    title: "History",
    items: [
      { keys: ["⌘Z"], label: "Undo" },
      { keys: ["⇧⌘Z"], label: "Redo" },
    ],
  },
  {
    title: "Navigation",
    items: [
      { keys: ["←", "→"], label: "Slot / cell" },
      { keys: ["↑", "↓"], label: "Lane" },
      { keys: ["Home", "End"], label: "Bar start / end" },
      { keys: ["⌘←", "⌘→"], label: "Prev / next bar" },
      { keys: ["Tab"], label: "Auto-advance" },
      { keys: ["Del"], label: "Clear slot" },
    ],
  },
  {
    title: "Modifiers",
    items: [
      { keys: [">"], label: "Accent" },
      { keys: ["g", "("], label: "Ghost" },
      { keys: ["f"], label: "Flam" },
      { keys: ["r", "~"], label: "Roll" },
      { keys: ["!"], label: "Choke" },
      { keys: ["⇧R"], label: "Sticking R" },
      { keys: ["⇧L"], label: "Sticking L" },
    ],
  },
  {
    title: "Division (current beat)",
    items: [
      { keys: ["⌥1"], label: "1/4 (whole)" },
      { keys: ["⌥2"], label: "1/8" },
      { keys: ["⌥3"], label: "Triplet" },
      { keys: ["⌥4"], label: "1/16" },
      { keys: ["⌥6"], label: "Sextuplet" },
      { keys: ["⌥8"], label: "1/32" },
    ],
  },
];

/**
 * Compact, multi-column shortcut reference used inside the hover/click
 * popover attached to the Bar editor header. Renders the instrument list
 * on the left and the remaining sections flowing across two more columns
 * so the whole cheatsheet fits in a single viewport-friendly card.
 */
export function HotkeyPanel() {
  const { currentInstrument } = useHotkeyContext();
  const instruments = Object.entries(INSTRUMENT_BY_DIGIT).map(
    ([digit, instrument]) => ({ digit, instrument }),
  );
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
          Shortcuts
        </h3>
      </header>
      <div className="grid grid-cols-[auto_1fr_1fr] gap-4 px-1">
        <section className="min-w-[150px]">
          <SectionLabel>Instruments</SectionLabel>
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
                    (isCurrent ? "bg-amber-100 text-stone-900" : "")
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
          <Section s={SECTIONS[0]} />
          <Section s={SECTIONS[1]} />
          <Section s={SECTIONS[2]} />
        </div>
        <div className="flex flex-col gap-3">
          <Section s={SECTIONS[3]} />
          <Section s={SECTIONS[4]} />
        </div>
      </div>
    </motion.div>
  );
}

function Section({ s }: { s: Section }) {
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
