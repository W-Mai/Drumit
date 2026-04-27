import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { parseDrumtab } from "../src/notation/parser";
import { layoutScore } from "../src/notation/layout";
import { DrumChart } from "../src/notation/renderer";

describe("DrumChart", () => {
  it("renders two-row layout with ghost parens and repeat marks", () => {
    const { score } = parseDrumtab(
      `title: T\nmeter: 4/4\n[A]\n| hh: x / x / x / x  bd: o / - / o / -  sn: - / (o) / - / o |\n| % |`,
    );
    const layout = layoutScore(score, {
      showLabels: true,
      expanded: false,
      width: 800,
    });
    const svg = renderToStaticMarkup(
      createElement(DrumChart, { layout, showLabels: true }),
    );
    expect(svg).toContain("∂"); // hi-hat head
    expect(svg).toContain("∕"); // repeat-previous slash
    expect(svg).toContain("("); // ghost note parens
    expect(svg).toContain("Cym");
  });
});
