import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { useI18n } from "../i18n/useI18n";
import { isValidSlug, slugify } from "../notation/slug";
import type { Score } from "../notation/types";
import { Button } from "./ui";

export interface ScoreMetaPatch {
  slug?: string;
  composer?: string[];
  arranger?: string;
  transcriber?: string;
  album?: string;
  sourceUrl?: string;
  license?: string;
  difficulty?: number;
  style?: string[];
  techniques?: string[];
  changelog?: string;
}

interface Props {
  open: boolean;
  score: Score;
  onClose: () => void;
  onSave: (patch: ScoreMetaPatch) => void;
}

interface FormState {
  slug: string;
  composer: string;
  arranger: string;
  transcriber: string;
  album: string;
  sourceUrl: string;
  license: string;
  difficulty: string;
  style: string;
  techniques: string;
  changelog: string;
}

function fromScore(score: Score): FormState {
  return {
    slug: score.slug ?? "",
    composer: (score.composer ?? []).join(", "),
    arranger: score.arranger ?? "",
    transcriber: score.transcriber ?? "",
    album: score.album ?? "",
    sourceUrl: score.sourceUrl ?? "",
    license: score.license ?? "",
    difficulty:
      score.difficulty !== undefined ? String(score.difficulty) : "",
    style: (score.style ?? []).join(", "),
    techniques: (score.techniques ?? []).join(", "),
    changelog: score.changelog ?? "",
  };
}

function splitMulti(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function toPatch(state: FormState): ScoreMetaPatch {
  const composer = splitMulti(state.composer);
  const style = splitMulti(state.style);
  const techniques = splitMulti(state.techniques);
  const diff = state.difficulty.trim();
  const diffN = diff === "" ? undefined : Number.parseInt(diff, 10);
  return {
    slug: state.slug.trim() || undefined,
    composer: composer.length > 0 ? composer : undefined,
    arranger: state.arranger.trim() || undefined,
    transcriber: state.transcriber.trim() || undefined,
    album: state.album.trim() || undefined,
    sourceUrl: state.sourceUrl.trim() || undefined,
    license: state.license.trim() || undefined,
    difficulty:
      diffN !== undefined && Number.isFinite(diffN) && diffN >= 1 && diffN <= 5
        ? diffN
        : undefined,
    style: style.length > 0 ? style : undefined,
    techniques: techniques.length > 0 ? techniques : undefined,
    changelog: state.changelog.trim() || undefined,
  };
}

export function MetaForm({ open, score, onClose, onSave }: Props) {
  const { t } = useI18n();
  const [state, setState] = useState<FormState>(() => fromScore(score));

  // Re-seed when the modal opens or the score identity changes; keeps
  // the form in sync with whichever doc is active without an effect that
  // overwrites mid-edit changes.
  const seed = useMemo(() => fromScore(score), [score]);
  const [seedKey, setSeedKey] = useState(JSON.stringify(seed));
  const nextKey = JSON.stringify(seed) + (open ? "|open" : "|closed");
  if (nextKey !== seedKey) {
    setSeedKey(nextKey);
    if (open) setState(seed);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const slugInvalid = state.slug.trim() !== "" && !isValidSlug(state.slug.trim());
  const slugPlaceholder = slugify(score.title) || "my-track";

  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-labelledby="meta-form-title"
          className="bg-overlay-backdrop fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
          onClick={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <motion.div
            className="
              flex w-full flex-col overflow-hidden bg-white shadow-xl
              max-h-[88dvh] rounded-t-2xl
              sm:max-h-[85vh] sm:max-w-2xl sm:rounded-2xl
              pb-[env(safe-area-inset-bottom)]
            "
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
          >
            <header className="flex items-start justify-between gap-4 border-b border-stone-200 px-6 py-4">
              <div>
                <p className="text-brand text-[11px] font-bold tracking-[0.18em] uppercase">
                  Drumit
                </p>
                <h2
                  id="meta-form-title"
                  className="text-ink font-serif text-xl leading-tight font-semibold tracking-tight"
                >
                  {t("meta.title")}
                </h2>
                <p className="mt-0.5 text-[12px] text-stone-500">
                  {t("meta.subtitle")}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label={t("common.close")}
                className="motion-press flex size-7 items-center justify-center rounded-full text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-900"
              >
                <span className="text-base leading-none">×</span>
              </button>
            </header>

            <form
              className="flex-1 space-y-5 overflow-y-auto px-6 py-5 text-sm"
              onSubmit={(e) => {
                e.preventDefault();
                if (slugInvalid) return;
                onSave(toPatch(state));
                onClose();
              }}
            >
              <Section title={t("meta.section.identity")}>
                <Row label={t("meta.field.slug")}>
                  <input
                    type="text"
                    value={state.slug}
                    onChange={(e) =>
                      setState({ ...state, slug: e.target.value })
                    }
                    placeholder={slugPlaceholder}
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                    className={inputCls}
                  />
                  {slugInvalid ? (
                    <p className="mt-1 text-[11px] text-red-600">
                      {t("meta.field.slug_invalid")}
                    </p>
                  ) : (
                    <p className="mt-1 text-[11px] text-stone-400">
                      {t("meta.field.slug_placeholder")}
                    </p>
                  )}
                </Row>
                <Row label={t("meta.field.composer")}>
                  <input
                    type="text"
                    value={state.composer}
                    onChange={(e) =>
                      setState({ ...state, composer: e.target.value })
                    }
                    placeholder={t("meta.field.composer_placeholder")}
                    className={inputCls}
                  />
                </Row>
                <Row label={t("meta.field.arranger")}>
                  <input
                    type="text"
                    value={state.arranger}
                    onChange={(e) =>
                      setState({ ...state, arranger: e.target.value })
                    }
                    className={inputCls}
                  />
                </Row>
                <Row label={t("meta.field.transcriber")}>
                  <input
                    type="text"
                    value={state.transcriber}
                    onChange={(e) =>
                      setState({ ...state, transcriber: e.target.value })
                    }
                    className={inputCls}
                  />
                </Row>
                <Row label={t("meta.field.album")}>
                  <input
                    type="text"
                    value={state.album}
                    onChange={(e) =>
                      setState({ ...state, album: e.target.value })
                    }
                    className={inputCls}
                  />
                </Row>
                <Row label={t("meta.field.source_url")}>
                  <input
                    type="url"
                    value={state.sourceUrl}
                    onChange={(e) =>
                      setState({ ...state, sourceUrl: e.target.value })
                    }
                    placeholder={t("meta.field.source_url_placeholder")}
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                    className={inputCls}
                  />
                </Row>
              </Section>

              <Section title={t("meta.section.classification")}>
                <Row label={t("meta.field.license")}>
                  <input
                    type="text"
                    value={state.license}
                    onChange={(e) =>
                      setState({ ...state, license: e.target.value })
                    }
                    placeholder={t("meta.field.license_placeholder")}
                    list="meta-license-suggestions"
                    className={inputCls}
                  />
                  <datalist id="meta-license-suggestions">
                    <option value="CC-BY-4.0" />
                    <option value="CC-BY-SA-4.0" />
                    <option value="CC-BY-NC-4.0" />
                    <option value="CC0-1.0" />
                    <option value="MIT" />
                    <option value="Public Domain" />
                    <option value="Unknown" />
                  </datalist>
                </Row>
                <Row label={t("meta.field.difficulty")}>
                  <input
                    type="number"
                    min={1}
                    max={5}
                    step={1}
                    value={state.difficulty}
                    onChange={(e) =>
                      setState({ ...state, difficulty: e.target.value })
                    }
                    className={`${inputCls} max-w-[5rem]`}
                  />
                </Row>
                <Row label={t("meta.field.style")}>
                  <input
                    type="text"
                    value={state.style}
                    onChange={(e) =>
                      setState({ ...state, style: e.target.value })
                    }
                    placeholder={t("meta.field.style_placeholder")}
                    className={inputCls}
                  />
                </Row>
                <Row label={t("meta.field.techniques")}>
                  <input
                    type="text"
                    value={state.techniques}
                    onChange={(e) =>
                      setState({ ...state, techniques: e.target.value })
                    }
                    placeholder={t("meta.field.techniques_placeholder")}
                    className={inputCls}
                  />
                </Row>
              </Section>

              <Section title={t("meta.section.history")}>
                <Row label={t("meta.field.changelog")}>
                  <textarea
                    value={state.changelog}
                    onChange={(e) =>
                      setState({ ...state, changelog: e.target.value })
                    }
                    placeholder={t("meta.field.changelog_placeholder")}
                    rows={3}
                    className={`${inputCls} resize-y`}
                  />
                </Row>
              </Section>

              <div className="flex items-center justify-end gap-2 border-t border-stone-200 pt-4">
                <Button type="button" onClick={onClose}>
                  {t("meta.cancel")}
                </Button>
                <Button type="submit" variant="primary" disabled={slugInvalid}>
                  {t("meta.save")}
                </Button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}

const inputCls =
  "w-full rounded-md border border-stone-200 bg-white px-2.5 py-1.5 text-sm text-stone-900 outline-none transition-colors focus:border-stone-400 focus:bg-stone-50";

function Section({
  title,
  children,
}: {
  title: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h3 className="text-[11px] font-extrabold tracking-wide text-stone-500 uppercase">
        {title}
      </h3>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Row({
  label,
  children,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] font-semibold text-stone-700">
        {label}
      </span>
      {children}
    </label>
  );
}
