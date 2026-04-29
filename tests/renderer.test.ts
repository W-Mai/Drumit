import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { parseDrumtab } from "../src/notation/parser";
import { layoutScore } from "../src/notation/layout";
import { DrumChart } from "../src/notation/renderer";

function renderSvg(src: string, width = 900, showLabels = false): string {
  const { score } = parseDrumtab(src);
  const layout = layoutScore(score, { showLabels, expanded: false, width });
  return renderToStaticMarkup(
    createElement(DrumChart, { layout, showLabels }),
  );
}

describe("DrumChart", () => {
  it("renders two-row layout with ghost brackets and repeat marks", () => {
    const svg = renderSvg(
      `title: T\nmeter: 4/4\n[A]\n| hh: x / x / x / x  bd: o / - / o / -  sn: - / (o) / - / o |\n| % |`,
      800,
      true,
    );
    expect(svg).toContain("∂");
    expect(svg).toContain("∕");
    // Ghost brackets are drawn as stroke paths using stone-600.
    expect(svg).toContain("stroke-stone-600");
    expect(svg).toContain("Cym");
  });

  it("every <text> and <circle> and <line> in the output has numeric coords", () => {
    const svg = renderSvg(
      `title: T\nmeter: 4/4\n[A]\n| hh: oo / xxxx / xxxx / xxxx  bd: o / - / o / -  sn: - / o / - / o |`,
    );
    const elements = [
      ...svg.matchAll(/<(text|circle|line|path)\b[^>]*>/g),
    ];
    elements.forEach((m) => {
      const tag = m[0];
      // Any x / y / cx / cy / x1 / x2 / y1 / y2 present must be finite.
      const attrMatches = tag.matchAll(
        /\b(x|y|cx|cy|x1|x2|y1|y2)\s*=\s*"([^"]*)"/g,
      );
      for (const a of attrMatches) {
        const v = Number.parseFloat(a[2]);
        expect(Number.isFinite(v), `${a[1]}="${a[2]}" in ${tag}`).toBe(true);
      }
    });
  });

  it("renders a 1/32 packed bar without losing any hit", () => {
    const svg = renderSvg(
      `title: T\nmeter: 4/4\n[A]\n| hh: xxxxxxxx / xxxxxxxx / xxxxxxxx / xxxxxxxx |`,
    );
    // 4 beats × 8 hit chars per beat = 32 ∂ glyphs on cymbal row
    const partialCount = (svg.match(/>∂</g) ?? []).length;
    expect(partialCount).toBe(32);
  });

  it("renders all 13 instruments without throwing", () => {
    const svg = renderSvg(
      `title: T\nmeter: 4/4\n[A]\n| bd: o / - / - / -  sn: o / - / - / -  hh: x / - / - / -  hho: x / - / - / -  hhh: x / - / - / -  hhf: x / - / - / -  ride: o / - / - / -  rb: x / - / - / -  cr: o / - / - / -  cr2: o / - / - / -  t1: o / - / - / -  t2: o / - / - / -  ft: o / - / - / - |`,
    );
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg.length).toBeGreaterThan(500);
  });

  it("renders sticking suffix 'R' / 'L' near the hit", () => {
    const svg = renderSvg(
      `title: T\nmeter: 4/4\n[A]\n| sn: o/R / o/L / o/R / o/L |`,
    );
    // Sticking letters are drawn as <text>R</text>
    const rCount = (svg.match(/>R</g) ?? []).length;
    const lCount = (svg.match(/>L</g) ?? []).length;
    expect(rCount).toBeGreaterThanOrEqual(2);
    expect(lCount).toBeGreaterThanOrEqual(2);
  });

  it("merged beam for two 8ths across a split is ONE <line>", () => {
    const svg = renderSvg(
      `title: T\nmeter: 4/4\n[A]\n| hh: o , o / x / x / x |`,
    );
    // Lines with stroke-stone-700 = beam strokes. For beat 1 cymbals there
    // should be exactly 1 merged beam (depth-1) spanning both halves.
    // The other 3 beats each have hh as 1 whole-beat hit = no beam.
    const beamLines = [
      ...svg.matchAll(/<line[^>]*stroke-stone-700[^>]*><\/line>/g),
    ];
    // Expect just 1 beam in total for the cymbal row.
    expect(beamLines.length).toBe(1);
  });

  it("renders flam as a smaller grace head left of the main head", () => {
    const base = renderSvg(
      `title: T\nmeter: 4/4\n[A]\n| sn: o / - / - / - |`,
    );
    const flam = renderSvg(
      `title: T\nmeter: 4/4\n[A]\n| sn: fo / - / - / - |`,
    );
    // Flam adds an additional head glyph + a connecting slash stroke.
    const baseCrosses = (base.match(/<path[^>]*d="M [^"]*L [^"]*M [^"]*L [^"]*"/g) ?? []).length;
    const flamCrosses = (flam.match(/<path[^>]*d="M [^"]*L [^"]*M [^"]*L [^"]*"/g) ?? []).length;
    expect(flamCrosses).toBe(baseCrosses + 1);
  });

  it("renders choke as a `+` mark above the head", () => {
    const svg = renderSvg(
      `title: T\nmeter: 4/4\n[A]\n| cr: !o / - / - / - |`,
    );
    // Two short strokes forming a plus above the head.
    const plusHorizontal = /M [^ ]+ [^ ]+ L [^ ]+ [^ ]+/g;
    const count = (svg.match(plusHorizontal) ?? []).length;
    // At least the two plus strokes. (Other strokes exist; we just assert
    // presence — a bar without choke has none from the modifier group.)
    expect(count).toBeGreaterThanOrEqual(2);
  });

  it("renders roll as two tremolo slashes above the head", () => {
    const base = renderSvg(
      `title: T\nmeter: 4/4\n[A]\n| sn: o / - / - / - |`,
    );
    const roll = renderSvg(
      `title: T\nmeter: 4/4\n[A]\n| sn: ~o / - / - / - |`,
    );
    // Roll adds two extra short-stroke paths (the tremolo slashes).
    const simplePath = /<path[^>]*d="M [^"]*L [^"]*"(?![^<]*M )/g;
    const baseCount = (base.match(simplePath) ?? []).length;
    const rollCount = (roll.match(simplePath) ?? []).length;
    expect(rollCount).toBeGreaterThanOrEqual(baseCount + 2);
  });

  it("uses ● for kick and × for snare heads", () => {
    const svg = renderSvg(
      `title: T\nmeter: 4/4\n[A]\n| bd: o / - / - / -  sn: - / o / - / - |`,
    );
    // Kick = solid circle (<circle>), snare = × path with two diagonals.
    const circles = [...svg.matchAll(/<circle\b[^>]*>/g)];
    expect(circles.length).toBeGreaterThanOrEqual(1); // at least the kick

    // Snare × path has 2 M..L segments
    const crossPath = svg.match(/<path[^>]*d="M [^"]*L [^"]*M [^"]*L [^"]*"/);
    expect(crossPath).not.toBeNull();
  });
});
