import { describe, expect, it } from "vitest";
import { frameSvgForExport } from "../src/notation/exporters/frame";

const innerSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200"><rect x="0" y="0" width="10" height="10"/></svg>`;

describe("frameSvgForExport", () => {
  it("wraps the inner SVG in a bigger viewBox with bleed + footer", async () => {
    const out = await frameSvgForExport(innerSvg, {
      qrUrl: "https://example.com/",
      version: "1.2.3",
    });
    const m = out.match(/viewBox="0 0 (\d+) (\d+)"/);
    expect(m).toBeTruthy();
    const w = parseInt(m![1], 10);
    const h = parseInt(m![2], 10);
    // Inner 400x200; defaults bleed=24, footer=56. Outer = 448 × 304.
    expect(w).toBe(448);
    expect(h).toBe(304);
  });

  it("contains the inner body within a translated group", () => {
    return frameSvgForExport(innerSvg, {
      qrUrl: "https://example.com/",
      version: "1.0.0",
    }).then((out) => {
      expect(out).toContain('<g transform="translate(24, 24)">');
      expect(out).toContain('width="10"'); // the inner rect
    });
  });

  it("renders a QR code SVG group (paths / rects) inside the footer area", async () => {
    const out = await frameSvgForExport(innerSvg, {
      qrUrl: "https://example.com/",
      version: "1.0.0",
    });
    // QRCode.toString emits <path> elements for the dark modules. Just
    // check that at least one path / rect follows the "translate(qrX, qrY)"
    // marker.
    expect(out).toMatch(/<g transform="translate\(\d+, \d+\)"><[a-z]/);
  });

  it("renders title + version in the footer text", async () => {
    const out = await frameSvgForExport(innerSvg, {
      qrUrl: "https://example.com/",
      version: "2026.05.02.1",
      title: "My Groove",
    });
    expect(out).toContain("My Groove");
    expect(out).toContain("v2026.05.02.1");
    expect(out).toContain("https://example.com/");
  });

  it("renders subtitle when given", async () => {
    const out = await frameSvgForExport(innerSvg, {
      qrUrl: "https://example.com/",
      version: "1.0.0",
      title: "Tune",
      subtitle: "Artist Name",
    });
    expect(out).toContain("Artist Name");
  });

  it("escapes XML-unsafe characters in title and URL", async () => {
    const out = await frameSvgForExport(innerSvg, {
      qrUrl: "https://example.com/?q=a&b=<c>",
      version: "1.0.0",
      title: 'Weird "Tune" &',
    });
    expect(out).not.toContain('"Tune"');
    expect(out).toContain("Weird");
    expect(out).toContain("&amp;");
    expect(out).toContain("&quot;");
  });

  it("honours custom bleed and footerHeight options", async () => {
    const out = await frameSvgForExport(innerSvg, {
      qrUrl: "https://example.com/",
      version: "1.0.0",
      bleed: 10,
      footerHeight: 30,
    });
    const m = out.match(/viewBox="0 0 (\d+) (\d+)"/);
    expect(parseInt(m![1], 10)).toBe(420); // 400 + 2×10
    expect(parseInt(m![2], 10)).toBe(250); // 200 + 2×10 + 30
  });
});
