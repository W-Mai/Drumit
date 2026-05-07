// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render as rtlRender,
  waitFor,
} from "@testing-library/react";
import type { ReactElement } from "react";
import { I18nProvider } from "../src/i18n/I18nProvider";
import { CommunityBrowse } from "../src/components/CommunityBrowse";

function render(ui: ReactElement) {
  return rtlRender(<I18nProvider>{ui}</I18nProvider>);
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function dialog() {
  return document.querySelector('[role="dialog"]') as HTMLElement | null;
}

function mockFetchOnce(body: unknown) {
  const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify(body), { status: 200 }),
  );
  return fetchSpy;
}

function mockFetchSequence(handlers: ((url: string) => Response)[]) {
  let i = 0;
  return vi.spyOn(globalThis, "fetch").mockImplementation((async (
    input: RequestInfo | URL,
  ) => {
    const url = typeof input === "string" ? input : input.toString();
    const fn = handlers[Math.min(i, handlers.length - 1)];
    i += 1;
    return fn(url);
  }) as unknown as typeof fetch);
}

describe("CommunityBrowse", () => {
  it("renders nothing when closed", () => {
    render(
      <CommunityBrowse open={false} onClose={() => {}} onImport={() => {}} />,
    );
    expect(dialog()).toBeNull();
  });

  it("loads and renders the score list from default source", async () => {
    mockFetchOnce({
      generatedAt: "2026-05-07",
      scores: [
        {
          slug: "demo",
          path: "scores/demo.drumtab",
          title: "Demo Track",
          composer: ["Alice"],
          difficulty: 3,
          style: ["rock"],
        },
      ],
    });
    render(
      <CommunityBrowse open onClose={() => {}} onImport={() => {}} />,
    );
    await waitFor(() => {
      expect(dialog()?.textContent).toMatch(/Demo Track/);
    });
    expect(dialog()?.textContent).toMatch(/Alice/);
  });

  it("clicking a score opens it via onImport and closes the modal", async () => {
    mockFetchSequence([
      () =>
        new Response(
          JSON.stringify({
            generatedAt: "x",
            scores: [
              {
                slug: "demo",
                path: "scores/demo.drumtab",
                title: "Demo Track",
              },
            ],
          }),
          { status: 200 },
        ),
      () =>
        new Response("title: Demo\nmeter: 4/4\n[A]\n| hh: x x x x |\n", {
          status: 200,
        }),
    ]);
    const onImport = vi.fn();
    const onClose = vi.fn();
    render(
      <CommunityBrowse open onClose={onClose} onImport={onImport} />,
    );
    await waitFor(() => {
      expect(dialog()?.textContent).toMatch(/Demo Track/);
    });
    // Click the score row in the list (it's the only button containing the
    // score title).
    const buttons = Array.from(
      dialog()!.querySelectorAll<HTMLButtonElement>("button"),
    );
    const row = buttons.find((b) => b.textContent?.includes("Demo Track"));
    fireEvent.click(row!);
    // Detail aside renders the open button (text varies by locale; match by
    // primary variant + i18n string from English dict).
    await waitFor(() => {
      expect(dialog()?.textContent).toMatch(/Open in editor/);
    });
    const openButtons = Array.from(
      dialog()!.querySelectorAll<HTMLButtonElement>("button"),
    );
    const openBtn = openButtons.find((b) =>
      b.textContent?.includes("Open in editor"),
    );
    fireEvent.click(openBtn!);
    await waitFor(() => {
      expect(onImport).toHaveBeenCalledTimes(1);
    });
    expect(onImport.mock.calls[0][0]).toMatch(/^title: Demo/);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders a back-to-list button after a score is selected", async () => {
    mockFetchOnce({
      generatedAt: "x",
      scores: [
        { slug: "demo", path: "scores/demo.drumtab", title: "Demo Track" },
      ],
    });
    render(
      <CommunityBrowse open onClose={() => {}} onImport={() => {}} />,
    );
    await waitFor(() => {
      expect(dialog()?.textContent).toMatch(/Demo Track/);
    });
    const buttons = Array.from(
      dialog()!.querySelectorAll<HTMLButtonElement>("button"),
    );
    const row = buttons.find((b) => b.textContent?.includes("Demo Track"));
    fireEvent.click(row!);
    await waitFor(() => {
      expect(dialog()?.textContent).toMatch(/Back to list/);
    });
    const back = Array.from(
      dialog()!.querySelectorAll<HTMLButtonElement>("button"),
    ).find((b) => b.textContent?.includes("Back to list"));
    fireEvent.click(back!);
    // After clicking back the open-in-editor cta disappears (no detail).
    expect(dialog()?.textContent).not.toMatch(/Open in editor/);
  });

  it("shows an error and a retry button when index fetch fails", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      (async () => {
        throw new Error("boom");
      }) as unknown as typeof fetch,
    );
    render(
      <CommunityBrowse open onClose={() => {}} onImport={() => {}} />,
    );
    await waitFor(() => {
      expect(dialog()?.textContent).toMatch(/Failed to load: boom/);
    });
    const retry = Array.from(
      dialog()!.querySelectorAll<HTMLButtonElement>("button"),
    ).find((b) => b.textContent === "Retry");
    expect(retry).toBeTruthy();
  });
});
