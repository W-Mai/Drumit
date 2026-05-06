// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render as rtlRender,
} from "@testing-library/react";
import type { ReactElement } from "react";
import { parseDrumtab } from "../src/notation/parser";
import { PadEditor } from "../src/components/PadEditor";
import { I18nProvider } from "../src/i18n/I18nProvider";
import { HotkeyContextProvider } from "../src/components/HotkeyContextProvider";
import { DialogProvider } from "../src/components/ui";

function render(ui: ReactElement) {
  return rtlRender(
    <I18nProvider>
      <DialogProvider>
        <HotkeyContextProvider>{ui}</HotkeyContextProvider>
      </DialogProvider>
    </I18nProvider>,
  );
}

beforeEach(() => {
  if (!window.matchMedia) {
    (window as unknown as { matchMedia: (q: string) => MediaQueryList }).matchMedia =
      (query: string) =>
        ({
          matches: false,
          media: query,
          addEventListener: () => {},
          removeEventListener: () => {},
          addListener: () => {},
          removeListener: () => {},
          dispatchEvent: () => false,
          onchange: null,
        }) as unknown as MediaQueryList;
  }
});

afterEach(() => cleanup());

interface MockedHandlers {
  onSplitGroupAtSlot: ReturnType<typeof vi.fn>;
  onMultiplyGroupDivision: ReturnType<typeof vi.fn>;
  onIncrementGroupDivision: ReturnType<typeof vi.fn>;
  onSetSlotHit: ReturnType<typeof vi.fn>;
  onSetSlotNull: ReturnType<typeof vi.fn>;
  onSetSlotRest: ReturnType<typeof vi.fn>;
  onNextBar: ReturnType<typeof vi.fn>;
  onPrevBar: ReturnType<typeof vi.fn>;
}

function makeProps(opts: { drumtab: string }) {
  const { score } = parseDrumtab(opts.drumtab);
  const bar = score.sections[0].bars[0];
  const beatsPerBar = score.meter.beats;
  const handlers: MockedHandlers = {
    onSplitGroupAtSlot: vi.fn(),
    onMultiplyGroupDivision: vi.fn(),
    onIncrementGroupDivision: vi.fn(),
    onSetSlotHit: vi.fn(),
    onSetSlotNull: vi.fn(),
    onSetSlotRest: vi.fn(),
    onNextBar: vi.fn(),
    onPrevBar: vi.fn(),
  };
  const noop = () => {};
  const props = {
    bar,
    barIndex: 0,
    totalBars: 1,
    beatsPerBar,
    sectionLabel: "A",
    isFirstBarOfSection: true,
    onRenameSection: noop,
    onInsertSectionAfter: noop,
    onDeleteSection: noop,
    onSetRepeat: noop,
    onClearBar: noop,
    onToggleRepeatStart: noop,
    onToggleRepeatEnd: noop,
    onCycleEnding: noop,
    onSetNavigation: noop,
    onInsertAfter: noop,
    onDelete: noop,
    onSetDivision: noop,
    onSetGroupDivision: noop,
    onSplitBeat: noop,
    onToggleSlot: noop,
    onSetSlotRest: handlers.onSetSlotRest,
    onSetSlotHit: handlers.onSetSlotHit,
    onSetSlotNull: handlers.onSetSlotNull,
    onSplitGroupAtSlot: handlers.onSplitGroupAtSlot,
    onIncrementGroupDivision: handlers.onIncrementGroupDivision,
    onMultiplyGroupDivision: handlers.onMultiplyGroupDivision,
    onToggleArticulation: noop,
    onSetSticking: noop,
    onCycleDots: noop,
    onNextBar: handlers.onNextBar,
    onPrevBar: handlers.onPrevBar,
  } as React.ComponentProps<typeof PadEditor>;
  return { props, handlers };
}

function dispatchKeyOnEditor(
  key: string,
  options: KeyboardEventInit = {},
) {
  // Hover scope follows pointer; move pointer over editor first.
  const root = document.querySelector("[data-drumit-scope=\"editor\"]");
  if (root) {
    fireEvent.pointerMove(root, { bubbles: true });
  }
  fireEvent.keyDown(document, { key, ...options });
}

function getSlotButtons(): HTMLButtonElement[] {
  return Array.from(
    document.querySelectorAll<HTMLButtonElement>(
      "[data-drumit-scope=\"editor\"] button",
    ),
  ).filter((b) => {
    const t = b.title || "";
    return (
      t.toLowerCase().includes("toggle") ||
      // Buttons that already carry a hit have title=describeHit(hit) — they
      // start with the lane's instrument label (e.g. "Kick"). Keep them.
      /^(Kick|Snare|Hi-Hat|Ride|Crash|Tom|Floor|Foot|Bell|Open|Closed|Half)/i.test(
        t,
      )
    );
  });
}

describe("PadEditor hotkeys: , and | end-to-end", () => {
  it("',' fires onSplitGroupAtSlot at the focused slot", async () => {
    const { props, handlers } = makeProps({
      drumtab: "title: T\nmeter: 4/4\n[A]\n| bd: oo / - / - / - |",
    });
    render(<PadEditor {...props} />);

    const slots = getSlotButtons();
    fireEvent.click(slots[0]);
    dispatchKeyOnEditor(",");

    expect(handlers.onSplitGroupAtSlot).toHaveBeenCalled();
    const args = handlers.onSplitGroupAtSlot.mock.calls[0];
    expect(args[0]).toBe(0);
    expect(args[1]).toBe("kick");
    expect(args[2]).toBe(0);
  });

  it("'|' (shift+\\) fires onMultiplyGroupDivision with factor 2", () => {
    const { props, handlers } = makeProps({
      drumtab: "title: T\nmeter: 4/4\n[A]\n| bd: oo / - / - / - |",
    });
    render(<PadEditor {...props} />);

    fireEvent.click(getSlotButtons()[0]);
    dispatchKeyOnEditor("|", { shiftKey: true });

    expect(handlers.onMultiplyGroupDivision).toHaveBeenCalled();
    const args = handlers.onMultiplyGroupDivision.mock.calls[0];
    expect(args[0]).toBe(0);
    expect(args[1]).toBe("kick");
    expect(args[3]).toBe(2);
  });

  it("'+' (shift+=) fires onIncrementGroupDivision with delta 1", () => {
    const { props, handlers } = makeProps({
      drumtab: "title: T\nmeter: 4/4\n[A]\n| bd: oo / - / - / - |",
    });
    render(<PadEditor {...props} />);

    fireEvent.click(getSlotButtons()[0]);
    dispatchKeyOnEditor("+", { shiftKey: true });

    expect(handlers.onIncrementGroupDivision).toHaveBeenCalled();
    const args = handlers.onIncrementGroupDivision.mock.calls[0];
    expect(args[3]).toBe(1);
  });

  it("'o' fires onSetSlotHit at the focused slot", () => {
    const { props, handlers } = makeProps({
      drumtab: "title: T\nmeter: 4/4\n[A]\n| bd: oo / - / - / - |",
    });
    render(<PadEditor {...props} />);

    fireEvent.click(getSlotButtons()[0]);
    dispatchKeyOnEditor("o");

    expect(handlers.onSetSlotHit).toHaveBeenCalled();
    const args = handlers.onSetSlotHit.mock.calls[0];
    expect(args[1]).toBe("kick");
    expect(args[2]).toBe(0);
  });

  it("'-' fires onSetSlotNull at the focused slot", () => {
    const { props, handlers } = makeProps({
      drumtab: "title: T\nmeter: 4/4\n[A]\n| bd: oo / - / - / - |",
    });
    render(<PadEditor {...props} />);

    fireEvent.click(getSlotButtons()[0]);
    dispatchKeyOnEditor("-");

    expect(handlers.onSetSlotNull).toHaveBeenCalled();
  });
});

describe("PadEditor arrow navigation across bar boundaries", () => {
  it("ArrowRight at the very last slot fires onNextBar exactly once", () => {
    const { props, handlers } = makeProps({
      drumtab: "title: T\nmeter: 4/4\n[A]\n| bd: o / o / o / o |",
    });
    render(<PadEditor {...props} />);

    const slots = getSlotButtons();
    fireEvent.click(slots[slots.length - 1]);
    dispatchKeyOnEditor("ArrowRight");

    expect(handlers.onNextBar).toHaveBeenCalledTimes(1);
    expect(handlers.onPrevBar).not.toHaveBeenCalled();
  });

  it("ArrowLeft at the very first slot fires onPrevBar exactly once", () => {
    const { props, handlers } = makeProps({
      drumtab: "title: T\nmeter: 4/4\n[A]\n| bd: o / o / o / o |",
    });
    render(<PadEditor {...props} />);

    const slots = getSlotButtons();
    fireEvent.click(slots[0]);
    dispatchKeyOnEditor("ArrowLeft");

    expect(handlers.onPrevBar).toHaveBeenCalledTimes(1);
    expect(handlers.onNextBar).not.toHaveBeenCalled();
  });

  it("ArrowRight in the middle does not cross bars", () => {
    const { props, handlers } = makeProps({
      drumtab: "title: T\nmeter: 4/4\n[A]\n| bd: oo / o / o / o |",
    });
    render(<PadEditor {...props} />);

    const slots = getSlotButtons();
    fireEvent.click(slots[0]);
    dispatchKeyOnEditor("ArrowRight");
    dispatchKeyOnEditor("ArrowRight");

    expect(handlers.onNextBar).not.toHaveBeenCalled();
    expect(handlers.onPrevBar).not.toHaveBeenCalled();
  });

  it("Five ArrowRights from start of a 4-beat / 1-slot bar crosses once", () => {
    const { props, handlers } = makeProps({
      drumtab: "title: T\nmeter: 4/4\n[A]\n| bd: o / o / o / o |",
    });
    render(<PadEditor {...props} />);

    fireEvent.click(getSlotButtons()[0]);
    for (let i = 0; i < 5; i += 1) dispatchKeyOnEditor("ArrowRight");

    expect(handlers.onNextBar).toHaveBeenCalledTimes(1);
  });

  it("Five ArrowLefts from end of a 4-beat / 1-slot bar crosses once", () => {
    const { props, handlers } = makeProps({
      drumtab: "title: T\nmeter: 4/4\n[A]\n| bd: o / o / o / o |",
    });
    render(<PadEditor {...props} />);

    const slots = getSlotButtons();
    fireEvent.click(slots[slots.length - 1]);
    for (let i = 0; i < 5; i += 1) dispatchKeyOnEditor("ArrowLeft");

    expect(handlers.onPrevBar).toHaveBeenCalledTimes(1);
  });
});
