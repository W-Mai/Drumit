// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render as rtlRender } from "@testing-library/react";
import type { ReactElement } from "react";
import { I18nProvider } from "../src/i18n/I18nProvider";
import { MetaForm } from "../src/components/MetaForm";
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

// Form is rendered into a portal under document.body, so RTL's `container`
// won't see it. Query the live DOM tree directly.
function dialog() {
  return document.querySelector('[role="dialog"]') as HTMLElement | null;
}
function inputs() {
  return Array.from(
    dialog()?.querySelectorAll<HTMLInputElement>("input") ?? [],
  );
}
function findSubmit() {
  return Array.from(
    dialog()?.querySelectorAll<HTMLButtonElement>("button") ?? [],
  ).find((b) => b.type === "submit") as HTMLButtonElement;
}

describe("MetaForm", () => {
  it("renders nothing when closed", () => {
    render(
      <MetaForm
        open={false}
        score={makeScore()}
        onClose={() => {}}
        onSave={() => {}}
      />,
    );
    expect(dialog()).toBeNull();
  });

  it("seeds inputs from existing score meta", () => {
    const score = makeScore({
      slug: "demo-track",
      composer: ["Alice", "Bob"],
      difficulty: 3,
      style: ["rock", "funk"],
    });
    render(
      <MetaForm open score={score} onClose={() => {}} onSave={() => {}} />,
    );
    const all = inputs();
    expect(all[0].value).toBe("demo-track");
    expect(all.find((i) => i.value === "Alice, Bob")).toBeTruthy();
    expect(all.find((i) => i.value === "rock, funk")).toBeTruthy();
    expect(all.find((i) => i.type === "number")?.value).toBe("3");
  });

  it("submits a patch with parsed multi-values and trimmed strings", () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    render(
      <MetaForm
        open
        score={makeScore({ title: "My Track" })}
        onClose={onClose}
        onSave={onSave}
      />,
    );
    const all = inputs();
    fireEvent.change(all[0], { target: { value: "my-track" } });
    fireEvent.change(all[1], { target: { value: " A , B , " } });
    const difficulty = all.find((i) => i.type === "number")!;
    fireEvent.change(difficulty, { target: { value: "4" } });
    fireEvent.submit(findSubmit().closest("form")!);
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    const patch = onSave.mock.calls[0][0];
    expect(patch.slug).toBe("my-track");
    expect(patch.composer).toEqual(["A", "B"]);
    expect(patch.difficulty).toBe(4);
  });

  it("blocks submit and shows an error when slug is invalid", () => {
    const onSave = vi.fn();
    render(
      <MetaForm
        open
        score={makeScore()}
        onClose={() => {}}
        onSave={onSave}
      />,
    );
    const slug = inputs()[0];
    fireEvent.change(slug, { target: { value: "Not Valid!" } });
    const submit = findSubmit();
    expect(submit.disabled).toBe(true);
    fireEvent.click(submit);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("drops out-of-range difficulty silently in the patch", () => {
    const onSave = vi.fn();
    render(
      <MetaForm open score={makeScore()} onClose={() => {}} onSave={onSave} />,
    );
    const difficulty = inputs().find((i) => i.type === "number")!;
    fireEvent.change(difficulty, { target: { value: "9" } });
    fireEvent.submit(findSubmit().closest("form")!);
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0].difficulty).toBeUndefined();
  });
});
