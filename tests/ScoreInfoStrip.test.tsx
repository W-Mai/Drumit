// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render as rtlRender } from "@testing-library/react";
import type { ReactElement } from "react";
import { I18nProvider } from "../src/i18n/I18nProvider";
import { ScoreInfoStrip } from "../src/components/ScoreInfoStrip";
import type { Score } from "../src/notation/types";

function render(ui: ReactElement) {
  return rtlRender(<I18nProvider>{ui}</I18nProvider>);
}

afterEach(() => cleanup());

function makeScore(overrides: Partial<Score> = {}): Score {
  return {
    version: 1,
    title: "Demo",
    meter: { beats: 4, beatUnit: 4 },
    sections: [],
    ...overrides,
  };
}

describe("ScoreInfoStrip", () => {
  it("shows the title and falls back to 'Untitled' when empty", () => {
    const { container, rerender } = render(
      <ScoreInfoStrip
        score={makeScore({ title: "Funk Groove" })}
        onEdit={() => {}}
      />,
    );
    expect(container.textContent).toMatch(/Funk Groove/);
    rerender(
      <I18nProvider>
        <ScoreInfoStrip score={makeScore({ title: "" })} onEdit={() => {}} />
      </I18nProvider>,
    );
    expect(container.textContent).toMatch(/Untitled|未命名/);
  });

  it("renders composer / album / arranger as a subtitle when present", () => {
    const { container } = render(
      <ScoreInfoStrip
        score={makeScore({
          composer: ["Alice", "Bob"],
          album: "Greatest",
          arranger: "Carol",
        })}
        onEdit={() => {}}
      />,
    );
    expect(container.textContent).toMatch(/Alice, Bob/);
    expect(container.textContent).toMatch(/Greatest/);
    expect(container.textContent).toMatch(/arr\. Carol/);
  });

  it("renders difficulty as stars and license as an upper-case tag", () => {
    const { container } = render(
      <ScoreInfoStrip
        score={makeScore({ difficulty: 3, license: "CC-BY-4.0" })}
        onEdit={() => {}}
      />,
    );
    expect(container.textContent).toMatch(/★★★/);
    expect(container.textContent).toMatch(/CC-BY-4\.0/);
  });

  it("calls onEdit when the strip is clicked", () => {
    const onEdit = vi.fn();
    const { container } = render(
      <ScoreInfoStrip score={makeScore()} onEdit={onEdit} />,
    );
    const button = container.querySelector("button")!;
    fireEvent.click(button);
    expect(onEdit).toHaveBeenCalledTimes(1);
  });
});
