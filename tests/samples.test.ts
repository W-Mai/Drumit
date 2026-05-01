import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parseDrumtab } from "../src/notation/parser";
import { serializeScore } from "../src/notation/serialize";
import { layoutScore } from "../src/notation/layout";
import { DrumChart } from "../src/notation/renderer";
import { samples, defaultSample, sampleById } from "../src/notation/samples";

describe("all drumtab samples", () => {
  it("bundles at least a handful of samples", () => {
    expect(samples.length).toBeGreaterThan(3);
  });

  it("defaultSample returns the first sample", () => {
    expect(defaultSample()).toBe(samples[0]);
  });

  it("sampleById finds a sample by id", () => {
    const target = samples[1];
    expect(sampleById(target.id)).toBe(target);
  });

  it("sampleById returns undefined for missing id", () => {
    expect(sampleById("__nonexistent__")).toBeUndefined();
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

    it(`${sample.id} serializes idempotently`, () => {
      const { score } = parseDrumtab(sample.source);
      const out1 = serializeScore(score);
      const { score: s2, diagnostics } = parseDrumtab(out1);
      expect(
        diagnostics.filter((d) => d.level === "error"),
        `${sample.id} re-parse should have no errors`,
      ).toHaveLength(0);
      const out2 = serializeScore(s2);
      expect(out2).toBe(out1);
    });
  }
});
