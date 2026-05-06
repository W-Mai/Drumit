// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render as rtlRender,
  screen,
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

describe("PadEditor hotkeys: , and | end-to-end", () => {
  it("',' fires onSplitGroupAtSlot at the focused slot", async () => {
    const { props, handlers } = makeProps({
      drumtab: "title: T\nmeter: 4/4\n[A]\n| bd: oo / - / - / - |",
    });
    render(<PadEditor {...props} />);

    // Click the first kick slot to place cursor on (beat 0, slot 0, lane bd).
    const cells = screen.getAllByRole("button");
    const slotButton = cells.find((b) =>
      b.title?.toLowerCase().includes("toggle"),
    );
    expect(slotButton).toBeDefined();
    fireEvent.click(slotButton!);

    dispatchKeyOnEditor(",");

    expect(handlers.onSplitGroupAtSlot).toHaveBeenCalled();
    const args = handlers.onSplitGroupAtSlot.mock.calls[0];
    expect(args[0]).toBe(0); // beatIndex
    expect(args[1]).toBe("kick"); // instrument
    expect(args[2]).toBe(0); // slotIndex
  });

  it("'|' (shift+\\) fires onMultiplyGroupDivision with factor 2", () => {
    const { props, handlers } = makeProps({
      drumtab: "title: T\nmeter: 4/4\n[A]\n| bd: oo / - / - / - |",
    });
    render(<PadEditor {...props} />);

    const cells = screen.getAllByRole("button");
    const slotButton = cells.find((b) =>
      b.title?.toLowerCase().includes("toggle"),
    );
    fireEvent.click(slotButton!);

    dispatchKeyOnEditor("|", { shiftKey: true });

    expect(handlers.onMultiplyGroupDivision).toHaveBeenCalled();
    const args = handlers.onMultiplyGroupDivision.mock.calls[0];
    expect(args[0]).toBe(0); // beatIndex
    expect(args[1]).toBe("kick");
    expect(args[3]).toBe(2); // factor
  });

  it("'+' (shift+=) fires onIncrementGroupDivision with delta 1", () => {
    const { props, handlers } = makeProps({
      drumtab: "title: T\nmeter: 4/4\n[A]\n| bd: oo / - / - / - |",
    });
    render(<PadEditor {...props} />);

    const cells = screen.getAllByRole("button");
    const slotButton = cells.find((b) =>
      b.title?.toLowerCase().includes("toggle"),
    );
    fireEvent.click(slotButton!);

    dispatchKeyOnEditor("+", { shiftKey: true });

    expect(handlers.onIncrementGroupDivision).toHaveBeenCalled();
    const args = handlers.onIncrementGroupDivision.mock.calls[0];
    expect(args[3]).toBe(1); // delta
  });

  it("'o' fires onSetSlotHit at the focused slot", () => {
    const { props, handlers } = makeProps({
      drumtab: "title: T\nmeter: 4/4\n[A]\n| bd: oo / - / - / - |",
    });
    render(<PadEditor {...props} />);

    const cells = screen.getAllByRole("button");
    const slotButton = cells.find((b) =>
      b.title?.toLowerCase().includes("toggle"),
    );
    fireEvent.click(slotButton!);

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

    const cells = screen.getAllByRole("button");
    const slotButton = cells.find((b) =>
      b.title?.toLowerCase().includes("toggle"),
    );
    fireEvent.click(slotButton!);

    dispatchKeyOnEditor("-");

    expect(handlers.onSetSlotNull).toHaveBeenCalled();
  });
});
