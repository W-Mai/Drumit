import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { useI18n } from "../i18n/useI18n";
import {
  addSource,
  listSources,
  makeGithubSourceId,
  makeGiteeSourceId,
  makeGiteaSourceId,
  makeProvider,
  removeSource,
  type GitProvider,
  type ScoreIndex,
  type ScoreIndexEntry,
  type SourceConfig,
} from "../community";
import { Button } from "./ui";
import { type AuthState, buildAuthorizeUrl } from "../community/auth";
import { parseDrumtab } from "../notation/parser";

interface Props {
  open: boolean;
  onClose: () => void;
  onImport: (source: string) => void;
  auth: AuthState | null;
  onSignOut: () => void;
  currentSource?: string;
}

type LoadState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ok"; index: ScoreIndex }
  | { kind: "error"; message: string };

export function CommunityBrowse({ open, onClose, onImport, auth, onSignOut, currentSource }: Props) {
  const { t } = useI18n();
  const [sources, setSources] = useState<SourceConfig[]>(() => listSources());
  const [activeId, setActiveId] = useState<string | null>(
    () => listSources()[0]?.id ?? null,
  );
  const [load, setLoad] = useState<LoadState>({ kind: "idle" });
  const [selected, setSelected] = useState<ScoreIndexEntry | null>(null);
  const [adding, setAdding] = useState(false);
  const [uploading, setUploading] = useState(false);
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
              <div className="ml-auto flex items-center gap-2">
                {auth ? (
                  <>
                    <Button
                      variant="primary"
                      onClick={() => setUploading(true)}
                      disabled={!currentSource}
                    >
                      {t("community.upload.submit")}
                    </Button>
                    {auth.avatarUrl ? (
                      <img
                        src={auth.avatarUrl}
                        alt=""
                        className="size-5 rounded-full"
                      />
                    ) : null}
                    <span className="hidden text-[12px] font-semibold text-stone-700 sm:inline">
                      {auth.username}
                    </span>
                    <Button onClick={onSignOut}>
                      Sign out
                    </Button>
                  </>
                ) : (
                  <Button
                    onClick={() => {
                      window.location.href = buildAuthorizeUrl(
                        window.location.origin + window.location.pathname,
                      );
                    }}
                  >
                    Sign in with GitHub
                  </Button>
                )}
              </div>
            </div>

            <div className="relative flex min-h-0 flex-1">
              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4 sm:border-r sm:border-stone-200">
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
              <aside className="hidden min-h-0 overflow-y-auto px-6 py-4 sm:block sm:w-[320px]">
                {selected ? (
                  <ScoreDetail
                    entry={selected}
                    onOpen={() => handleOpenScore(selected)}
                    busy={openingPath === selected.path}
                  />
                ) : (
                  <p className="text-sm text-stone-500">
                    {t("community.score.no_selection")}
                  </p>
                )}
              </aside>
              <MobileDetailSheet
                entry={selected}
                onClose={() => setSelected(null)}
                onOpen={() =>
                  selected ? handleOpenScore(selected) : undefined
                }
                busy={selected ? openingPath === selected.path : false}
              />
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
      {uploading && auth && activeSource ? (
        <UploadDialog
          auth={auth}
          source={activeSource}
          currentSource={currentSource ?? ""}
          onClose={() => setUploading(false)}
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
  const [kind, setKind] = useState<"github" | "gitee" | "gitea">("github");
  const [host, setHost] = useState("");
  const valid =
    owner.trim() !== "" &&
    repo.trim() !== "" &&
    (kind !== "gitea" || host.trim() !== "");
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
          const b = branch.trim() || undefined;
          const dn = name.trim() || `${o}/${r}`;
          if (kind === "gitee") {
            onAdd({ id: makeGiteeSourceId(o, r), kind: "gitee", owner: o, repo: r, branch: b, displayName: dn });
          } else if (kind === "gitea") {
            const h = host.trim().replace(/^https?:\/\//, "");
            onAdd({ id: makeGiteaSourceId(h, o, r), kind: "gitea", host: h, owner: o, repo: r, branch: b, displayName: dn });
          } else {
            onAdd({ id: makeGithubSourceId(o, r), kind: "github", owner: o, repo: r, branch: b, displayName: dn });
          }
        }}
      >
        <h3 className="font-serif text-base font-semibold">
          {t("community.source.add_title")}
        </h3>
        <label className="block">
          <span className="mb-1 block text-[12px] font-semibold text-stone-700">
            {t("community.source.add_kind")}
          </span>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as typeof kind)}
            className="w-full rounded-md border border-stone-200 bg-white px-2.5 py-1.5 text-sm"
          >
            <option value="github">GitHub</option>
            <option value="gitee">Gitee</option>
            <option value="gitea">Gitea / Forgejo / Codeberg</option>
          </select>
        </label>
        {kind === "gitea" ? (
          <input
            type="text"
            value={host}
            onChange={(e) => setHost(e.target.value)}
            placeholder={t("community.source.add_host")}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            className="w-full rounded-md border border-stone-200 px-2.5 py-1.5 text-sm"
          />
        ) : null}
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

function MobileDetailSheet({
  entry,
  onClose,
  onOpen,
  busy,
}: {
  entry: ScoreIndexEntry | null;
  onClose: () => void;
  onOpen: () => void;
  busy: boolean;
}) {
  const { t } = useI18n();
  return (
    <AnimatePresence>
      {entry ? (
        <motion.div
          className="absolute inset-0 z-10 flex flex-col justify-end sm:hidden"
          initial={{ pointerEvents: "none" }}
          animate={{ pointerEvents: "auto" }}
          exit={{ pointerEvents: "none" }}
        >
          <motion.div
            className="absolute inset-0 bg-black/30"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          />
          <motion.div
            // drag handle gives users a draggable lip; releasing past
            // ~80px or with downward velocity dismisses, mirroring iOS.
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 80 || info.velocity.y > 500) onClose();
            }}
            className="
              relative max-h-[75dvh] overflow-y-auto rounded-t-2xl bg-white
              px-6 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-xl
            "
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 32 }}
          >
            <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-stone-300" />
            <button
              type="button"
              onClick={onClose}
              aria-label={t("common.close")}
              className="motion-press absolute top-3 right-3 flex size-7 items-center justify-center rounded-full text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-900"
            >
              <span className="text-base leading-none">×</span>
            </button>
            <ScoreDetail entry={entry} onOpen={onOpen} busy={busy} />
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function UploadDialog({
  auth,
  source,
  currentSource,
  onClose,
}: {
  auth: AuthState;
  source: SourceConfig;
  currentSource: string;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  const isOwner =
    source.kind !== "gitea" &&
    "owner" in source &&
    source.owner === auth.username;

  const parsed = useMemo(() => {
    try {
      const { score } = parseDrumtab(currentSource);
      const slug =
        score.slug ||
        score.title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "") ||
        "untitled";
      return { title: score.title || "Untitled", slug, path: `scores/${slug}.drumtab` };
    } catch {
      return { title: "Untitled", slug: "untitled", path: "scores/untitled.drumtab" };
    }
  }, [currentSource]);

  async function handleUpload() {
    if (!currentSource.trim() || !message.trim()) return;
    setStatus("uploading");
    try {
      const { path } = parsed;

      if (source.kind !== "github") {
        throw new Error("Upload currently only supports GitHub sources");
      }

      const { GitHubProvider } = await import(
        "../community/providers/GitHubProvider"
      );
      const provider = new GitHubProvider(source);

      if (isOwner) {
        await provider.upsertScore(
          path,
          currentSource,
          message,
          auth.accessToken,
        );
        setStatus("done");
      } else {
        const fork = await provider.ensureFork(auth.accessToken);
        const forkProvider = new GitHubProvider({
          ...source,
          id: `github:${fork.owner}/${fork.repo}`,
          owner: fork.owner,
          repo: fork.repo,
        });
        const branch = `drumit/${parsed.slug}-${Date.now()}`;
        const mainSha = await getMainBranchSha(
          fork.owner,
          fork.repo,
          source.branch ?? "main",
          auth.accessToken,
        );
        await createBranch(
          fork.owner,
          fork.repo,
          branch,
          mainSha,
          auth.accessToken,
        );
        await forkProvider.upsertScore(
          path,
          currentSource,
          message,
          auth.accessToken,
        );
        const pr = await provider.openPR(
          `🥁 ${parsed.title}`,
          message,
          `${fork.owner}:${branch}`,
          source.branch ?? "main",
          auth.accessToken,
        );
        setResultUrl(pr.url);
        setStatus("done");
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  }

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      className="bg-overlay-backdrop fixed inset-0 z-[60] flex items-center justify-center p-4"
      onClick={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
    >
      <motion.div
        className="w-full max-w-sm space-y-3 rounded-2xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ type: "spring", stiffness: 320, damping: 28 }}
      >
        <h3 className="font-serif text-base font-semibold">
          {t("community.upload.title")}
        </h3>

        {status === "idle" || status === "error" ? (
          <>
            <section className="space-y-1 rounded-lg border border-stone-200 bg-stone-50 p-3 text-[12px]">
              <div>
                <span className="font-semibold text-stone-600">
                  {t("community.upload.what_label")}
                </span>
                <p className="text-stone-700">
                  <span className="font-semibold">{parsed.title}</span>
                  <span className="ml-1 text-stone-400">({parsed.path})</span>
                </p>
                <p className="text-stone-400">{t("community.upload.what_desc")}</p>
              </div>
              <div className="border-t border-stone-200 pt-1">
                <span className="font-semibold text-stone-600">
                  {t("community.upload.where_label")}
                </span>
                <p className="text-stone-700">
                  {isOwner
                    ? t("community.upload.target_personal")
                    : t("community.upload.target_community")}
                  {" → "}
                  <span className="font-semibold">{source.displayName}</span>
                </p>
                <p className="mt-0.5 text-stone-400">
                  {isOwner
                    ? t("community.upload.flow_personal")
                    : t("community.upload.flow_community")}
                </p>
              </div>
            </section>
            <label className="block">
              <span className="mb-1 block text-[12px] font-semibold text-stone-700">
                {t("community.upload.message_label")}
              </span>
              <input
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={t("community.upload.message_placeholder")}
                className="w-full rounded-md border border-stone-200 px-2.5 py-1.5 text-sm"
              />
            </label>
            {status === "error" ? (
              <p className="text-[12px] text-red-600">
                {t("community.upload.error")}{errorMsg}
              </p>
            ) : null}
            <div className="flex justify-end gap-2 pt-1">
              <Button onClick={onClose}>{t("meta.cancel")}</Button>
              <Button
                variant="primary"
                onClick={handleUpload}
                disabled={!message.trim()}
              >
                {t("community.upload.submit")}
              </Button>
            </div>
          </>
        ) : status === "uploading" ? (
          <p className="py-4 text-center text-sm text-stone-600">
            {t("community.upload.uploading")}
          </p>
        ) : (
          <div className="space-y-2 py-4 text-center">
            <p className="text-sm font-semibold text-green-700">
              {t("community.upload.success")}
            </p>
            {resultUrl ? (
              <>
                <p className="text-[12px] text-stone-600">
                  {t("community.upload.pr_created")}
                </p>
                <a
                  href={resultUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[12px] text-blue-600 underline break-all"
                >
                  {resultUrl}
                </a>
              </>
            ) : (
              <p className="text-[12px] text-stone-600">
                {t("community.upload.committed")}
              </p>
            )}
            <div className="pt-2">
              <Button onClick={onClose}>{t("common.close")}</Button>
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

async function getMainBranchSha(
  owner: string,
  repo: string,
  branch: string,
  token: string,
): Promise<string> {
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${branch}`,
    { headers: { Authorization: `token ${token}` } },
  );
  if (!res.ok) throw new Error(`Failed to get branch SHA: ${res.status}`);
  const data = (await res.json()) as { object: { sha: string } };
  return data.object.sha;
}

async function createBranch(
  owner: string,
  repo: string,
  branch: string,
  sha: string,
  token: string,
): Promise<void> {
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/git/refs`,
    {
      method: "POST",
      headers: {
        Authorization: `token ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ref: `refs/heads/${branch}`, sha }),
    },
  );
  if (!res.ok) throw new Error(`Failed to create branch: ${res.status}`);
}
