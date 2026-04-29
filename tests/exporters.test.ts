import { describe, expect, it } from "vitest";
import { parseDrumtab } from "../src/notation/parser";
import {
  renderScoreToSvg,
  wrapSvgInStaticHtml,
  wrapSvgInDynamicHtml,
  postProcessSvg,
  filenameStem,
} from "../src/notation/exporters";
import { defaultSample } from "../src/notation/samples";

const { score } = parseDrumtab(defaultSample().source);

describe("renderScoreToSvg", () => {
  it("produces a standalone SVG with xmlns, inline style, and a title", async () => {
    const svg = await renderScoreToSvg(score, { title: "Hello" });
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain("<style>");
    expect(svg).toContain("<title>Hello</title>");
    expect(svg).toContain(".fill-stone-900");
  });

  it("escapes XML-unsafe characters in the title", async () => {
    const svg = await renderScoreToSvg(score, { title: "A & B <c>" });
    expect(svg).toContain("A &amp; B &lt;c&gt;");
  });

  it("inlines font-size from text-[Npx] classes", async () => {
    const svg = await renderScoreToSvg(score);
    const occurrences = svg.match(/text-\[\d+px\]/g) ?? [];
    const inlined = svg.match(/style="font-size:\d+px"/g) ?? [];
    expect(occurrences.length).toBeGreaterThan(0);
    expect(inlined.length).toBeGreaterThanOrEqual(occurrences.length);
  });
});

describe("postProcessSvg", () => {
  it("is a no-op for non-svg strings (nothing to match)", () => {
    const input = "<div>hi</div>";
    expect(postProcessSvg(input)).toBe(input);
  });

  it("omits <title> when none is provided", () => {
    const out = postProcessSvg(`<svg viewBox="0 0 10 10"></svg>`);
    expect(out).not.toContain("<title>");
  });
});

describe("wrapSvgInStaticHtml", () => {
  it("emits a complete HTML document with the SVG inlined", async () => {
    const svg = await renderScoreToSvg(score);
    const html = wrapSvgInStaticHtml(svg, score);
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("<title>");
    expect(html).toContain("<svg");
    expect(html).toContain("</html>");
  });
});

describe("wrapSvgInDynamicHtml", () => {
  it("embeds both the SVG, the source, and the inline player script", async () => {
    const svg = await renderScoreToSvg(score);
    const html = wrapSvgInDynamicHtml(svg, score, {
      source: defaultSample().source,
    });
    expect(html).toContain("<svg");
    expect(html).toContain('id="drumtab-source"');
    expect(html).toContain("parseDrumtab");
    expect(html).toContain("AudioContext");
  });

  it("escapes </script> inside the embedded source so the page parses safely", async () => {
    const safeSource = "title: safe\nmeter: 4/4\n[A]\n| bd: o / o / o / o |\n";
    const safeScore = parseDrumtab(safeSource).score;
    const safeSvg = await renderScoreToSvg(safeScore);
    const safeHtml = wrapSvgInDynamicHtml(safeSvg, safeScore, {
      source: safeSource,
    });
    const safeCount = (safeHtml.match(/<\/script>/g) ?? []).length;

    const evilSource = "title: x\n# </script><script>alert(1)</script>";
    const evilScore = parseDrumtab(evilSource).score;
    const evilSvg = await renderScoreToSvg(evilScore);
    const evilHtml = wrapSvgInDynamicHtml(evilSvg, evilScore, {
      source: evilSource,
    });
    const evilCount = (evilHtml.match(/<\/script>/g) ?? []).length;
    expect(evilCount).toBe(safeCount);
    expect(evilHtml).toContain("&lt;/script&gt;");
  });
});

describe("filenameStem", () => {
  it("slugs whitespace into underscores and strips filesystem-unsafe chars", () => {
    expect(filenameStem("Hello World")).toBe("Hello_World");
    expect(filenameStem('a/b:c*d?"<>|')).toBe("abcd");
  });

  it("falls back to the provided default when the input is empty", () => {
    expect(filenameStem("")).toBe("chart");
    expect(filenameStem("   ", "fallback")).toBe("fallback");
  });
});
