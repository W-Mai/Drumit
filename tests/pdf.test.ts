// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { printSvgAsPdf } from "../src/notation/exporters/pdf";
import type { Score } from "../src/notation/types";

function makeScore(): Score {
  return {
    version: 1,
    title: "Print Test",
    meter: { beats: 4, beatUnit: 4 },
    sections: [{ label: "A", bars: [] }],
  };
}

beforeEach(() => {
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:pdf-print");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("printSvgAsPdf", () => {
  it("injects a hidden iframe into the document", () => {
    printSvgAsPdf("<svg xmlns='http://www.w3.org/2000/svg'/>", makeScore());
    const iframe = document.querySelector("iframe");
    expect(iframe).toBeTruthy();
    expect(iframe!.getAttribute("aria-hidden")).toBe("true");
    // Positioning: must be offscreen / invisible.
    expect(iframe!.style.pointerEvents).toBe("none");
    expect(iframe!.style.opacity).toBe("0");
  });

  it("points the iframe at an object URL", () => {
    printSvgAsPdf("<svg xmlns='http://www.w3.org/2000/svg'/>", makeScore());
    const iframe = document.querySelector("iframe")!;
    expect(iframe.src).toContain("blob:pdf-print");
  });

  it("creates a blob via URL.createObjectURL", () => {
    const createSpy = vi.spyOn(URL, "createObjectURL");
    printSvgAsPdf("<svg xmlns='http://www.w3.org/2000/svg'/>", makeScore());
    expect(createSpy).toHaveBeenCalledTimes(1);
    const blobArg = createSpy.mock.calls[0][0];
    expect(blobArg).toBeInstanceOf(Blob);
    expect((blobArg as Blob).type).toMatch(/html/);
  });

  it("cleans up gracefully if iframe.contentWindow is null on load", () => {
    const origCreateElement = document.createElement.bind(document);
    const createSpy = vi
      .spyOn(document, "createElement")
      .mockImplementation((tag: string) => {
        const el = origCreateElement(tag);
        if (tag === "iframe") {
          Object.defineProperty(el, "contentWindow", {
            get() {
              return null;
            },
            configurable: true,
          });
        }
        return el;
      });
    try {
      printSvgAsPdf("<svg xmlns='http://www.w3.org/2000/svg'/>", makeScore());
      const iframe = document.querySelector("iframe")!;
      // Dispatching load should hit the null-contentWindow branch and
      // call cleanup without throwing.
      expect(() => iframe.dispatchEvent(new Event("load"))).not.toThrow();
    } finally {
      createSpy.mockRestore();
    }
  });

  it("calls iframe.contentWindow.print() after the iframe loads", async () => {
    const fakeWin = {
      focus: vi.fn(),
      print: vi.fn(),
    };
    const origCreateElement = document.createElement.bind(document);
    const createSpy = vi
      .spyOn(document, "createElement")
      .mockImplementation((tag: string) => {
        const el = origCreateElement(tag);
        if (tag === "iframe") {
          // Override contentWindow to our fake.
          Object.defineProperty(el, "contentWindow", {
            get() {
              return fakeWin;
            },
            configurable: true,
          });
        }
        return el;
      });
    try {
      printSvgAsPdf("<svg xmlns='http://www.w3.org/2000/svg'/>", makeScore());
      const iframe = document.querySelector("iframe")!;
      // Fire the load event manually.
      iframe.dispatchEvent(new Event("load"));
      // Allow the 150ms setTimeout inside pdf.ts to resolve.
      await new Promise((r) => setTimeout(r, 200));
      expect(fakeWin.focus).toHaveBeenCalled();
      expect(fakeWin.print).toHaveBeenCalled();
    } finally {
      createSpy.mockRestore();
    }
  });
});
