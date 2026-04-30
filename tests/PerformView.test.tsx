// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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

  it("opens a pass popover and seeks to the chosen pass", () => {
    // |: A :| x3 → 3 expanded positions at t = 0, 4, 8 (60 bpm).
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
    const passButtons = screen.getAllByTestId("bar-chip-passes");
    // Each of the 3 chips has a pass picker because total=3 > 1.
    expect(passButtons).toHaveLength(3);
    fireEvent.click(passButtons[0]);
    const popover = screen.getByTestId("bar-chip-popover");
    const picks = popover.querySelectorAll("button");
    expect(picks).toHaveLength(3);
    fireEvent.click(picks[2]); // 3rd pass
    // Source bar 0's third pass in |:A:| x3 is expanded index 2 → t=8s.
    expect(onSeekTime).toHaveBeenCalledWith(8);
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
});
