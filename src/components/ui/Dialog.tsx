import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "./Button";
import {
  DialogContext,
  type DialogApi,
  type DialogRequest,
} from "./useDialog";
import { useI18n } from "../../i18n/useI18n";

interface Resolver {
  resolve: (v: unknown) => void;
}

export function DialogProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [req, setReq] = useState<(DialogRequest & { id: number }) | null>(null);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const resolverRef = useRef<Resolver | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const open = useCallback(<T,>(r: DialogRequest): Promise<T> => {
    return new Promise<T>((resolve) => {
      resolverRef.current = { resolve: resolve as (v: unknown) => void };
      setValue(r.kind === "prompt" ? (r.defaultValue ?? "") : "");
      setError(null);
      setReq({ ...r, id: Date.now() });
    });
  }, []);

  const api = useMemo<DialogApi>(
    () => ({
      alert: (r) => open({ ...r, kind: "alert" }),
      confirm: (r) => open({ ...r, kind: "confirm" }),
      prompt: (r) => open({ ...r, kind: "prompt" }),
    }),
    [open],
  );

  const close = useCallback(
    (result: unknown) => {
      resolverRef.current?.resolve(result);
      resolverRef.current = null;
      setReq(null);
    },
    [],
  );

  const handleCancel = useCallback(() => {
    if (!req) return;
    close(req.kind === "confirm" ? false : req.kind === "prompt" ? null : undefined);
  }, [close, req]);

  const handleConfirm = useCallback(() => {
    if (!req) return;
    if (req.kind === "prompt") {
      const err = req.validate?.(value) ?? null;
      if (err) {
        setError(err);
        return;
      }
      close(value);
    } else if (req.kind === "confirm") {
      close(true);
    } else {
      close(undefined);
    }
  }, [close, req, value]);

  useEffect(() => {
    if (!req) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleCancel();
      else if (e.key === "Enter" && req.kind !== "prompt") handleConfirm();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [req, handleCancel, handleConfirm]);

  useEffect(() => {
    if (req?.kind === "prompt") {
      const t = setTimeout(() => inputRef.current?.select(), 50);
      return () => clearTimeout(t);
    }
  }, [req]);

  return (
    <DialogContext.Provider value={api}>
      {children}
      {typeof document !== "undefined"
        ? createPortal(
            <AnimatePresence>
              {req ? (
                <motion.div
                  key={req.id}
                  role="dialog"
                  aria-modal="true"
                  className="fixed inset-0 z-[10000] flex items-end justify-center bg-stone-900/50 p-4 sm:items-center"
                  onClick={handleCancel}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                >
                  <motion.div
                    className="flex w-full max-w-sm flex-col gap-4 rounded-2xl bg-white p-5 shadow-2xl"
                    onClick={(e) => e.stopPropagation()}
                    initial={{ opacity: 0, y: 20, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 20, scale: 0.96 }}
                    transition={{ type: "spring", stiffness: 320, damping: 28 }}
                  >
                    {req.title ? (
                      <h3 className="text-sm font-bold text-stone-900">
                        {req.title}
                      </h3>
                    ) : null}
                    <div className="text-sm leading-relaxed text-stone-700">
                      {req.message}
                    </div>
                    {req.kind === "prompt" ? (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          handleConfirm();
                        }}
                        className="flex flex-col gap-1"
                      >
                        <input
                          ref={inputRef}
                          autoFocus
                          type="text"
                          value={value}
                          placeholder={req.placeholder}
                          autoCapitalize="off"
                          autoCorrect="off"
                          autoComplete="off"
                          onChange={(e) => {
                            setValue(e.target.value);
                            if (error) setError(null);
                          }}
                          className="w-full rounded-md border border-stone-300 px-3 py-1.5 text-base outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/30 sm:text-sm"
                        />
                        {error ? (
                          <span className="text-xs text-red-600">{error}</span>
                        ) : null}
                      </form>
                    ) : null}
                    <div className="flex justify-end gap-2">
                      {req.kind !== "alert" ? (
                        <Button
                          variant="secondary"
                          size="md"
                          onClick={handleCancel}
                          pressable
                        >
                          {req.cancelLabel ?? t("dialog.cancel")}
                        </Button>
                      ) : null}
                      <Button
                        variant={
                          req.tone === "danger"
                            ? "danger"
                            : req.tone === "primary"
                              ? "primary"
                              : "accent"
                        }
                        size="md"
                        onClick={handleConfirm}
                        pressable
                        autoFocus={req.kind !== "prompt"}
                      >
                        {req.confirmLabel ?? t("dialog.confirm")}
                      </Button>
                    </div>
                  </motion.div>
                </motion.div>
              ) : null}
            </AnimatePresence>,
            document.body,
          )
        : null}
    </DialogContext.Provider>
  );
}
