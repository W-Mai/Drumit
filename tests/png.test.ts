// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { svgStringToPng } from "../src/notation/exporters/png";

// jsdom doesn't implement canvas.getContext / toBlob; stub what we need.
class FakeImage {
  static onload: (() => void) | null = null;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  crossOrigin = "";
  private _src = "";
  get src(): string {
    return this._src;
  }
  set src(v: string) {
    this._src = v;
    // Fire onload on the next tick to simulate image decoding.
    setTimeout(() => this.onload?.(), 0);
  }
}

beforeEach(() => {
  (globalThis as unknown as { Image: typeof FakeImage }).Image = FakeImage;
  // toBlob: jsdom doesn't have it. Stub producing a minimal Blob.
  const proto = HTMLCanvasElement.prototype as unknown as {
    getContext: () => CanvasRenderingContext2D | null;
    toBlob: (cb: (blob: Blob | null) => void, type?: string) => void;
  };
  proto.getContext = () =>
    ({
      fillStyle: "",
      fillRect: () => {},
      drawImage: () => {},
    }) as unknown as CanvasRenderingContext2D;
  proto.toBlob = (cb, type = "image/png") => {
    cb(new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type }));
  };
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("svgStringToPng", () => {
  const sampleSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200"><rect width="10" height="10"/></svg>`;

  it("returns a PNG blob for a valid SVG string", async () => {
    const blob = await svgStringToPng(sampleSvg);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("image/png");
    expect(blob.size).toBeGreaterThan(0);
  });

  it("respects the scale option (width ≈ viewBox * scale)", async () => {
    let capturedWidth = 0;
    const origCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = origCreateElement(tag);
      if (tag === "canvas") {
        Object.defineProperty(el, "width", {
          set(v: number) {
            capturedWidth = v;
          },
          get() {
            return capturedWidth;
          },
          configurable: true,
        });
      }
      return el;
    });
    await svgStringToPng(sampleSvg, { scale: 3 });
    expect(capturedWidth).toBe(1200); // 400 × 3
  });

  it("falls back to default dimensions when SVG lacks a viewBox", async () => {
    const noViewBox = `<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>`;
    // Shouldn't throw; just uses the fallback 900x300.
    const blob = await svgStringToPng(noViewBox);
    expect(blob.size).toBeGreaterThan(0);
  });

  it("applies background fill when given", async () => {
    let calls = 0;
    const proto = HTMLCanvasElement.prototype as unknown as {
      getContext: () => CanvasRenderingContext2D | null;
    };
    const origGetContext = proto.getContext;
    proto.getContext = () =>
      ({
        fillStyle: "",
        fillRect: () => {
          calls += 1;
        },
        drawImage: () => {},
      }) as unknown as CanvasRenderingContext2D;
    try {
      await svgStringToPng(sampleSvg, { background: "#fff" });
      expect(calls).toBeGreaterThan(0);
    } finally {
      proto.getContext = origGetContext;
    }
  });

  it("rejects when the image fails to decode", async () => {
    class FailingImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      crossOrigin = "";
      set src(_v: string) {
        setTimeout(() => this.onerror?.(), 0);
      }
    }
    (globalThis as unknown as { Image: typeof FailingImage }).Image = FailingImage;
    await expect(svgStringToPng(sampleSvg)).rejects.toThrow(/decode/i);
  });
});
