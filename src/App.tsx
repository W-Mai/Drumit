import { useMemo, useState } from "react";
import { dongCiDaCi } from "./notation/examples";
import { naTianWanShang } from "./notation/samples/page03-na-tian-wan-shang";
import { lanLianHua } from "./notation/samples/page04-lan-lian-hua";
import { popRock } from "./notation/samples/page07-pop-rock";
import { rockFusion } from "./notation/samples/page08-rock-fusion";
import { funkRock } from "./notation/samples/page09-funk-rock";
import { bluesVariations } from "./notation/samples/page10-blues";
import { parseDrumtab } from "./notation/parser";
import { layoutScore } from "./notation/layout";
import { DrumChart } from "./notation/renderer";
import { validateScore } from "./notation/validate";
import { cn } from "./lib/utils";

type ViewMode = "grid" | "staff";

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
  const [source, setSource] = useState(dongCiDaCi);
  const [view, setView] = useState<ViewMode>("grid");
  const [showLabels, setShowLabels] = useState(false);

  const parsed = useMemo(() => parseDrumtab(source), [source]);
  const validation = useMemo(
    () => validateScore(parsed.score),
    [parsed.score],
  );
  const diagnostics = [...parsed.diagnostics, ...validation];
  const hasErrors = diagnostics.some((d) => d.level === "error");
  const layout = useMemo(
    () =>
      layoutScore(parsed.score, {
        showLabels,
        expanded: false,
        width: 980,
      }),
    [parsed.score, showLabels],
  );

  return (
    <div className="mx-auto w-full max-w-[1500px] p-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="text-xs font-bold tracking-[0.18em] text-brand uppercase">
            Drumit
          </p>
          <h1 className="font-serif text-5xl leading-none tracking-tight text-ink">
            Drumtab visualizer
          </h1>
        </div>
        <p className="max-w-lg text-sm leading-relaxed text-stone-600">
          编辑 `.drumtab`，右侧即时渲染 PDF 风格的两行压缩鼓谱。拍内细分自动排成一拍一格的水平分布。
        </p>
      </header>

      <section className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(320px,0.9fr)_minmax(520px,1.6fr)]">
        <article className="overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-xl shadow-stone-900/5">
          <div className="flex items-center justify-between border-b border-stone-200 px-4 py-3">
            <h2 className="text-sm font-extrabold">Editor</h2>
            <select
              className="rounded-full border border-stone-200 bg-white px-3 py-1 text-xs font-bold text-stone-700 outline-none transition hover:bg-stone-900 hover:text-white"
              value=""
              onChange={(e) => {
                const found = samples.find((s) => s.label === e.target.value);
                if (found) setSource(found.src);
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
          <textarea
            value={source}
            onChange={(event) => setSource(event.target.value)}
            spellCheck={false}
            className="block w-full resize-y bg-stone-900 p-4 font-mono text-sm leading-relaxed text-amber-100 outline-none"
            rows={18}
          />
          <div className="border-t border-stone-200 px-4 py-3">
            <Diagnostics diagnostics={diagnostics} />
          </div>
          <details className="border-t border-stone-200 px-4 py-3 text-xs text-stone-500">
            <summary className="cursor-pointer font-extrabold text-stone-700">
              Parsed AST
            </summary>
            <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap break-words">
              {JSON.stringify(parsed.score, null, 2)}
            </pre>
          </details>
        </article>

        <article className="overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-xl shadow-stone-900/5">
          <div className="flex items-center justify-between border-b border-stone-200 px-4 py-3">
            <h2 className="text-sm font-extrabold">Preview</h2>
            <div className="flex flex-wrap gap-2">
              <ToggleButton
                active={view === "grid"}
                onClick={() => setView("grid")}
              >
                Grid
              </ToggleButton>
              <ToggleButton
                active={view === "staff"}
                onClick={() => setView("staff")}
                disabled
              >
                Staff (soon)
              </ToggleButton>
              <ToggleButton
                active={showLabels}
                onClick={() => setShowLabels((value) => !value)}
              >
                {showLabels ? "Hide labels" : "Show labels"}
              </ToggleButton>
            </div>
          </div>
          <div className="min-h-[420px] overflow-auto bg-stone-100/40 p-4">
            {hasErrors ? (
              <div className="grid min-h-[320px] place-items-center text-sm text-stone-500">
                Fix parse errors to update the preview.
              </div>
            ) : (
              <DrumChart layout={layout} showLabels={showLabels} />
            )}
          </div>
        </article>
      </section>
    </div>
  );
}

function ToggleButton({
  active,
  children,
  disabled,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-bold transition",
        active
          ? "border-stone-900 bg-stone-900 text-white"
          : "border-stone-200 bg-white text-stone-700 hover:bg-stone-900 hover:text-white",
        disabled && "cursor-not-allowed opacity-40 hover:bg-white hover:text-stone-700",
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
  if (diagnostics.length === 0) {
    return (
      <div className="rounded-lg border-l-4 border-emerald-400 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
        No diagnostics.
      </div>
    );
  }
  return (
    <ul className="space-y-1.5 text-xs">
      {diagnostics.map((d, i) => (
        <li
          key={i}
          className={cn(
            "rounded-lg border-l-4 px-3 py-2",
            d.level === "error"
              ? "border-red-400 bg-red-50 text-red-700"
              : "border-amber-400 bg-amber-50 text-amber-800",
          )}
        >
          <strong className="uppercase tracking-wide">{d.level}</strong> line{" "}
          {d.line}: {d.message}
        </li>
      ))}
    </ul>
  );
}
