import { useCallback, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "../../lib/utils";
import {
  ToastContext,
  type ToastApi,
  type ToastInput,
  type ToastTone,
} from "./toastContext";

type ToastEntry = ToastInput & { id: number };

const TONE_STYLES: Record<ToastTone, string> = {
  info: "border-stone-200 bg-white text-stone-800",
  success: "border-emerald-200 bg-emerald-50 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-100",
  warning: "border-amber-200 bg-amber-50 text-amber-900 dark:bg-amber-900 dark:text-amber-100",
  danger: "border-red-200 bg-red-50 text-red-900 dark:bg-red-900 dark:text-red-100",
};

const TONE_DOT: Record<ToastTone, string> = {
  info: "bg-stone-500",
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  danger: "bg-red-500",
};

/**
 * Minimal toast surface. Renders a stack of transient notifications in
 * the bottom-right (bottom-center on <sm) with spring enter / exit.
 * Sits above the mobile PlaybackBar via a bottom offset so it doesn't
 * cover transport controls.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastEntry[]>([]);

  const dismiss = useCallback((id: number) => {
    setItems((arr) => arr.filter((x) => x.id !== id));
  }, []);

  const toast = useCallback<ToastApi["toast"]>(
    (input) => {
      const id = Date.now() + Math.random();
      const entry: ToastEntry = { tone: "info", duration: 3000, ...input, id };
      setItems((arr) => [...arr, entry]);
      if (entry.duration && entry.duration > 0) {
        window.setTimeout(() => dismiss(id), entry.duration);
      }
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {typeof document !== "undefined"
        ? createPortal(
            <div
              aria-live="polite"
              aria-atomic="true"
              className="
                pointer-events-none
                fixed z-50
                right-2 sm:right-4
                left-2 sm:left-auto
                bottom-[calc(3.5rem+env(safe-area-inset-bottom))] sm:bottom-4
                flex flex-col items-center gap-2 sm:items-end
              "
            >
              <AnimatePresence initial={false}>
                {items.map((t) => {
                  const tone = t.tone ?? "info";
                  return (
                    <motion.div
                      key={t.id}
                      layout
                      initial={{ opacity: 0, y: 16, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 12, scale: 0.96 }}
                      transition={{ type: "spring", stiffness: 380, damping: 30 }}
                      className={cn(
                        "pointer-events-auto flex min-w-[220px] max-w-[min(380px,calc(100vw-1rem))] items-center gap-2 rounded-xl border px-3 py-2 text-[13px] font-medium shadow-xl",
                        TONE_STYLES[tone],
                      )}
                      role="status"
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          "size-1.5 shrink-0 rounded-full",
                          TONE_DOT[tone],
                        )}
                      />
                      <span className="flex-1 truncate">{t.message}</span>
                      {t.action ? (
                        <button
                          type="button"
                          onClick={() => {
                            t.action?.onClick();
                            dismiss(t.id);
                          }}
                          className="motion-press shrink-0 rounded border border-current/20 bg-white/60 px-2 py-0.5 text-[11px] font-bold hover:bg-white"
                        >
                          {t.action.label}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => dismiss(t.id)}
                        aria-label="Dismiss"
                        className="motion-press -mr-1 shrink-0 rounded text-stone-400 hover:text-stone-700"
                      >
                        ✕
                      </button>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>,
            document.body,
          )
        : null}
    </ToastContext.Provider>
  );
}
