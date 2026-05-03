import { cn } from "../../lib/utils";
import { useI18n } from "../../i18n/useI18n";

interface Props {
  size?: number;
  className?: string;
}

export function Spinner({ size = 12, className }: Props) {
  const { t } = useI18n();
  return (
    <span
      role="status"
      aria-label={t("common.loading")}
      className={cn(
        "inline-block animate-spin rounded-full border-2 border-current border-t-transparent",
        className,
      )}
      style={{ width: size, height: size }}
    />
  );
}
