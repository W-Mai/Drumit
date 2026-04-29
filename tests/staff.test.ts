import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parseDrumtab } from "../src/notation/parser";
import { StaffView } from "../src/notation/staff/renderer";
import { defaultSample } from "../src/notation/samples";

describe("StaffView (MVP stub)", () => {
  it("renders an svg without throwing", () => {
    const { score } = parseDrumtab(defaultSample().source);
    const svg = renderToStaticMarkup(createElement(StaffView, { score }));
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain("Standard notation drum chart");
  });

  it("embeds the score title into the placeholder", () => {
    const { score } = parseDrumtab("title: Hello\nmeter: 4/4\n");
    const svg = renderToStaticMarkup(createElement(StaffView, { score }));
    expect(svg).toContain("Hello");
  });
});
