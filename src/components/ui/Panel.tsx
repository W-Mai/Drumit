import { cn } from "../../lib/utils";

export function Panel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <article
      className={cn(
        "panel-hover-lift overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-xl shadow-stone-900/5",
        className,
      )}
    >
      {children}
    </article>
  );
}

export function PanelHeader({
  title,
  children,
  onTitleClick,
  titleClickLabel,
  titleExpanded,
}: {
  title: React.ReactNode;
  children?: React.ReactNode;
  /** When provided, the whole title strip (including its empty space
   *  up to the actions area) becomes a click target. Used by the
   *  bar-editor panel to toggle collapse. */
  onTitleClick?: () => void;
  titleClickLabel?: string;
  titleExpanded?: boolean;
}) {
  const clickable = !!onTitleClick;
  return (
    <header className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200 px-4 py-2">
      {clickable ? (
        <button
          type="button"
          onClick={onTitleClick}
          aria-label={titleClickLabel}
          aria-expanded={titleExpanded}
          className="-m-2 flex min-w-0 flex-1 items-center gap-2 rounded px-2 py-2 text-left text-sm font-extrabold hover:bg-stone-100"
        >
          {title}
        </button>
      ) : (
        <h2 className="flex-none text-sm font-extrabold">{title}</h2>
      )}
      {children ? (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {children}
        </div>
      ) : null}
    </header>
  );
}
