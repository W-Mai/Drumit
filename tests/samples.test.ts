import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parseDrumtab } from "../src/notation/parser";
import { layoutScore } from "../src/notation/layout";
import { DrumChart } from "../src/notation/renderer";
import { samples } from "../src/notation/samples";

describe("all drumtab samples", () => {
  it("bundles at least a handful of samples", () => {
    expect(samples.length).toBeGreaterThan(3);
  });

  for (const sample of samples) {
    it(`${sample.id} parses without errors`, () => {
      const { score, diagnostics } = parseDrumtab(sample.source);
      const errors = diagnostics.filter((d) => d.level === "error");
      const bars = score.sections.reduce((a, s) => a + s.bars.length, 0);

      if (errors.length) {
        console.error(`${sample.id} errors:`, errors);
      }

      expect(errors, `${sample.id} should have no errors`).toHaveLength(0);
      expect(bars, `${sample.id} should have at least one bar`).toBeGreaterThan(0);
    });

    it(`${sample.id} renders to SVG without throwing`, () => {
      const { score } = parseDrumtab(sample.source);
      const layout = layoutScore(score, {
        showLabels: false,
        expanded: false,
        width: 980,
      });
      const svg = renderToStaticMarkup(
        createElement(DrumChart, { layout, showLabels: false }),
      );
      expect(svg.startsWith("<svg")).toBe(true);
      expect(svg.length).toBeGreaterThan(500);
    });
  }
});
