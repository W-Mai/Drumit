import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";

interface Props {
  activeKey: string;
  children: ReactNode;
  className?: string;
}

export function ViewFader({ activeKey, children, className }: Props) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={activeKey}
        className={className}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        transition={{ duration: 0.15, ease: [0.2, 0, 0, 1] }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
