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
  const [showSubmissions, setShowSubmissions] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
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
  }, [open, activeSource, refreshKey]);

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
              <Button
                onClick={() => setRefreshKey((k) => k + 1)}
                disabled={load.kind === "loading"}
                title={t("community.source.refresh")}
              >
                {t("community.source.refresh")}
              </Button>
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
                    <Button onClick={() => setShowSubmissions(true)}>
                      {t("community.my_submissions")}
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
      {showSubmissions && auth && activeSource ? (
        <MySubmissions
          auth={auth}
          source={activeSource}
          onClose={() => setShowSubmissions(false)}
        />
      ) : null}
      {uploading && auth && activeSource ? (
        <UploadDialog
          auth={auth}
          source={activeSource}
          currentSource={currentSource ?? ""}
          onClose={(published) => {
            setUploading(false);
            if (published) setRefreshKey((k) => k + 1);
          }}
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
  onClose: (published: boolean) => void;
}) {
  const { t } = useI18n();
  const parsed = parseUploadMeta(currentSource);
  const isOwner =
    source.kind !== "gitea" &&
    "owner" in source &&
    source.owner === auth.username;

  const [message, setMessage] = useState(
    () => `🥁 Add ${parsed.title}`,
  );
  const [status, setStatus] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultPrNumber, setResultPrNumber] = useState<number | null>(null);
  const [prClosed, setPrClosed] = useState(false);
  const [closingPr, setClosingPr] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  type StepState = "pending" | "running" | "done" | "skipped" | "error";
  interface Step { key: string; state: StepState; detail?: string }
  const [steps, setSteps] = useState<Step[]>([]);

  function updateStep(key: string, state: StepState, detail?: string) {
    setSteps((prev) =>
      prev.map((s) => (s.key === key ? { ...s, state, detail: detail ?? s.detail } : s)),
    );
  }

  async function handleUpload() {
    if (!currentSource.trim() || !message.trim()) return;

    if (source.kind !== "github") {
      setErrorMsg("Upload currently only supports GitHub sources");
      setStatus("error");
      return;
    }

    const { path } = parsed;
    const { GitHubProvider } = await import(
      "../community/providers/GitHubProvider"
    );
    const provider = new GitHubProvider(source);

    if (isOwner) {
      setSteps([
        { key: "check", state: "pending" },
        { key: "commit", state: "pending" },
      ]);
      setStatus("uploading");
      try {
        updateStep("check", "running");
        const remoteContent = await fetchRemoteFileContent(
          source.owner, source.repo, path, source.branch ?? "main", auth.accessToken,
        );
        if (remoteContent !== null && remoteContent.trim() === currentSource.trim()) {
          updateStep("check", "skipped", t("community.upload.step.no_change"));
          updateStep("commit", "skipped");
          setStatus("done");
          return;
        }
        updateStep("check", "done",
          remoteContent === null
            ? t("community.upload.step.new_file")
            : t("community.upload.step.content_changed"),
        );
        updateStep("commit", "running");
        await provider.upsertScore(path, currentSource, message, auth.accessToken);
        updateStep("commit", "done");
        setStatus("done");
      } catch (err) {
        setSteps((prev) =>
          prev.map((s) => (s.state === "running" ? { ...s, state: "error" } : s)),
        );
        setErrorMsg(err instanceof Error ? err.message : String(err));
        setStatus("error");
      }
    } else {
      setSteps([
        { key: "fork", state: "pending" },
        { key: "sync", state: "pending" },
        { key: "check", state: "pending" },
        { key: "branch", state: "pending" },
        { key: "commit", state: "pending" },
        { key: "pr", state: "pending" },
      ]);
      setStatus("uploading");
      try {
        updateStep("fork", "running");
        const fork = await provider.ensureFork(auth.accessToken);
        updateStep(
          "fork",
          fork.alreadyExisted ? "skipped" : "done",
          fork.alreadyExisted ? t("community.upload.step.fork_exists") : undefined,
        );

        updateStep("sync", "running");
        await syncForkWithUpstream(fork.owner, fork.repo, source.branch ?? "main", auth.accessToken);
        updateStep("sync", "done");

        updateStep("check", "running");
        const remoteContent = await fetchRemoteFileContent(
          source.kind === "github" ? source.owner : fork.owner,
          source.kind === "github" ? source.repo : fork.repo,
          path,
          source.branch ?? "main",
          auth.accessToken,
        );
        if (remoteContent !== null && remoteContent.trim() === currentSource.trim()) {
          updateStep("check", "skipped", t("community.upload.step.no_change"));
          updateStep("branch", "skipped");
          updateStep("commit", "skipped");
          updateStep("pr", "skipped");
          setStatus("done");
          return;
        }
        updateStep(
          "check",
          "done",
          remoteContent === null
            ? t("community.upload.step.new_file")
            : t("community.upload.step.content_changed"),
        );

        const forkProvider = new GitHubProvider({
          ...source,
          id: `github:${fork.owner}/${fork.repo}`,
          owner: fork.owner,
          repo: fork.repo,
        });

        updateStep("branch", "running");
        const branch = `drumit/${parsed.slug}`;
        const mainSha = await getMainBranchSha(
          fork.owner, fork.repo, source.branch ?? "main", auth.accessToken,
        );
        await createBranch(fork.owner, fork.repo, branch, mainSha, auth.accessToken);
        updateStep("branch", "done", branch);

        updateStep("commit", "running");
        await forkProvider.upsertScore(path, currentSource, message, auth.accessToken, branch);
        updateStep("commit", "done", path);

        updateStep("pr", "running");
        const existingPr = await findOpenPR(
          source.owner, source.repo,
          `${fork.owner}:${branch}`, auth.accessToken,
        );
        if (existingPr) {
          updateStep("pr", "done",
            t("community.upload.step.pr_updated").replace("{number}", String(existingPr.number)),
          );
          setResultUrl(existingPr.html_url);
          setResultPrNumber(existingPr.number);
        } else {
          const pr = await provider.openPR(
            `🥁 ${parsed.title}`, message,
            `${fork.owner}:${branch}`, source.branch ?? "main", auth.accessToken,
          );
          updateStep("pr", "done");
          setResultUrl(pr.url);
          const prNum = parseInt(pr.url.split("/").pop() ?? "0", 10);
          if (prNum) setResultPrNumber(prNum);
        }
        setStatus("done");
      } catch (err) {
        setSteps((prev) =>
          prev.map((s) => (s.state === "running" ? { ...s, state: "error" } : s)),
        );
        setErrorMsg(err instanceof Error ? err.message : String(err));
        setStatus("error");
      }
    }
  }

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
       className="bg-overlay-backdrop fixed inset-0 z-[60] flex items-center justify-center p-4"
       onClick={() => onClose(status === "done")}
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

        {status === "idle" ? (
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
            <div className="flex justify-end gap-2 pt-1">
              <Button onClick={() => onClose(false)}>{t("meta.cancel")}</Button>
              <Button
                variant="primary"
                onClick={handleUpload}
                disabled={!message.trim()}
              >
                {t("community.upload.submit")}
              </Button>
            </div>
          </>
        ) : (
          <>
            <StepList steps={steps} />
            {status === "error" ? (
              <p className="mt-2 text-[12px] text-red-600">
                {t("community.upload.error")}{errorMsg}
              </p>
            ) : null}
            {status === "done" ? (
              <div className="mt-3 space-y-2 text-center">
                {steps.some((s) => s.key === "commit" && s.state === "done") ? (
                  <>
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
                        {resultPrNumber && !prClosed ? (
                          <button
                            type="button"
                            disabled={closingPr}
                            onClick={async () => {
                              if (source.kind !== "github") return;
                              setClosingPr(true);
                              try {
                                await closePR(source.owner, source.repo, resultPrNumber, auth.accessToken);
                                setPrClosed(true);
                              } catch { /* ignore */ }
                              setClosingPr(false);
                            }}
                            className="mt-1 text-[11px] text-red-600 underline hover:text-red-800"
                          >
                            {closingPr ? t("community.upload.closing_pr") : t("community.upload.close_pr")}
                          </button>
                        ) : null}
                        {prClosed ? (
                          <p className="mt-1 text-[11px] text-stone-500">{t("community.upload.pr_closed")}</p>
                        ) : null}
                      </>
                    ) : (
                      <p className="text-[12px] text-stone-600">
                        {t("community.upload.committed")}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-stone-500">
                    {t("community.upload.nothing_changed")}
                  </p>
                )}
              </div>
            ) : null}
            <div className="flex justify-end pt-2">
              <Button onClick={() => onClose(status === "done")}>
                {status === "done" ? t("common.close") : t("meta.cancel")}
              </Button>
            </div>
          </>
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
  for (let i = 0; i < 15; i += 1) {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${branch}`,
      { headers: { Authorization: `token ${token}` } },
    );
    if (res.ok) {
      const data = (await res.json()) as { object: { sha: string } };
      return data.object.sha;
    }
    if (i < 14) await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`Branch ${branch} not ready after 30s`);
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
  // 422 = branch already exists (idempotent for re-uploads to same slug)
  if (!res.ok && res.status !== 422) {
    throw new Error(`Failed to create branch: ${res.status}`);
  }
}

async function syncForkWithUpstream(
  owner: string,
  repo: string,
  branch: string,
  token: string,
): Promise<void> {
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/merge-upstream`,
    {
      method: "POST",
      headers: {
        Authorization: `token ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ branch }),
    },
  );
  // 409 = already up to date (not an error)
  if (!res.ok && res.status !== 409) {
    throw new Error(`Failed to sync fork: ${res.status}`);
  }
}

const STEP_LABELS: Record<string, { zh: string; en: string }> = {
  fork: { zh: "Fork 仓库", en: "Fork repository" },
  sync: { zh: "同步 Fork 到最新", en: "Sync fork to latest" },
  check: { zh: "检查远端文件", en: "Check remote file" },
  branch: { zh: "创建分支", en: "Create branch" },
  commit: { zh: "提交文件", en: "Commit file" },
  pr: { zh: "创建 Pull Request", en: "Create Pull Request" },
};

const STEP_ICON: Record<string, string> = {
  pending: "○",
  running: "◎",
  done: "✓",
  skipped: "⊘",
  error: "✗",
};

const STEP_COLOR: Record<string, string> = {
  pending: "text-stone-300",
  running: "text-amber-500",
  done: "text-green-600",
  skipped: "text-stone-400",
  error: "text-red-600",
};

function StepList({ steps }: { steps: Array<{ key: string; state: string; detail?: string }> }) {
  const { t } = useI18n();
  if (steps.length === 0) return null;
  return (
    <ul className="space-y-1.5 py-2">
      {steps.map((step) => (
        <li key={step.key} className="flex items-start gap-2 text-[12px]">
          <span className={`mt-px font-mono font-bold ${STEP_COLOR[step.state] ?? "text-stone-400"}`}>
            {STEP_ICON[step.state] ?? "○"}
          </span>
          <div className="min-w-0">
            <span className={step.state === "pending" ? "text-stone-400" : "text-stone-700"}>
              {t(`community.upload.step.${step.key}` as never) ||
                STEP_LABELS[step.key]?.en ||
                step.key}
            </span>
            {step.detail ? (
              <span className="ml-1 text-stone-400 break-all">{step.detail}</span>
            ) : null}
             {step.state === "running" ? (
              <span className="ml-1 animate-pulse text-amber-500">…</span>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

function parseUploadMeta(source: string): {
  title: string;
  slug: string;
  path: string;
} {
  try {
    const { score } = parseDrumtab(source);
    const slug =
      score.slug ||
      score.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") ||
      "untitled";
    return {
      title: score.title || "Untitled",
      slug,
      path: `scores/${slug}.drumtab`,
    };
  } catch {
    return { title: "Untitled", slug: "untitled", path: "scores/untitled.drumtab" };
  }
}

async function fetchRemoteFileContent(
  owner: string,
  repo: string,
  path: string,
  branch: string,
  token: string,
): Promise<string | null> {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `token ${token}`,
      Accept: "application/vnd.github.raw+json",
    },
  });
  if (!res.ok) return null;
  return res.text();
}

async function findOpenPR(
  owner: string,
  repo: string,
  head: string,
  token: string,
): Promise<{ number: number; html_url: string } | null> {
  const url = `https://api.github.com/repos/${owner}/${repo}/pulls?head=${encodeURIComponent(head)}&state=open`;
  const res = await fetch(url, {
    headers: { Authorization: `token ${token}` },
  });
  if (!res.ok) return null;
  const prs = (await res.json()) as Array<{ number: number; html_url: string }>;
  return prs.length > 0 ? prs[0] : null;
}

async function closePR(
  owner: string,
  repo: string,
  prNumber: number,
  token: string,
): Promise<void> {
  await fetch(
    `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `token ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ state: "closed" }),
    },
  );
}

interface PREntry {
  number: number;
  title: string;
  html_url: string;
  state: string;
  merged_at: string | null;
  created_at: string;
}

function MySubmissions({
  auth,
  source,
  onClose,
}: {
  auth: AuthState;
  source: SourceConfig;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [prs, setPrs] = useState<PREntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [closingId, setClosingId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (source.kind !== "github") { if (!cancelled) setLoading(false); return; }
      try {
        const [openRes, closedRes] = await Promise.all([
          fetch(
            `https://api.github.com/repos/${source.owner}/${source.repo}/pulls?state=open&per_page=50`,
            { headers: { Authorization: `token ${auth.accessToken}` } },
          ),
          fetch(
            `https://api.github.com/repos/${source.owner}/${source.repo}/pulls?state=closed&per_page=50`,
            { headers: { Authorization: `token ${auth.accessToken}` } },
          ),
        ]);
        const openPrs = openRes.ok ? ((await openRes.json()) as PREntry[]) : [];
        const closedPrs = closedRes.ok ? ((await closedRes.json()) as PREntry[]) : [];
        const all = [...openPrs, ...closedPrs]
          .filter((pr) => pr.title.startsWith("🥁"))
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        if (!cancelled) setPrs(all);
      } catch { /* ignore */ }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [source, auth.accessToken]);

  async function handleClose(prNumber: number) {
    if (source.kind !== "github") return;
    setClosingId(prNumber);
    await closePR(source.owner, source.repo, prNumber, auth.accessToken);
    setPrs((prev) => prev.map((p) => (p.number === prNumber ? { ...p, state: "closed" } : p)));
    setClosingId(null);
  }

  const open = prs.filter((p) => p.state === "open");
  const merged = prs.filter((p) => p.state === "closed" && p.merged_at);
  const closed = prs.filter((p) => p.state === "closed" && !p.merged_at);

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
        className="max-h-[80dvh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ type: "spring", stiffness: 320, damping: 28 }}
      >
        <h3 className="mb-3 font-serif text-base font-semibold">
          {t("community.submissions.title")}
        </h3>
        {loading ? (
          <p className="py-4 text-center text-sm text-stone-500">
            {t("community.submissions.loading")}
          </p>
        ) : prs.length === 0 ? (
          <p className="py-4 text-center text-sm text-stone-500">
            {t("community.submissions.empty")}
          </p>
        ) : (
          <div className="space-y-4">
            {open.length > 0 ? (
              <PRSection
                label={t("community.submissions.open")}
                prs={open}
                color="text-amber-700 bg-amber-50"
                onClose={handleClose}
                closingId={closingId}
              />
            ) : null}
            {merged.length > 0 ? (
              <PRSection
                label={t("community.submissions.merged")}
                prs={merged}
                color="text-green-700 bg-green-50"
              />
            ) : null}
            {closed.length > 0 ? (
              <PRSection
                label={t("community.submissions.closed")}
                prs={closed}
                color="text-stone-500 bg-stone-50"
              />
            ) : null}
          </div>
        )}
        <div className="mt-4 flex justify-end">
          <Button onClick={onClose}>{t("common.close")}</Button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function PRSection({
  label,
  prs,
  color,
  onClose: onClosePR,
  closingId,
}: {
  label: string;
  prs: PREntry[];
  color: string;
  onClose?: (n: number) => void;
  closingId?: number | null;
}) {
  const { t } = useI18n();
  return (
    <div>
      <h4 className={`mb-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${color}`}>
        {label} ({prs.length})
      </h4>
      <ul className="space-y-1">
        {prs.map((pr) => (
          <li
            key={pr.number}
            className="flex items-center justify-between gap-2 rounded-md border border-stone-200 px-3 py-2 text-[12px]"
          >
            <div className="min-w-0">
              <a
                href={pr.html_url}
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-stone-900 underline decoration-stone-300 hover:decoration-stone-700"
              >
                #{pr.number} {pr.title}
              </a>
              <p className="text-[10px] text-stone-400">
                {new Date(pr.created_at).toLocaleDateString()}
              </p>
            </div>
            <div className="flex shrink-0 gap-1">
              <a
                href={pr.html_url}
                target="_blank"
                rel="noreferrer"
                className="rounded border border-stone-200 px-2 py-0.5 text-[10px] font-semibold text-stone-600 hover:bg-stone-50"
              >
                {t("community.submissions.view")}
              </a>
              {onClosePR && pr.state === "open" ? (
                <button
                  type="button"
                  disabled={closingId === pr.number}
                  onClick={() => onClosePR(pr.number)}
                  className="rounded border border-red-200 px-2 py-0.5 text-[10px] font-semibold text-red-600 hover:bg-red-50 disabled:opacity-40"
                >
                  {closingId === pr.number ? "…" : t("community.submissions.close_pr")}
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
