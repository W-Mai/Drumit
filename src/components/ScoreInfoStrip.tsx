import { useI18n } from "../i18n/useI18n";
import type { Score } from "../notation/types";

interface Props {
  score: Score;
  onEdit: () => void;
}

// Without this strip the editor never surfaces composer/license/style;
// the user only sees bars. Click anywhere → MetaForm opens for editing.
export function ScoreInfoStrip({ score, onEdit }: Props) {
  const { t } = useI18n();
  const composer = (score.composer ?? []).join(", ");
  const styles = score.style ?? [];
  const techniques = score.techniques ?? [];
  const subtitleBits = [
    composer,
    score.album,
    score.arranger ? `arr. ${score.arranger}` : "",
  ].filter(Boolean);

  return (
    <button
      type="button"
      onClick={onEdit}
      title={t("header.score_info")}
      className="
        motion-press group flex w-full min-w-0 items-center gap-3 rounded-lg
        border border-stone-200 bg-white px-3 py-2 text-left transition-colors
        hover:border-stone-300 hover:bg-stone-50
      "
    >
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-baseline gap-2">
          <h2 className="truncate font-serif text-base font-semibold text-stone-900 sm:text-lg">
            {score.title || t("editor.untitled")}
          </h2>
          {score.difficulty ? (
            <span className="shrink-0 text-[11px] font-bold tracking-wide text-amber-700">
              {"★".repeat(score.difficulty)}
            </span>
          ) : null}
        </div>
        {subtitleBits.length > 0 ? (
          <p className="truncate text-[11px] text-stone-500">
            {subtitleBits.join(" · ")}
          </p>
        ) : null}
      </div>

      <div className="hidden min-w-0 shrink items-center gap-1 sm:flex">
        {styles.slice(0, 3).map((s) => (
          <span
            key={s}
            className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-semibold text-stone-600"
          >
            {s}
          </span>
        ))}
        {techniques.slice(0, 2).map((s) => (
          <span
            key={s}
            className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700"
          >
            {s}
          </span>
        ))}
      </div>

      {score.license ? (
        <span className="hidden shrink-0 text-[10px] font-semibold tracking-wide text-stone-400 uppercase md:inline">
          {score.license}
        </span>
      ) : null}

      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="size-4 shrink-0 text-stone-400 transition-colors group-hover:text-stone-700"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
      </svg>
    </button>
  );
}
