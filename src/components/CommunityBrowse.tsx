import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { useI18n } from "../i18n/useI18n";
import {
  addSource,
  listSources,
  makeGithubSourceId,
  makeProvider,
  removeSource,
  type GitProvider,
  type ScoreIndex,
  type ScoreIndexEntry,
  type SourceConfig,
} from "../community";
import { Button } from "./ui";

interface Props {
  open: boolean;
  onClose: () => void;
  onImport: (source: string) => void;
}

type LoadState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ok"; index: ScoreIndex }
  | { kind: "error"; message: string };

export function CommunityBrowse({ open, onClose, onImport }: Props) {
  const { t } = useI18n();
  const [sources, setSources] = useState<SourceConfig[]>(() => listSources());
  const [activeId, setActiveId] = useState<string | null>(
    () => listSources()[0]?.id ?? null,
  );
  const [load, setLoad] = useState<LoadState>({ kind: "idle" });
  const [selected, setSelected] = useState<ScoreIndexEntry | null>(null);
  const [adding, setAdding] = useState(false);
  const [openingPath, setOpeningPath] = useState<string | null>(null);

  const activeSource = useMemo(
    () => sources.find((s) => s.id === activeId) ?? null,
    [sources, activeId],
  );

  // Close on Esc; mirror AboutModal / MetaForm pattern.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Re-fetch index whenever the active source changes while the modal is
  // open. Skipping when closed avoids burning network on a hidden modal.
  // setState calls happen inside an async IIFE so they fire after the
  // effect body returns (satisfies react-hooks/set-state-in-effect).
  useEffect(() => {
    if (!open || !activeSource) return;
    let cancelled = false;
    const provider = makeProvider(activeSource);
    void (async () => {
      if (cancelled) return;
      setLoad({ kind: "loading" });
      setSelected(null);
      try {
        const index = await provider.loadIndex();
        if (!cancelled) setLoad({ kind: "ok", index });
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        setLoad({ kind: "error", message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, activeSource]);

  function handleAdd(config: SourceConfig) {
    const next = addSource(config);
    setSources(next);
    setActiveId(config.id);
    setAdding(false);
  }

  function handleRemove(id: string) {
    const next = removeSource(id);
    setSources(next);
    if (activeId === id) {
      setActiveId(next[0]?.id ?? null);
    }
  }

  async function handleOpenScore(entry: ScoreIndexEntry) {
    if (!activeSource) return;
    setOpeningPath(entry.path);
    try {
      const provider: GitProvider = makeProvider(activeSource);
      const { source } = await provider.loadScore(entry.path);
      onImport(source);
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setLoad({ kind: "error", message });
    } finally {
      setOpeningPath(null);
    }
  }

  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-labelledby="community-title"
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
              h-[92dvh] rounded-t-2xl
              sm:h-[88vh] sm:max-w-5xl sm:rounded-2xl
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
                  id="community-title"
                  className="text-ink font-serif text-xl leading-tight font-semibold tracking-tight"
                >
                  {t("community.title")}
                </h2>
                <p className="mt-0.5 text-[12px] text-stone-500">
                  {t("community.subtitle")}
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

            <div className="flex flex-wrap items-center gap-2 border-b border-stone-200 px-6 py-3 text-sm">
              <label className="flex items-center gap-2">
                <span className="text-[12px] font-semibold text-stone-600">
                  {t("community.source.label")}
                </span>
                <select
                  value={activeId ?? ""}
                  onChange={(e) => setActiveId(e.target.value || null)}
                  className="rounded-md border border-stone-200 bg-white px-2 py-1 text-sm"
                >
                  {sources.length === 0 ? (
                    <option value="">—</option>
                  ) : null}
                  {sources.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.displayName}
                    </option>
                  ))}
                </select>
              </label>
              <Button onClick={() => setAdding(true)}>
                {t("community.source.add")}
              </Button>
              {activeSource ? (
                <Button
                  variant="danger"
                  onClick={() => handleRemove(activeSource.id)}
                >
                  {t("community.source.remove")}
                </Button>
              ) : null}
            </div>

            <div className="flex min-h-0 flex-1">
              {/* Below sm: list and detail are mutually exclusive — picking
                  a score swaps the list for its detail with a back button.
                  At sm and above the two share the modal as before. */}
              <div
                className={`min-h-0 flex-1 overflow-y-auto px-6 py-4 sm:border-r sm:border-stone-200 ${
                  selected ? "hidden sm:block" : "block"
                }`}
              >
                <ScoreList
                  load={load}
                  onSelect={(s) => setSelected(s)}
                  selected={selected}
                  onRetry={() => {
                    if (!activeSource) return;
                    setLoad({ kind: "loading" });
                    makeProvider(activeSource)
                      .loadIndex()
                      .then((index) => setLoad({ kind: "ok", index }))
                      .catch((err: unknown) => {
                        const message =
                          err instanceof Error ? err.message : String(err);
                        setLoad({ kind: "error", message });
                      });
                  }}
                />
              </div>
              <aside
                className={`min-h-0 overflow-y-auto px-6 py-4 sm:block sm:w-[320px] ${
                  selected ? "flex-1 sm:flex-none" : "hidden"
                }`}
              >
                {selected ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setSelected(null)}
                      className="motion-press mb-3 -ml-1 inline-flex items-center rounded-md px-1 py-1 text-[12px] font-semibold text-stone-600 hover:bg-stone-100 hover:text-stone-900 sm:hidden"
                    >
                      {t("community.back_to_list")}
                    </button>
                    <ScoreDetail
                      entry={selected}
                      onOpen={() => handleOpenScore(selected)}
                      busy={openingPath === selected.path}
                    />
                  </>
                ) : (
                  <p className="hidden text-sm text-stone-500 sm:block">
                    {t("community.score.no_selection")}
                  </p>
                )}
              </aside>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
      {adding ? (
        <AddSourceDialog
          onCancel={() => setAdding(false)}
          onAdd={handleAdd}
        />
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}

function ScoreList({
  load,
  onSelect,
  selected,
  onRetry,
}: {
  load: LoadState;
  onSelect: (entry: ScoreIndexEntry) => void;
  selected: ScoreIndexEntry | null;
  onRetry: () => void;
}) {
  const { t } = useI18n();
  if (load.kind === "loading" || load.kind === "idle") {
    return (
      <p className="text-sm text-stone-500">{t("community.loading")}</p>
    );
  }
  if (load.kind === "error") {
    return (
      <div className="space-y-2 text-sm text-red-700">
        <p>
          {t("community.error_prefix")}
          {load.message}
        </p>
        <Button onClick={onRetry}>{t("community.retry")}</Button>
      </div>
    );
  }
  if (load.index.scores.length === 0) {
    return <p className="text-sm text-stone-500">{t("community.empty")}</p>;
  }
  return (
    <ul className="space-y-1">
      {load.index.scores.map((s) => (
        <li key={s.slug}>
          <button
            type="button"
            onClick={() => onSelect(s)}
            className={`motion-press w-full rounded-md border px-3 py-2 text-left text-sm transition-colors ${
              selected?.slug === s.slug
                ? "border-stone-400 bg-stone-50"
                : "border-stone-200 bg-white hover:bg-stone-50"
            }`}
          >
            <div className="font-semibold text-stone-900">{s.title}</div>
            <div className="mt-0.5 text-[12px] text-stone-500">
              {(s.composer ?? []).join(", ")}
              {s.difficulty ? ` · ★${s.difficulty}` : ""}
            </div>
            {s.style && s.style.length > 0 ? (
              <div className="mt-1 flex flex-wrap gap-1">
                {s.style.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-semibold text-stone-600"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            ) : null}
          </button>
        </li>
      ))}
    </ul>
  );
}

function ScoreDetail({
  entry,
  onOpen,
  busy,
}: {
  entry: ScoreIndexEntry;
  onOpen: () => void;
  busy: boolean;
}) {
  const { t } = useI18n();
  return (
    <div className="space-y-3 text-sm text-stone-700">
      <h3 className="text-ink font-serif text-lg leading-tight font-semibold">
        {entry.title}
      </h3>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12px]">
        {entry.composer && entry.composer.length > 0 ? (
          <>
            <dt className="text-stone-500">{t("community.score.composer")}</dt>
            <dd>{entry.composer.join(", ")}</dd>
          </>
        ) : null}
        {entry.album ? (
          <>
            <dt className="text-stone-500">{t("community.score.album")}</dt>
            <dd>{entry.album}</dd>
          </>
        ) : null}
        {entry.license ? (
          <>
            <dt className="text-stone-500">{t("community.score.license")}</dt>
            <dd>{entry.license}</dd>
          </>
        ) : null}
        {entry.tempo ? (
          <>
            <dt className="text-stone-500">{t("community.score.tempo")}</dt>
            <dd>{entry.tempo}</dd>
          </>
        ) : null}
        {entry.meter ? (
          <>
            <dt className="text-stone-500">{t("community.score.meter")}</dt>
            <dd>{entry.meter}</dd>
          </>
        ) : null}
        {entry.difficulty ? (
          <>
            <dt className="text-stone-500">
              {t("community.score.difficulty")}
            </dt>
            <dd>★{entry.difficulty}</dd>
          </>
        ) : null}
        {entry.updatedAt ? (
          <>
            <dt className="text-stone-500">
              {t("community.score.updated_at")}
            </dt>
            <dd>{entry.updatedAt}</dd>
          </>
        ) : null}
      </dl>
      {entry.style && entry.style.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {entry.style.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-semibold text-stone-600"
            >
              {tag}
            </span>
          ))}
        </div>
      ) : null}
      {entry.techniques && entry.techniques.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {entry.techniques.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700"
            >
              {tag}
            </span>
          ))}
        </div>
      ) : null}
      <div className="pt-2">
        <Button variant="primary" onClick={onOpen} disabled={busy}>
          {busy ? t("community.loading") : t("community.score.open")}
        </Button>
        <p className="mt-2 text-[11px] text-stone-400">
          {t("community.score.upload_v2_hint")}
        </p>
      </div>
    </div>
  );
}

function AddSourceDialog({
  onCancel,
  onAdd,
}: {
  onCancel: () => void;
  onAdd: (config: SourceConfig) => void;
}) {
  const { t } = useI18n();
  const [owner, setOwner] = useState("");
  const [repo, setRepo] = useState("");
  const [branch, setBranch] = useState("");
  const [name, setName] = useState("");
  const valid = owner.trim() !== "" && repo.trim() !== "";
  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      className="bg-overlay-backdrop fixed inset-0 z-[60] flex items-center justify-center p-4"
      onClick={onCancel}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
    >
      <motion.form
        className="w-full max-w-sm space-y-3 rounded-2xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ type: "spring", stiffness: 320, damping: 28 }}
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          const o = owner.trim();
          const r = repo.trim();
          onAdd({
            id: makeGithubSourceId(o, r),
            kind: "github",
            owner: o,
            repo: r,
            branch: branch.trim() || undefined,
            displayName: name.trim() || `${o}/${r}`,
          });
        }}
      >
        <h3 className="font-serif text-base font-semibold">
          {t("community.source.add_title")}
        </h3>
        <input
          type="text"
          value={owner}
          onChange={(e) => setOwner(e.target.value)}
          placeholder={t("community.source.add_owner")}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          className="w-full rounded-md border border-stone-200 px-2.5 py-1.5 text-sm"
        />
        <input
          type="text"
          value={repo}
          onChange={(e) => setRepo(e.target.value)}
          placeholder={t("community.source.add_repo")}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          className="w-full rounded-md border border-stone-200 px-2.5 py-1.5 text-sm"
        />
        <input
          type="text"
          value={branch}
          onChange={(e) => setBranch(e.target.value)}
          placeholder={t("community.source.add_branch")}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          className="w-full rounded-md border border-stone-200 px-2.5 py-1.5 text-sm"
        />
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("community.source.add_name")}
          className="w-full rounded-md border border-stone-200 px-2.5 py-1.5 text-sm"
        />
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" onClick={onCancel}>
            {t("meta.cancel")}
          </Button>
          <Button type="submit" variant="primary" disabled={!valid}>
            {t("community.source.add")}
          </Button>
        </div>
      </motion.form>
    </motion.div>
  );
}
