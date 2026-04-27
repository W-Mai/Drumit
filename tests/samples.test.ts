import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parseDrumtab } from "../src/notation/parser";
import { layoutScore } from "../src/notation/layout";
import { DrumChart } from "../src/notation/renderer";

import { naTianWanShang } from "../src/notation/samples/page03-na-tian-wan-shang";
import { lanLianHua } from "../src/notation/samples/page04-lan-lian-hua";
import { popRock } from "../src/notation/samples/page07-pop-rock";
import { rockFusion } from "../src/notation/samples/page08-rock-fusion";
import { funkRock } from "../src/notation/samples/page09-funk-rock";
import { bluesVariations } from "../src/notation/samples/page10-blues";

const samples = [
  { name: "page03-na-tian-wan-shang", src: naTianWanShang },
  { name: "page04-lan-lian-hua", src: lanLianHua },
  { name: "page07-pop-rock", src: popRock },
  { name: "page08-rock-fusion", src: rockFusion },
  { name: "page09-funk-rock", src: funkRock },
  { name: "page10-blues-variations", src: bluesVariations },
];

describe("all drumtab samples", () => {
  for (const { name, src } of samples) {
    it(`${name} parses without errors`, () => {
      const { score, diagnostics } = parseDrumtab(src);
      const errors = diagnostics.filter((d) => d.level === "error");
      const bars = score.sections.reduce((a, s) => a + s.bars.length, 0);

      // Helpful diagnostics on failure:
      if (errors.length) {
        console.error(`${name} errors:`, errors);
      }

      expect(errors, `${name} should have no errors`).toHaveLength(0);
      expect(bars, `${name} should have at least one bar`).toBeGreaterThan(0);
    });

    it(`${name} renders to SVG without throwing`, () => {
      const { score } = parseDrumtab(src);
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
