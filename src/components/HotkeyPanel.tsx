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

export function HotkeyPanel() {
  const { currentInstrument } = useHotkeyContext();
  const instruments = Object.entries(INSTRUMENT_BY_DIGIT).map(
    ([digit, instrument]) => ({ digit, instrument }),
  );
  return (
    <aside className="flex flex-col rounded-2xl border border-stone-200 bg-white">
      <header className="border-b border-stone-200 px-3 py-2">
        <h3 className="text-[10px] font-extrabold tracking-wide text-stone-500 uppercase">
          Shortcuts
        </h3>
      </header>
      <div className="flex flex-col gap-3 p-2 text-[11px] text-stone-700">
        <section>
          <div className="mb-1 text-[9px] font-extrabold tracking-wide text-stone-500 uppercase">
            Instruments
          </div>
          <ul className="grid grid-cols-1 gap-0.5">
            {instruments.map(({ digit, instrument }) => {
              const isCurrent = currentInstrument === instrument;
              return (
                <li
                  key={digit}
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
                  <span className="truncate">{instrumentLabels[instrument]}</span>
                </li>
              );
            })}
          </ul>
        </section>
        {SECTIONS.map((s) => (
          <section key={s.title}>
            <div className="mb-1 text-[9px] font-extrabold tracking-wide text-stone-500 uppercase">
              {s.title}
            </div>
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
        ))}
      </div>
    </aside>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex min-w-[18px] items-center justify-center rounded border border-stone-300 bg-stone-50 px-1 font-mono text-[10px] font-bold text-stone-700">
      {children}
    </kbd>
  );
}
