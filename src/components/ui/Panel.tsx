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
}: {
  title: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200 px-4 py-2">
      <h2 className="flex-none text-sm font-extrabold">{title}</h2>
      {children ? (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {children}
        </div>
      ) : null}
    </header>
  );
}
