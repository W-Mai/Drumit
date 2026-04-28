import { useMemo, useState } from "react";
import { dongCiDaCi } from "./notation/examples";
import { naTianWanShang } from "./notation/samples/page03-na-tian-wan-shang";
import { lanLianHua } from "./notation/samples/page04-lan-lian-hua";
import { popRock } from "./notation/samples/page07-pop-rock";
import { rockFusion } from "./notation/samples/page08-rock-fusion";
import { funkRock } from "./notation/samples/page09-funk-rock";
import { bluesVariations } from "./notation/samples/page10-blues";
import { parseDrumtab } from "./notation/parser";
import { serializeScore } from "./notation/serialize";
import { layoutScore } from "./notation/layout";
import { DrumChart } from "./notation/renderer";
import { validateScore } from "./notation/validate";
import {
  deleteBar,
  insertBarAfter,
  setBarRepeatPrevious,
  setLaneDivision,
  setSticking,
  toggleArticulation,
  toggleSlot,
} from "./notation/edit";
import { PadEditor } from "./components/PadEditor";
import type { Score } from "./notation/types";
import { cn } from "./lib/utils";

type Mode = "source" | "visual";

const samples = [
  { label: "动次打次", src: dongCiDaCi },
  { label: "那天晚上 (Page 3)", src: naTianWanShang },
  { label: "蓝莲花 (Page 4)", src: lanLianHua },
  { label: "Pop Rock 综合练习 (Page 7)", src: popRock },
  { label: "Rock Fusion 综合练习 (Page 8)", src: rockFusion },
  { label: "Funk Rock 综合练习 (Page 9)", src: funkRock },
  { label: "Blues 节奏变奏 (Page 10)", src: bluesVariations },
];

export default function App() {
  const initialParse = useMemo(() => parseDrumtab(dongCiDaCi), []);

  // Canonical state: the Score AST is the source of truth.
  const [score, setScore] = useState<Score>(initialParse.score);
  // When the user is editing text, we keep a textDraft separate from score so
  // they can type broken intermediate states. When null, text view is derived
  // from score via serializeScore.
  const [textDraft, setTextDraft] = useState<string | null>(null);
  const [textDiagnostics, setTextDiagnostics] = useState(
    initialParse.diagnostics,
  );

  const [mode, setMode] = useState<Mode>("visual");
  const [selectedBar, setSelectedBar] = useState<number | null>(0);
  const [showLabels, setShowLabels] = useState(false);

  const serializedSource = useMemo(() => serializeScore(score), [score]);
  const currentSource = textDraft ?? serializedSource;

  const validation = useMemo(() => validateScore(score), [score]);
  const diagnostics = [...textDiagnostics, ...validation];
  const hasErrors = diagnostics.some((d) => d.level === "error");

  const totalBars = score.sections.reduce((a, s) => a + s.bars.length, 0);
  const clampedSelectedBar =
    selectedBar === null
      ? null
      : Math.min(selectedBar, Math.max(0, totalBars - 1));

  const layout = useMemo(
    () =>
      layoutScore(score, {
        showLabels,
        expanded: false,
        width: 980,
      }),
    [score, showLabels],
  );

  const selectedBarData = useMemo(() => {
    if (clampedSelectedBar === null) return null;
    let count = 0;
    for (const section of score.sections) {
      if (clampedSelectedBar < count + section.bars.length) {
        return section.bars[clampedSelectedBar - count];
      }
      count += section.bars.length;
    }
    return null;
  }, [score, clampedSelectedBar]);

  function loadSample(src: string) {
    const result = parseDrumtab(src);
    setScore(result.score);
    setTextDiagnostics(result.diagnostics);
    setTextDraft(null);
    setSelectedBar(result.score.sections[0]?.bars.length ? 0 : null);
  }

  function handleSourceChange(next: string) {
    setTextDraft(next);
    const result = parseDrumtab(next);
    setTextDiagnostics(result.diagnostics);
    if (
      !result.diagnostics.some((d) => d.level === "error") &&
      result.score.sections.length > 0
    ) {
      setScore(result.score);
    }
  }

  function switchMode(next: Mode) {
    setMode(next);
    // Leaving Source view: drop the draft, revert text to canonical
    // serialization of the current Score.
    if (next !== "source") setTextDraft(null);
  }

  function applyScoreUpdate(update: (s: Score) => Score) {
    setScore((prev) => update(prev));
    setTextDraft(null);
  }

  return (
    <div className="mx-auto w-full max-w-[1600px] p-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="text-brand text-xs font-bold tracking-[0.18em] uppercase">
            Drumit
          </p>
          <h1 className="text-ink font-serif text-5xl leading-none tracking-tight">
            Drumtab visualizer
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="inline-flex rounded-full border border-stone-200 bg-white p-1">
            <ModeTab active={mode === "visual"} onClick={() => switchMode("visual")}>
              Visual
            </ModeTab>
            <ModeTab active={mode === "source"} onClick={() => switchMode("source")}>
              Source
            </ModeTab>
          </div>
          <select
            className="rounded-full border border-stone-200 bg-white px-3 py-1 text-xs font-bold text-stone-700 hover:bg-stone-900 hover:text-white"
            value=""
            onChange={(e) => {
              const found = samples.find((s) => s.label === e.target.value);
              if (found) loadSample(found.src);
              e.currentTarget.value = "";
            }}
          >
            <option value="" disabled>
              Load example…
            </option>
            {samples.map((s) => (
              <option key={s.label} value={s.label}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </header>

      <section className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(380px,0.9fr)_minmax(520px,1.6fr)]">
        <article className="overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-xl shadow-stone-900/5">
          <div className="flex items-center justify-between border-b border-stone-200 px-4 py-3">
            <h2 className="text-sm font-extrabold">
              {mode === "visual"
                ? selectedBarData
                  ? `Bar editor`
                  : "Bar editor"
                : "Source"}
            </h2>
            <Diagnostics diagnostics={diagnostics} />
          </div>

          <div className="max-h-[76vh] overflow-auto p-4">
            {mode === "source" ? (
              <textarea
                value={currentSource}
                onChange={(event) => handleSourceChange(event.target.value)}
                spellCheck={false}
                className="block h-[64vh] w-full resize-y rounded-xl bg-stone-900 p-4 font-mono text-sm leading-relaxed text-amber-100 outline-none"
              />
            ) : selectedBarData && clampedSelectedBar !== null ? (
              <PadEditor
                bar={selectedBarData}
                barIndex={clampedSelectedBar}
                totalBars={totalBars}
                beatsPerBar={score.meter.beats}
                onSetRepeat={(hint) =>
                  applyScoreUpdate((s) =>
                    setBarRepeatPrevious(s, clampedSelectedBar, hint),
                  )
                }
                onInsertAfter={() => {
                  applyScoreUpdate((s) =>
                    insertBarAfter(s, clampedSelectedBar),
                  );
                  setSelectedBar((i) => (i === null ? null : i + 1));
                }}
                onDelete={() => {
                  applyScoreUpdate((s) => deleteBar(s, clampedSelectedBar));
                }}
                onSetDivision={(bi, inst, d) =>
                  applyScoreUpdate((s) =>
                    setLaneDivision(s, clampedSelectedBar, bi, inst, d),
                  )
                }
                onToggleSlot={(bi, inst, si) =>
                  applyScoreUpdate((s) =>
                    toggleSlot(s, clampedSelectedBar, bi, inst, si),
                  )
                }
                onToggleArticulation={(bi, inst, si, art) =>
                  applyScoreUpdate((s) =>
                    toggleArticulation(
                      s,
                      clampedSelectedBar,
                      bi,
                      inst,
                      si,
                      art,
                    ),
                  )
                }
                onSetSticking={(bi, inst, si, st) =>
                  applyScoreUpdate((s) =>
                    setSticking(s, clampedSelectedBar, bi, inst, si, st),
                  )
                }
              />
            ) : (
              <div className="grid min-h-[320px] place-items-center text-sm text-stone-500">
                Click a bar on the right to edit it.
              </div>
            )}
          </div>
        </article>

        <article className="overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-xl shadow-stone-900/5">
          <div className="flex items-center justify-between border-b border-stone-200 px-4 py-3">
            <h2 className="text-sm font-extrabold">Preview</h2>
            <div className="flex gap-2">
              <ToggleButton
                active={showLabels}
                onClick={() => setShowLabels((v) => !v)}
              >
                {showLabels ? "Hide labels" : "Show labels"}
              </ToggleButton>
            </div>
          </div>
          <div className="max-h-[82vh] min-h-[420px] overflow-auto bg-stone-100/40 p-4">
            {hasErrors ? (
              <div className="grid min-h-[320px] place-items-center text-sm text-stone-500">
                Fix parse errors to update the preview.
              </div>
            ) : (
              <DrumChart
                layout={layout}
                showLabels={showLabels}
                selectedBarIndex={clampedSelectedBar}
                onSelectBar={(idx) => setSelectedBar(idx)}
              />
            )}
          </div>
        </article>
      </section>
    </div>
  );
}

function ModeTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full px-4 py-1 text-xs font-bold transition",
        active
          ? "bg-stone-900 text-white"
          : "text-stone-600 hover:bg-stone-100",
      )}
    >
      {children}
    </button>
  );
}

function ToggleButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-bold transition",
        active
          ? "border-stone-900 bg-stone-900 text-white"
          : "border-stone-200 bg-white text-stone-700 hover:bg-stone-900 hover:text-white",
      )}
    >
      {children}
    </button>
  );
}

function Diagnostics({
  diagnostics,
}: {
  diagnostics: Array<{ level: "error" | "warning"; line: number; message: string }>;
}) {
  const errors = diagnostics.filter((d) => d.level === "error").length;
  const warnings = diagnostics.filter((d) => d.level === "warning").length;
  if (errors === 0 && warnings === 0)
    return (
      <span className="rounded bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
        OK
      </span>
    );
  return (
    <span
      className={cn(
        "rounded px-2 py-0.5 text-[10px] font-bold",
        errors > 0
          ? "bg-red-50 text-red-700"
          : "bg-amber-50 text-amber-800",
      )}
      title={diagnostics
        .map((d) => `${d.level}@${d.line}: ${d.message}`)
        .join("\n")}
    >
      {errors > 0 ? `${errors} error${errors > 1 ? "s" : ""}` : ""}
      {errors > 0 && warnings > 0 ? " · " : ""}
      {warnings > 0 ? `${warnings} warn` : ""}
    </span>
  );
}
