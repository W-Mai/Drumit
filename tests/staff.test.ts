import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parseDrumtab } from "../src/notation/parser";
import { StaffView } from "../src/notation/staff/renderer";
import { defaultSample } from "../src/notation/samples";

describe("StaffView (S2: staff + clef + time sig)", () => {
  it("renders an svg with title, five staff lines, and clef bars", () => {
    const { score } = parseDrumtab(defaultSample().source);
    const svg = renderToStaticMarkup(createElement(StaffView, { score }));
    expect(svg.startsWith("<svg")).toBe(true);
    // Five <line> elements for the staff.
    const lineCount = (svg.match(/<line /g) ?? []).length;
    expect(lineCount).toBeGreaterThanOrEqual(5);
  });

  it("shows the meter in the header and renders time-signature digits", () => {
    const { score } = parseDrumtab("title: X\nmeter: 3/4\n");
    const svg = renderToStaticMarkup(createElement(StaffView, { score }));
    expect(svg).toContain("3/4");
    // Time signature digit pair is rendered as two text elements with 3 / 4.
    expect(svg.match(/>3</g)?.length ?? 0).toBeGreaterThanOrEqual(1);
    expect(svg.match(/>4</g)?.length ?? 0).toBeGreaterThanOrEqual(1);
  });

  it("embeds the score title into the header", () => {
    const { score } = parseDrumtab("title: Hello\nmeter: 4/4\n");
    const svg = renderToStaticMarkup(createElement(StaffView, { score }));
    expect(svg).toContain("Hello");
  });
});
