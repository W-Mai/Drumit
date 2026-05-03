import { useEffect, useState } from "react";
import { useI18n } from "../i18n/useI18n";

interface Props {
  savedAt: number | null;
}

export function SavedIndicator({ savedAt }: Props) {
  const { t } = useI18n();
  const [showAbsolute, setShowAbsolute] = useState(false);

  useEffect(() => {
    if (savedAt === null) return;
    const id = window.setTimeout(() => setShowAbsolute(true), 60_000);
    return () => window.clearTimeout(id);
  }, [savedAt]);

  if (savedAt === null) return null;

  let label: string;
  if (!showAbsolute) {
    label = t("saved.just_now");
  } else {
    const d = new Date(savedAt);
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    label = t("saved.at", { time: `${hh}:${mm}` });
  }

  return (
    <span
      aria-live="polite"
      className="hidden items-center gap-1 text-[11px] font-medium text-stone-500 tabular-nums sm:inline-flex"
      title={new Date(savedAt).toLocaleString()}
    >
      <span
        aria-hidden="true"
        className="inline-block size-1.5 rounded-full bg-emerald-500"
      />
      {label}
    </span>
  );
}
