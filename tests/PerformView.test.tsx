// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { parseDrumtab } from "../src/notation/parser";
import { PerformView } from "../src/components/PerformView";

// jsdom doesn't implement ResizeObserver; stub it so the useLayoutEffect
// doesn't throw. PerformView's stage-width defaults to a non-zero
// fallback when stageWidth is still 0, so tests don't need real
// measurements.
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

// jsdom also lacks scrollIntoView on Element.prototype
beforeEach(() => {
  (globalThis as unknown as { ResizeObserver: typeof MockResizeObserver }).ResizeObserver =
    MockResizeObserver;
  (Element.prototype as unknown as { scrollIntoView: () => void }).scrollIntoView =
    function () {};
  (HTMLElement.prototype as unknown as {
    requestFullscreen: () => Promise<void>;
  }).requestFullscreen = function () {
    return Promise.resolve();
  };
  // jsdom lacks matchMedia; stub a never-matches implementation so
  // the force-rotation hook's subscribe/getSnapshot don't blow up.
  if (!window.matchMedia) {
    (window as unknown as { matchMedia: (q: string) => MediaQueryList }).matchMedia =
      (query: string) =>
        ({
          matches: false,
          media: query,
          onchange: null,
          addEventListener: () => {},
          removeEventListener: () => {},
          addListener: () => {},
          removeListener: () => {},
          dispatchEvent: () => false,
        }) as unknown as MediaQueryList;
  }
});

afterEach(() => {
  cleanup();
});

describe("PerformView", () => {
  it("renders one chip per expanded bar", () => {
    // |: A B :| x2 → 4 expanded bars.
    const { score } = parseDrumtab(
      `title: T\nmeter: 4/4\n[A]\n|: bd: o / o / o / o |\n| sn: o / o / o / o :|`,
    );
    render(
      <PerformView
        score={score}
        cursor={null}
        viewMode="drumit"
        engineKind="synth"
        isPlaying={false}
        onSeekTime={() => {}}
        onTogglePlay={() => {}}
        onExit={() => {}}
      />,
    );
    const chips = screen.getAllByTestId("bar-chip");
    expect(chips).toHaveLength(4);
  });

  it("shows ×pass/total on chips whose source bar plays more than once", () => {
    const { score } = parseDrumtab(
      `title: T\nmeter: 4/4\n[A]\n|: bd: o / o / o / o :| x3`,
    );
    render(
      <PerformView
        score={score}
        cursor={null}
        viewMode="drumit"
        engineKind="synth"
        isPlaying={false}
        onSeekTime={() => {}}
        onTogglePlay={() => {}}
        onExit={() => {}}
      />,
    );
    const chips = screen.getAllByTestId("bar-chip");
    expect(chips).toHaveLength(3);
    // Every chip should carry a ×N/3 suffix.
    chips.forEach((chip) => {
      expect(chip.textContent).toMatch(/×\d\/3/);
    });
  });

  it("fires onSeekTime when a chip is clicked", () => {
    // 60 bpm, 4/4, 2 bars of 4 beats → bar 2 starts at 4s.
    const { score } = parseDrumtab(
      `title: T\ntempo: 60\nmeter: 4/4\n[A]\n| bd: o / o / o / o |\n| sn: o / o / o / o |`,
    );
    const onSeekTime = vi.fn();
    render(
      <PerformView
        score={score}
        cursor={null}
        viewMode="drumit"
        engineKind="synth"
        isPlaying={false}
        onSeekTime={onSeekTime}
        onTogglePlay={() => {}}
        onExit={() => {}}
      />,
    );
    const chips = screen.getAllByTestId("bar-chip");
    fireEvent.click(chips[1]);
    expect(onSeekTime).toHaveBeenCalledWith(4);
  });

  it("long-pressing a chip opens the pass popover and picks a pass", () => {
    vi.useFakeTimers();
    try {
      const { score } = parseDrumtab(
        `title: T\ntempo: 60\nmeter: 4/4\n[A]\n|: bd: o / o / o / o :| x3`,
      );
      const onSeekTime = vi.fn();
      render(
        <PerformView
          score={score}
          cursor={null}
          viewMode="drumit"
          engineKind="synth"
          isPlaying={false}
          onSeekTime={onSeekTime}
          onTogglePlay={() => {}}
          onExit={() => {}}
        />,
      );
      const chips = screen.getAllByTestId("bar-chip");
      fireEvent.pointerDown(chips[0]);
      act(() => {
        vi.advanceTimersByTime(500); // > LONG_PRESS_MS
      });
      fireEvent.pointerUp(chips[0]);
      const popover = screen.getByTestId("bar-chip-popover");
      const picks = popover.querySelectorAll("button");
      expect(picks).toHaveLength(3);
      fireEvent.click(picks[2]);
      // |:A:| x3 → bar 0 third pass is expanded idx 2, t=8s.
      expect(onSeekTime).toHaveBeenCalledWith(8);
    } finally {
      vi.useRealTimers();
    }
  });

  it("calls onExit when the ✕ button is clicked", () => {
    const { score } = parseDrumtab(
      `title: T\nmeter: 4/4\n[A]\n| bd: o / o / o / o |`,
    );
    const onExit = vi.fn();
    render(
      <PerformView
        score={score}
        cursor={null}
        viewMode="drumit"
        engineKind="synth"
        isPlaying={false}
        onSeekTime={() => {}}
        onTogglePlay={() => {}}
        onExit={onExit}
      />,
    );
    fireEvent.click(screen.getByLabelText("Exit perform view"));
    expect(onExit).toHaveBeenCalled();
  });

  it("calls onTogglePlay when the play button is clicked", () => {
    const { score } = parseDrumtab(
      `title: T\nmeter: 4/4\n[A]\n| bd: o / o / o / o |`,
    );
    const onTogglePlay = vi.fn();
    render(
      <PerformView
        score={score}
        cursor={null}
        viewMode="drumit"
        engineKind="synth"
        isPlaying={false}
        onSeekTime={() => {}}
        onTogglePlay={onTogglePlay}
        onExit={() => {}}
      />,
    );
    fireEvent.click(screen.getByLabelText("Play"));
    expect(onTogglePlay).toHaveBeenCalled();
  });

  it("short tap (pointerDown + pointerUp within LONG_PRESS) seeks without opening popover", () => {
    vi.useFakeTimers();
    try {
      const { score } = parseDrumtab(
        `title: T\ntempo: 60\nmeter: 4/4\n[A]\n|: bd: o / o / o / o :| x3`,
      );
      const onSeekTime = vi.fn();
      render(
        <PerformView
          score={score}
          cursor={null}
          viewMode="drumit"
          engineKind="synth"
          isPlaying={false}
          onSeekTime={onSeekTime}
          onTogglePlay={() => {}}
          onExit={() => {}}
        />,
      );
      const chips = screen.getAllByTestId("bar-chip");
      fireEvent.pointerDown(chips[1]);
      act(() => {
        vi.advanceTimersByTime(100); // well under 450ms long-press
      });
      fireEvent.pointerUp(chips[1]);
      fireEvent.click(chips[1]);
      expect(onSeekTime).toHaveBeenCalledWith(4); // 2nd pass at 60 bpm
      expect(screen.queryByTestId("bar-chip-popover")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows ×pass/total text on chips whose source bar plays multiple times", () => {
    const { score } = parseDrumtab(
      `title: T\nmeter: 4/4\n[A]\n|: bd: o / o / o / o :| x3`,
    );
    render(
      <PerformView
        score={score}
        cursor={null}
        viewMode="drumit"
        engineKind="synth"
        isPlaying={false}
        onSeekTime={() => {}}
        onTogglePlay={() => {}}
        onExit={() => {}}
      />,
    );
    // Each chip should show the pass number (×N/3).
    const chips = screen.getAllByTestId("bar-chip");
    expect(chips.map((c) => c.textContent)).toEqual([
      expect.stringMatching(/1.*1\/3/),
      expect.stringMatching(/1.*2\/3/),
      expect.stringMatching(/1.*3\/3/),
    ]);
  });

  it("does not show pass suffix on chips whose source bar plays once", () => {
    const { score } = parseDrumtab(
      `title: T\nmeter: 4/4\n[A]\n| bd: o / o / o / o |`,
    );
    render(
      <PerformView
        score={score}
        cursor={null}
        viewMode="drumit"
        engineKind="synth"
        isPlaying={false}
        onSeekTime={() => {}}
        onTogglePlay={() => {}}
        onExit={() => {}}
      />,
    );
    const chips = screen.getAllByTestId("bar-chip");
    expect(chips[0].textContent).not.toMatch(/×\d/);
  });

  it("escape key closes an open pass popover", () => {
    vi.useFakeTimers();
    try {
      const { score } = parseDrumtab(
        `title: T\nmeter: 4/4\n[A]\n|: bd: o / o / o / o :| x3`,
      );
      render(
        <PerformView
          score={score}
          cursor={null}
          viewMode="drumit"
          engineKind="synth"
          isPlaying={false}
          onSeekTime={() => {}}
          onTogglePlay={() => {}}
          onExit={() => {}}
        />,
      );
      const chips = screen.getAllByTestId("bar-chip");
      fireEvent.pointerDown(chips[0]);
      act(() => {
        vi.advanceTimersByTime(500);
      });
      fireEvent.pointerUp(chips[0]);
      expect(screen.getByTestId("bar-chip-popover")).toBeDefined();
      act(() => {
        fireEvent.keyDown(document, { key: "Escape" });
      });
      expect(screen.queryByTestId("bar-chip-popover")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("clicking the popover backdrop dismisses it", () => {
    vi.useFakeTimers();
    try {
      const { score } = parseDrumtab(
        `title: T\nmeter: 4/4\n[A]\n|: bd: o / o / o / o :| x3`,
      );
      render(
        <PerformView
          score={score}
          cursor={null}
          viewMode="drumit"
          engineKind="synth"
          isPlaying={false}
          onSeekTime={() => {}}
          onTogglePlay={() => {}}
          onExit={() => {}}
        />,
      );
      const chips = screen.getAllByTestId("bar-chip");
      fireEvent.pointerDown(chips[0]);
      act(() => {
        vi.advanceTimersByTime(500);
      });
      fireEvent.pointerUp(chips[0]);
      const popover = screen.getByTestId("bar-chip-popover");
      // The popover's outer backdrop is the parent .fixed div.
      const backdrop = popover.parentElement as HTMLElement;
      fireEvent.click(backdrop);
      expect(screen.queryByTestId("bar-chip-popover")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("section-labelled bar (first in a section) renders a section badge on its chip", () => {
    const { score } = parseDrumtab(
      `title: T\nmeter: 4/4\n[A]\n| bd: o / o / o / o |\n[Verse]\n| sn: o / o / o / o |`,
    );
    render(
      <PerformView
        score={score}
        cursor={null}
        viewMode="drumit"
        engineKind="synth"
        isPlaying={false}
        onSeekTime={() => {}}
        onTogglePlay={() => {}}
        onExit={() => {}}
      />,
    );
    // The second chip belongs to section "Verse" — the section label
    // appears once, above that chip.
    const chips = screen.getAllByTestId("bar-chip");
    expect(chips).toHaveLength(2);
    // Query for the section label text node.
    expect(screen.getByText("Verse")).toBeDefined();
  });

  it("contextmenu on a multi-pass chip is prevented (long-press won't open native menu)", () => {
    const { score } = parseDrumtab(
      `title: T\nmeter: 4/4\n[A]\n|: bd: o / o / o / o :| x3`,
    );
    render(
      <PerformView
        score={score}
        cursor={null}
        viewMode="drumit"
        engineKind="synth"
        isPlaying={false}
        onSeekTime={() => {}}
        onTogglePlay={() => {}}
        onExit={() => {}}
      />,
    );
    const chip = screen.getAllByTestId("bar-chip")[0];
    const ev = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
    });
    const prevented = !chip.dispatchEvent(ev);
    expect(prevented).toBe(true);
  });

  it("pointerCancel cancels a pending long-press (same as pointerLeave)", () => {
    vi.useFakeTimers();
    try {
      const { score } = parseDrumtab(
        `title: T\nmeter: 4/4\n[A]\n|: bd: o / o / o / o :| x3`,
      );
      render(
        <PerformView
          score={score}
          cursor={null}
          viewMode="drumit"
          engineKind="synth"
          isPlaying={false}
          onSeekTime={() => {}}
          onTogglePlay={() => {}}
          onExit={() => {}}
        />,
      );
      const chips = screen.getAllByTestId("bar-chip");
      fireEvent.pointerDown(chips[0]);
      fireEvent.pointerCancel(chips[0]);
      act(() => {
        vi.advanceTimersByTime(500);
      });
      expect(screen.queryByTestId("bar-chip-popover")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("follows the playback cursor's expandedBarIndex (active chip changes)", () => {
    const { score } = parseDrumtab(
      `title: T\ntempo: 60\nmeter: 4/4\n[A]\n|: bd: o / o / o / o :| x3`,
    );
    const { rerender } = render(
      <PerformView
        score={score}
        cursor={{
          barIndex: 0,
          beatIndex: 0,
          expandedBarIndex: 0,
          time: 0,
        }}
        viewMode="drumit"
        engineKind="synth"
        isPlaying={false}
        onSeekTime={() => {}}
        onTogglePlay={() => {}}
        onExit={() => {}}
      />,
    );
    // First chip active.
    let chips = screen.getAllByTestId("bar-chip");
    expect(chips[0].getAttribute("data-active")).toBe("true");
    expect(chips[1].hasAttribute("data-active")).toBe(false);
    // Move cursor to bar 1.
    rerender(
      <PerformView
        score={score}
        cursor={{
          barIndex: 0,
          beatIndex: 0,
          expandedBarIndex: 1,
          time: 4,
        }}
        viewMode="drumit"
        engineKind="synth"
        isPlaying={false}
        onSeekTime={() => {}}
        onTogglePlay={() => {}}
        onExit={() => {}}
      />,
    );
    chips = screen.getAllByTestId("bar-chip");
    expect(chips[1].getAttribute("data-active")).toBe("true");
    expect(chips[0].hasAttribute("data-active")).toBe(false);
  });

  it("pointerLeave / pointerCancel cancels a pending long-press", () => {
    vi.useFakeTimers();
    try {
      const { score } = parseDrumtab(
        `title: T\nmeter: 4/4\n[A]\n|: bd: o / o / o / o :| x3`,
      );
      render(
        <PerformView
          score={score}
          cursor={null}
          viewMode="drumit"
          engineKind="synth"
          isPlaying={false}
          onSeekTime={() => {}}
          onTogglePlay={() => {}}
          onExit={() => {}}
        />,
      );
      const chips = screen.getAllByTestId("bar-chip");
      fireEvent.pointerDown(chips[0]);
      fireEvent.pointerLeave(chips[0]);
      act(() => {
        vi.advanceTimersByTime(500);
      });
      // No popover — the leave should have cleared the timer.
      expect(screen.queryByTestId("bar-chip-popover")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
