import {
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { useMediaQuery } from "../lib/useMediaQuery";

interface Props {
  anchor: HTMLElement | null;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Placement preference relative to anchor. */
  placement?: "bottom" | "top";
  /** Offset gap between anchor and menu (px). */
  gap?: number;
  className?: string;
  /**
   * When true, on narrow viewports (<sm) the menu snaps to the bottom
   * of the screen as a full-width sheet instead of floating near the
   * anchor. Useful for menus that get unwieldy at 390px like ExportMenu.
   */
  mobileSheet?: boolean;
}

/**
 * Portal-mounted popover that positions itself via getBoundingClientRect.
 * Avoids clipping by any `overflow:auto` ancestor (e.g. the grid scroll area).
 */
export function FloatingMenu({
  anchor,
  open,
  onClose,
  children,
  placement = "bottom",
  gap = 6,
  className,
  mobileSheet = false,
}: Props) {
  const [coords, setCoords] = useState<{ left: number; top: number } | null>(
    null,
  );
  const menuRef = useRef<HTMLDivElement>(null);
  const isNarrow = useMediaQuery("(max-width: 639px)");
  const asSheet = mobileSheet && isNarrow;

  useLayoutEffect(() => {
    if (!open || !anchor || !menuRef.current || asSheet) return;
    const rect = anchor.getBoundingClientRect();
    const menuRect = menuRef.current.getBoundingClientRect();
    let left = rect.left + rect.width / 2 - menuRect.width / 2;
    let top =
      placement === "bottom"
        ? rect.bottom + gap
        : rect.top - menuRect.height - gap;

    // Clamp inside viewport
    const pad = 8;
    left = Math.max(pad, Math.min(left, window.innerWidth - menuRect.width - pad));
    if (top + menuRect.height > window.innerHeight - pad) {
      // flip to top
      top = rect.top - menuRect.height - gap;
    }
    if (top < pad) top = pad;

    setCoords({ left, top });
  }, [open, anchor, placement, gap, asSheet]);

  useEffect(() => {
    if (!open) return;

    function onDocClick(e: PointerEvent) {
      if (!menuRef.current) return;
      const target = e.target as Node;
      if (menuRef.current.contains(target)) return;
      if (anchor && anchor.contains(target)) return;
      onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    function onScroll() {
      // Recompute position on scroll/resize.
      if (!anchor || !menuRef.current) return;
      const rect = anchor.getBoundingClientRect();
      const menuRect = menuRef.current.getBoundingClientRect();
      let left = rect.left + rect.width / 2 - menuRect.width / 2;
      let top =
        placement === "bottom"
          ? rect.bottom + gap
          : rect.top - menuRect.height - gap;
      const pad = 8;
      left = Math.max(
        pad,
        Math.min(left, window.innerWidth - menuRect.width - pad),
      );
      if (top + menuRect.height > window.innerHeight - pad) {
        top = rect.top - menuRect.height - gap;
      }
      if (top < pad) top = pad;
      setCoords({ left, top });
    }

    document.addEventListener("pointerdown", onDocClick);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("pointerdown", onDocClick);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open, anchor, onClose, placement, gap]);

  return createPortal(
    <AnimatePresence>
      {open && asSheet ? (
        <motion.div
          key="sheet"
          className="fixed inset-0 z-50 flex items-end bg-stone-900/50"
          onClick={onClose}
          role="presentation"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15, ease: [0.2, 0, 0, 1] }}
        >
          <motion.div
            ref={menuRef}
            onClick={(e) => e.stopPropagation()}
            className={
              "w-full max-h-[70dvh] overflow-auto rounded-t-2xl border-t border-stone-200 bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-2xl " +
              (className ?? "")
            }
            role="dialog"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 34 }}
          >
            {children}
          </motion.div>
        </motion.div>
      ) : open ? (
        <motion.div
          key="float"
          ref={menuRef}
          className={
            "fixed z-50 origin-top rounded-xl border border-stone-200 bg-white p-2 shadow-2xl " +
            (className ?? "")
          }
          style={{
            left: coords?.left ?? -9999,
            top: coords?.top ?? -9999,
            visibility: coords ? "visible" : "hidden",
          }}
          role="dialog"
          initial={{ opacity: 0, scale: 0.96, y: -4 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: -4 }}
          transition={{ duration: 0.15, ease: [0.2, 0, 0, 1] }}
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
