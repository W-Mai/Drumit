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

  it("neutralizes transient selection/playhead classes to transparent so exports don't render black blocks", () => {
    const input = `<svg><rect class="fill-amber-200/60 stroke-amber-500"/><rect class="fill-emerald-300/40"/><rect class="fill-emerald-100/70 stroke-emerald-500"/></svg>`;
    const out = postProcessSvg(input);
    // Extract the class attributes of rect elements (ignore INLINE_CSS).
    const rectClasses = [...out.matchAll(/<rect[^>]*class="([^"]*)"/g)].map(
      (m) => m[1],
    );
    for (const cls of rectClasses) {
      expect(cls).not.toMatch(/fill-amber-200/);
      expect(cls).not.toMatch(/stroke-amber-500/);
      expect(cls).not.toMatch(/fill-emerald-(100|300)/);
      expect(cls).not.toMatch(/stroke-emerald-500/);
      // Replacement keeps an explicit fill so the bare SVG default
      // (black) doesn't leak through.
      expect(cls).toMatch(/fill-transparent/);
    }
  });

  it("preserves the section-pill fill-amber-100 (design token, not transient)", () => {
    const input = `<svg><rect class="fill-stone-900"/><text class="fill-amber-100">A</text></svg>`;
    const out = postProcessSvg(input);
    expect(out).toContain("fill-amber-100");
    expect(out).toContain("fill-stone-900");
  });

  it("strips interaction hit-box rects (data-beat-rect / data-bar-highlight) from exports", () => {
    const input = `<svg><rect data-bar-highlight="true" class="fill-transparent"/><rect data-beat-rect="true" data-beat-index="0" class="fill-transparent"/><rect class="fill-stone-900"/></svg>`;
    const out = postProcessSvg(input);
    expect(out).not.toContain("data-bar-highlight");
    expect(out).not.toContain("data-beat-rect");
    // The non-interaction rect survives.
    expect(out).toContain('class="fill-stone-900"');
  });

  it("keeps interaction rects when stripInteraction is false (for playable HTML)", () => {
    const input = `<svg><rect data-beat-rect="true" data-beat-index="0" class="fill-transparent"/></svg>`;
    const out = postProcessSvg(input, undefined, { stripInteraction: false });
    expect(out).toContain("data-beat-rect");
  });

  it("drops hover: classes from exports", () => {
    const input = `<svg><rect class="fill-transparent stroke-transparent hover:fill-stone-200/40"/></svg>`;
    const out = postProcessSvg(input);
    expect(out).not.toMatch(/hover:/);
    expect(out).toContain("fill-transparent");
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
    // Minified bundle keeps AudioContext as a reference into the Web
    // Audio API — good sentinel that the player script actually shipped.
    expect(html).toContain("AudioContext");
    // The bundle is substantial (~19 kB minified), not just a shim.
    const playerScriptStart = html.indexOf("<script>", html.indexOf("drumtab-source"));
    expect(playerScriptStart).toBeGreaterThan(0);
    expect(html.length).toBeGreaterThan(20_000);
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
