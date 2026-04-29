import { useEffect } from "react";
import { createPortal } from "react-dom";
import { buildInfo } from "../lib/buildInfo";

interface Props {
  open: boolean;
  onClose: () => void;
}

const REPO_URL = "https://github.com/W-Mai/Drumit";

/**
 * Centered modal that presents the same narrative as README.md (Chinese)
 * — tagline, why, acknowledgement — plus build + source metadata the
 * static README can't carry. Dismissed via Esc, backdrop click, or the
 * close button.
 */
export function AboutModal({ open, onClose }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const builtAt = formatDate(buildInfo.builtAt);
  const commitUrl = `${REPO_URL}/commit/${buildInfo.gitHash}`;
  const versionLabel = buildInfo.version === "dev" ? "dev" : `v${buildInfo.version}`;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="about-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-stone-900/50 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="
          flex w-full flex-col overflow-hidden bg-white shadow-xl
          max-h-[85dvh] rounded-t-2xl
          sm:max-h-[85vh] sm:max-w-xl sm:rounded-2xl
          pb-[env(safe-area-inset-bottom)]
        "
        onClick={(e) => e.stopPropagation()}
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
              关于
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="flex size-7 items-center justify-center rounded-full text-stone-500 hover:bg-stone-100 hover:text-stone-900"
          >
            <span className="text-base leading-none">×</span>
          </button>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5 text-sm leading-relaxed text-stone-700">
          {/* Tagline */}
          <blockquote className="border-l-2 border-amber-400 pl-3 text-stone-600 italic">
            白天练，夜里扒，做梦都在找鼓点打。
            <br />
            一个鼓谱工具，给不想啃五线谱的人。
          </blockquote>

          {/* Why */}
          <section>
            <SectionTitle>为什么写这个</SectionTitle>
            <p className="mb-2">
              我不是专业鼓手，五线谱苦手，看到一堆线就晕。但我想扒歌、想练。
            </p>
            <p>
              Drumit 的思路：镲类一行、鼓类一行；声部撞了才多拆几行；符干省掉。源文件叫{" "}
              <code className="rounded bg-stone-100 px-1 text-[12px]">.drumtab</code>
              ，纯文本，能 diff、能 copy-paste、能提 PR。
            </p>
          </section>

          {/* Acknowledgements */}
          <section>
            <SectionTitle>鸣谢</SectionTitle>
            <p>
              感谢 <strong className="text-stone-900">董波老师</strong>
              。Drumit 采用的这套两行压缩鼓谱记法 ——
              镲类在上、鼓类在下、符干全省、一拍切若干格 ——
              正是我在小米音乐社团跟董老师学打鼓时记下来的那套东西。
              他的谱面简单、直接、好读，真正做到了拿起就能打。
              这个项目本质上就是想把那种手写谱的体验搬到屏幕上。
            </p>
          </section>

          {/* Build + source */}
          <section>
            <SectionTitle>构建信息</SectionTitle>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono text-[12px]">
              <dt className="text-stone-500">版本</dt>
              <dd className="text-stone-900">{versionLabel}</dd>
              <dt className="text-stone-500">提交</dt>
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
              <dt className="text-stone-500">构建时间</dt>
              <dd className="text-stone-900">{builtAt}</dd>
            </dl>
          </section>

          {/* Links */}
          <section>
            <SectionTitle>相关链接</SectionTitle>
            <ul className="space-y-1">
              <Link href={REPO_URL}>源码仓库 · GitHub</Link>
              <Link href={`${REPO_URL}/blob/main/CHANGELOG.md`}>
                更新日志 · CHANGELOG
              </Link>
              <Link href={`${REPO_URL}/blob/main/LICENSE`}>协议 · MIT</Link>
            </ul>
          </section>
        </div>

        <footer className="border-t border-stone-200 bg-stone-50 px-6 py-2.5 text-[11px] text-stone-500">
          © 2026 W-Mai · MIT License
        </footer>
      </div>
    </div>,
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
