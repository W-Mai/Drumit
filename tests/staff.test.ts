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

describe("StaffView (S3: notes for kick / snare / hi-hat)", () => {
  const src = `title: T
meter: 4/4
[A]
| hh: oo / oo / oo / oo  bd: o- / -- / o- / --  sn: - / x- / - / x- |
`;

  it("produces ellipses (kick + snare heads) for a classic beat", () => {
    const { score } = parseDrumtab(src);
    const svg = renderToStaticMarkup(createElement(StaffView, { score }));
    const ellipses = (svg.match(/<ellipse /g) ?? []).length;
    // 2 kicks on beats 1 & 3 + 2 snares on beats 2 & 4 = 4 solid heads at least.
    expect(ellipses).toBeGreaterThanOrEqual(4);
  });

  it("renders hi-hat as x glyphs (pairs of crossed lines)", () => {
    const { score } = parseDrumtab(src);
    const svg = renderToStaticMarkup(createElement(StaffView, { score }));
    // Each hi-hat x is two stroke lines. Expect 8 pairs = 16 lines at minimum
    // (4 beats × 2 hh × 2 strokes). Plus the 5 staff lines + clef bars.
    const lineCount = (svg.match(/<line /g) ?? []).length;
    expect(lineCount).toBeGreaterThanOrEqual(5 + 2 + 16);
  });
});

describe("StaffView (S5: stems + flags)", () => {
  it("draws flag paths on 8th notes (quadratic Q curves)", () => {
    const { score } = parseDrumtab(
      `title: T\nmeter: 4/4\n[A]\n| hh: oo / oo / oo / oo |`,
    );
    const svg = renderToStaticMarkup(createElement(StaffView, { score }));
    // 8 hi-hat 8ths → 8 flag paths (1 per 8th note). Each flag is a
    // single <path d="M ... Q ..."> element.
    const flags = (svg.match(/<path[^>]*d="M [^"]*Q [^"]*"/g) ?? []).length;
    expect(flags).toBeGreaterThanOrEqual(8);
  });

  it("gives a quarter-note kick a stem but no flag", () => {
    const { score } = parseDrumtab(
      `title: T\nmeter: 4/4\n[A]\n| bd: o / - / o / - |`,
    );
    const svg = renderToStaticMarkup(createElement(StaffView, { score }));
    // Two kicks: two solid ellipses.
    const ellipses = (svg.match(/<ellipse /g) ?? []).length;
    expect(ellipses).toBe(2);
    // Quarter-note stems are straight <line>s; flags would be <path Q>s.
    const flags = (svg.match(/<path[^>]*d="M [^"]*Q /g) ?? []).length;
    expect(flags).toBe(0);
  });
});
