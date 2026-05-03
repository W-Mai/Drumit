import { useEffect } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { buildInfo } from "../lib/buildInfo";
import { useI18n } from "../i18n/useI18n";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Destructive — clear all saved documents and reseed with the
   *  default sample. Supplied by App so the modal doesn't depend on
   *  storage internals. If absent, the button hides. */
  onResetWorkspace?: () => void | Promise<void>;
}

const REPO_URL = "https://github.com/W-Mai/Drumit";

/**
 * Centered modal that presents the same narrative as README.md (Chinese)
 * — tagline, why, acknowledgement — plus build + source metadata the
 * static README can't carry. Dismissed via Esc, backdrop click, or the
 * close button.
 */
export function AboutModal({ open, onClose, onResetWorkspace }: Props) {
  const { t } = useI18n();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const builtAt = formatDate(buildInfo.builtAt);
  const commitUrl = `${REPO_URL}/commit/${buildInfo.gitHash}`;
  const versionLabel = buildInfo.version === "dev" ? "dev" : `v${buildInfo.version}`;

  return createPortal(
    <AnimatePresence>
      {open ? (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-labelledby="about-title"
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
          max-h-[85dvh] rounded-t-2xl
          sm:max-h-[85vh] sm:max-w-xl sm:rounded-2xl
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
              id="about-title"
              className="text-ink font-serif text-xl leading-tight font-semibold tracking-tight"
            >
              {t("about.title")}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("about.close")}
            className="motion-press flex size-7 items-center justify-center rounded-full text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-900"
          >
            <span className="text-base leading-none">×</span>
          </button>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5 text-sm leading-relaxed text-stone-700">
          {/* Tagline */}
          <blockquote className="border-l-2 border-amber-400 pl-3 text-stone-600 italic">
            {t("about.tagline_line1")}
            <br />
            {t("about.tagline_line2")}
          </blockquote>

          {/* Why */}
          <section>
            <SectionTitle>{t("about.section.why")}</SectionTitle>
            <p className="mb-2">{t("about.why_body_1")}</p>
            <p>
              {t("about.why_body_2_pre")}
              <code className="rounded bg-stone-100 px-1 text-[12px]">
                .drumtab
              </code>
              {t("about.why_body_2_post")}
            </p>
          </section>

          {/* Acknowledgements */}
          <section>
            <SectionTitle>{t("about.section.thanks")}</SectionTitle>
            <p>
              <strong className="text-stone-900">
                {t("about.thanks_teacher_name")}
              </strong>
              {t("about.thanks_body")}
            </p>
          </section>

          {/* Build + source */}
          <section>
            <SectionTitle>{t("about.section.build")}</SectionTitle>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono text-[12px]">
              <dt className="text-stone-500">{t("about.build.version")}</dt>
              <dd className="text-stone-900">{versionLabel}</dd>
              <dt className="text-stone-500">{t("about.build.commit")}</dt>
              <dd>
                <a
                  href={commitUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-stone-900 underline decoration-stone-300 underline-offset-2 hover:decoration-stone-700"
                >
                  {buildInfo.gitHash}
                </a>
                {buildInfo.gitDirty ? (
                  <span className="ml-2 rounded bg-amber-100 px-1.5 text-[10px] font-bold tracking-wide text-amber-900 uppercase">
                    dirty
                  </span>
                ) : null}
                {buildInfo.gitBranch && buildInfo.gitBranch !== "main" ? (
                  <span className="ml-2 text-stone-500">
                    @ {buildInfo.gitBranch}
                  </span>
                ) : null}
              </dd>
              <dt className="text-stone-500">{t("about.build.time")}</dt>
              <dd className="text-stone-900">{builtAt}</dd>
            </dl>
          </section>

          {/* Links */}
          <section>
            <SectionTitle>{t("about.section.links")}</SectionTitle>
            <ul className="space-y-1">
              <Link href={REPO_URL}>{t("about.link.repo")}</Link>
              <Link href={`${REPO_URL}/blob/main/CHANGELOG.md`}>
                {t("about.link.changelog")}
              </Link>
              <Link href={`${REPO_URL}/blob/main/LICENSE`}>
                {t("about.link.license")}
              </Link>
            </ul>
          </section>

          {/* Danger zone: destructive actions live here so they stay
              out of the main app chrome. Hidden when the host doesn't
              wire a handler. */}
          {onResetWorkspace ? (
            <section>
              <SectionTitle>{t("about.section.danger")}</SectionTitle>
              <div className="flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-900 dark:border-red-500/40 dark:bg-red-900 dark:text-red-100">
                <div>
                  <div className="font-semibold">
                    {t("about.reset.title")}
                  </div>
                  <div className="text-[11px] text-red-700/80 dark:text-red-100/80">
                    {t("about.reset.hint")}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void onResetWorkspace()}
                  className="motion-press shrink-0 rounded-md border border-red-300 bg-white px-2.5 py-1 text-[11px] font-bold text-red-700 hover:border-red-600 hover:bg-red-600 hover:text-white"
                >
                  {t("about.reset.button")}
                </button>
              </div>
            </section>
          ) : null}
        </div>

        <footer className="border-t border-stone-200 bg-stone-50 px-6 py-2.5 text-[11px] text-stone-500">
          © 2026 W-Mai · MIT License
        </footer>
      </motion.div>
    </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-1.5 text-[11px] font-extrabold tracking-wide text-stone-500 uppercase">
      {children}
    </h3>
  );
}

function Link({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <li>
      <a
        href={href}
        target="_blank"
        rel="noreferrer noopener"
        className="text-stone-900 underline decoration-stone-300 underline-offset-2 hover:decoration-stone-700"
      >
        {children}
      </a>
    </li>
  );
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    // Format like "2026-04-29 19:02 UTC+8" using the user's locale.
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${y}-${m}-${day} ${hh}:${mm}`;
  } catch {
    return iso;
  }
}
