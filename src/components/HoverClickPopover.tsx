import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { FloatingMenu } from "./FloatingMenu";

interface Props {
  /** Content rendered as the trigger. Receives the state so the consumer
   *  can style the trigger as open/closed. The HoverClickPopover wraps
   *  the trigger in a span that carries the actual anchor ref and the
   *  hover/click handlers, so the consumer only supplies styling. */
  trigger: (state: { open: boolean }) => ReactNode;
  /** Popover content. */
  children: ReactNode;
  placement?: "top" | "bottom";
  /** Hover-open delay in ms. */
  openDelay?: number;
  /** Hover-close delay in ms (lets the pointer cross the gap to the panel). */
  closeDelay?: number;
  /** Optional class applied to the wrapping trigger span. */
  triggerClassName?: string;
  className?: string;
}

/**
 * A popover that can be triggered by either hovering the anchor or clicking
 * it. Click "pins" the popover: it stays open until the user clicks
 * outside or hits Escape, regardless of hover. Hover-open without a click
 * follows the leave -> close (delayed) lifecycle so the user can traverse
 * the gap into the panel without dismissing.
 */
export function HoverClickPopover({
  trigger,
  children,
  placement = "bottom",
  openDelay = 120,
  closeDelay = 180,
  triggerClassName,
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [anchor, setAnchor] = useState<HTMLSpanElement | null>(null);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelTimers = useCallback(() => {
    if (openTimer.current !== null) {
      clearTimeout(openTimer.current);
      openTimer.current = null;
    }
    if (closeTimer.current !== null) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  useEffect(() => cancelTimers, [cancelTimers]);

  const handleMouseEnter = useCallback(() => {
    if (closeTimer.current !== null) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    if (open) return;
    openTimer.current = setTimeout(() => {
      setOpen(true);
      openTimer.current = null;
    }, openDelay);
  }, [open, openDelay]);

  const handleMouseLeave = useCallback(() => {
    if (openTimer.current !== null) {
      clearTimeout(openTimer.current);
      openTimer.current = null;
    }
    if (!open || pinned) return;
    closeTimer.current = setTimeout(() => {
      setOpen(false);
      closeTimer.current = null;
    }, closeDelay);
  }, [open, pinned, closeDelay]);

  const handleClick = useCallback(() => {
    cancelTimers();
    if (open && pinned) {
      setOpen(false);
      setPinned(false);
    } else {
      setOpen(true);
      setPinned(true);
    }
  }, [cancelTimers, open, pinned]);

  const handleClose = useCallback(() => {
    cancelTimers();
    setOpen(false);
    setPinned(false);
  }, [cancelTimers]);

  // Panel hover: keep it open while the pointer is over the panel itself,
  // so hovering across the gap into the content doesn't dismiss.
  const handlePanelEnter = useCallback(() => {
    if (closeTimer.current !== null) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const handlePanelLeave = useCallback(() => {
    if (pinned) return;
    closeTimer.current = setTimeout(() => {
      setOpen(false);
      closeTimer.current = null;
    }, closeDelay);
  }, [pinned, closeDelay]);

  return (
    <>
      <span
        ref={setAnchor}
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={triggerClassName ?? "inline-flex"}
      >
        {trigger({ open })}
      </span>
      <FloatingMenu
        anchor={anchor}
        open={open}
        onClose={handleClose}
        placement={placement}
        className={className}
      >
        <div
          onMouseEnter={handlePanelEnter}
          onMouseLeave={handlePanelLeave}
        >
          {children}
        </div>
      </FloatingMenu>
    </>
  );
}
