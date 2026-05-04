import { useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { createPortal } from "react-dom";
import { useI18n } from "../i18n/useI18n";

interface Props {
  playButton: ReactNode;
  stopButton: ReactNode;
  clickSwitch: ReactNode;
  loopSwitch: ReactNode;
  beatStrip: ReactNode;
  moreContent: ReactNode;
}

// Bar sits off the screen edge so iOS Safari doesn't intercept
// horizontal pans as a back-swipe gesture.
export function MobilePlaybackBar({
  playButton,
  stopButton,
  clickSwitch,
  loopSwitch,
  beatStrip,
  moreContent,
}: Props) {
  const { t } = useI18n();
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <>
      <div
        className="
          fixed bottom-0 z-30
          left-[max(0.5rem,env(safe-area-inset-left))]
          right-[max(0.5rem,env(safe-area-inset-right))]
          flex flex-col
          rounded-t-xl border border-b-0 border-stone-200 bg-white shadow-lg
          pb-[max(0.5rem,env(safe-area-inset-bottom))]
          lg:hidden
        "
      >
        {/* Top row: metronome + beat strip + loop — all rhythm cues. */}
        <div className="flex items-center gap-2 px-3 pt-2 pb-1 text-[11px]">
          <div className="flex-none">{clickSwitch}</div>
          <div className="min-w-0 flex-1">{beatStrip}</div>
          <div className="flex-none">{loopSwitch}</div>
        </div>
        {/* Bottom row: transport + overflow menu. */}
        <div className="mobile-safe-scroll-x flex items-center gap-2 px-2 pt-1 pb-1 text-[11px]">
          <div className="flex flex-none items-center gap-1">
            {playButton}
            {stopButton}
          </div>
          <div className="min-w-0 flex-1" />
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            aria-label={t("playback.more_options")}
            title={t("playback.more")}
            className="motion-press flex size-8 flex-none items-center justify-center rounded-full border border-stone-200 text-stone-700 hover:bg-stone-50 hover:text-stone-900"
          >
            <span className="text-base leading-none">⋯</span>
          </button>
        </div>
      </div>

      {typeof document !== "undefined"
        ? createPortal(
            <AnimatePresence>
              {sheetOpen ? (
                <motion.div
                  role="dialog"
                  aria-modal="true"
                  className="fixed inset-0 z-40 flex items-end lg:hidden"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                >
                  <button
                    type="button"
                    aria-label={t("playback.close")}
                    onClick={() => setSheetOpen(false)}
                    className="bg-overlay-backdrop absolute inset-0"
                  />
                  <motion.div
                    className="
                      relative w-full rounded-t-2xl border-t border-stone-200 bg-white
                      px-4 pt-4
                      pb-[max(1rem,env(safe-area-inset-bottom))]
                      shadow-2xl
                    "
                    initial={{ y: "100%" }}
                    animate={{ y: 0 }}
                    exit={{ y: "100%" }}
                    transition={{ type: "spring", stiffness: 320, damping: 32 }}
                  >
                    <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-stone-300" />
                    {moreContent}
                  </motion.div>
                </motion.div>
              ) : null}
            </AnimatePresence>,
            document.body,
          )
        : null}
    </>
  );
}
