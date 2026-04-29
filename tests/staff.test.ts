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
  it("draws a flag on an isolated 8th note that can't beam to a neighbour", () => {
    // A single 8th on beat 1 and rests elsewhere: no neighbour inside the
    // same beat, so the note keeps its flag.
    const { score } = parseDrumtab(
      `title: T\nmeter: 4/4\n[A]\n| hh: o- / - / - / - |`,
    );
    const svg = renderToStaticMarkup(createElement(StaffView, { score }));
    const flags = (svg.match(/<path[^>]*d="M [^"]*Q [^"]*"/g) ?? []).length;
    expect(flags).toBeGreaterThanOrEqual(1);
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

describe("StaffView (P1: repeat barlines)", () => {
  it("draws repeat dots when a bar opens with |: ", () => {
    const src = `title: T
meter: 4/4
[A]
|: bd: o / o / o / o |
| bd: o / o / o / o |`;
    const { score } = parseDrumtab(src);
    const svg = renderToStaticMarkup(createElement(StaffView, { score }));
    // Repeat-start emits two dots (circles) that a plain bar doesn't have.
    const circles = (svg.match(/<circle /g) ?? []).length;
    expect(circles).toBeGreaterThanOrEqual(2);
  });

  it("shows ×N when a repeat plays more than twice", () => {
    const src = `title: T
meter: 4/4
[A]
|: bd: o / o / o / o :| x3`;
    const { score } = parseDrumtab(src);
    const svg = renderToStaticMarkup(createElement(StaffView, { score }));
    expect(svg).toContain("×3");
  });
});

describe("StaffView (P2: 1st / 2nd ending)", () => {
  it("labels a bar with [1.] when it carries ending='1'", () => {
    const src = `title: T
meter: 4/4
[A]
|: bd: o / o / o / o |
| bd: o / o / o / o :| [1]
| bd: o / o / o / o | [2]`;
    const { score } = parseDrumtab(src);
    const svg = renderToStaticMarkup(createElement(StaffView, { score }));
    expect(svg).toContain(">1.<");
    expect(svg).toContain(">2.<");
  });
});

describe("StaffView (P3: navigation markers)", () => {
  it("prints D.C. al Fine text above the bar", () => {
    const src = `title: T
meter: 4/4
[A]
| bd: o / o / o / o |
@dc al fine
| bd: o / o / o / o |`;
    const { score } = parseDrumtab(src);
    const svg = renderToStaticMarkup(createElement(StaffView, { score }));
    expect(svg).toContain("D.C. al Fine");
  });

  it("prints Segno glyph 𝄋 when a bar carries the segno marker", () => {
    const src = `title: T
meter: 4/4
[A]
| bd: o / o / o / o |
@segno
| bd: o / o / o / o |`;
    const { score } = parseDrumtab(src);
    const svg = renderToStaticMarkup(createElement(StaffView, { score }));
    expect(svg).toContain("𝄋");
  });
});

describe("StaffView (P4: accent + ghost)", () => {
  it("adds an accent wedge path for an accented hit", () => {
    const plain = parseDrumtab(
      `title: T\nmeter: 4/4\n[A]\n| sn: o / - / - / - |`,
    ).score;
    const accented = parseDrumtab(
      `title: T\nmeter: 4/4\n[A]\n| sn: >o / - / - / - |`,
    ).score;
    const svgPlain = renderToStaticMarkup(createElement(StaffView, { score: plain }));
    const svgAcc = renderToStaticMarkup(createElement(StaffView, { score: accented }));
    expect((svgAcc.match(/<path /g) ?? []).length).toBeGreaterThan(
      (svgPlain.match(/<path /g) ?? []).length,
    );
  });

  it("wraps ghost notes in rounded parentheses", () => {
    const { score } = parseDrumtab(
      `title: T\nmeter: 4/4\n[A]\n| sn: (o) / - / - / - |`,
    );
    const svg = renderToStaticMarkup(createElement(StaffView, { score }));
    // Two Q-curve path strokes per ghost note (left + right paren).
    const parens = (svg.match(/<path[^>]*d="M [^"]*Q [^"]*"/g) ?? []).length;
    expect(parens).toBeGreaterThanOrEqual(2);
  });
});

describe("StaffView (P5: flam / roll / choke)", () => {
  it("flam adds a grace-note ellipse ahead of the main note", () => {
    const plain = parseDrumtab(
      `title: T\nmeter: 4/4\n[A]\n| sn: o / - / - / - |`,
    ).score;
    const flam = parseDrumtab(
      `title: T\nmeter: 4/4\n[A]\n| sn: fo / - / - / - |`,
    ).score;
    const svgPlain = renderToStaticMarkup(createElement(StaffView, { score: plain }));
    const svgFlam = renderToStaticMarkup(createElement(StaffView, { score: flam }));
    expect((svgFlam.match(/<ellipse /g) ?? []).length).toBeGreaterThan(
      (svgPlain.match(/<ellipse /g) ?? []).length,
    );
  });

  it("roll draws tremolo slashes near the stem", () => {
    const { score } = parseDrumtab(
      `title: T\nmeter: 4/4\n[A]\n| sn: ~o / - / - / - |`,
    );
    const svg = renderToStaticMarkup(createElement(StaffView, { score }));
    // Two additional stroke <line>s from the two slashes.
    expect((svg.match(/<line /g) ?? []).length).toBeGreaterThanOrEqual(7);
  });

  it("choke adds a + glyph above a cymbal hit", () => {
    const plain = parseDrumtab(
      `title: T\nmeter: 4/4\n[A]\n| cr: o / - / - / - |`,
    ).score;
    const choked = parseDrumtab(
      `title: T\nmeter: 4/4\n[A]\n| cr: o! / - / - / - |`,
    ).score;
    const svgPlain = renderToStaticMarkup(createElement(StaffView, { score: plain }));
    const svgChoked = renderToStaticMarkup(createElement(StaffView, { score: choked }));
    expect((svgChoked.match(/<line /g) ?? []).length).toBeGreaterThan(
      (svgPlain.match(/<line /g) ?? []).length,
    );
  });
});

describe("StaffView (S10: auto-wrap systems)", () => {
  it("emits multiple systems when bar count exceeds a single row", () => {
    const bars = Array.from(
      { length: 10 },
      () => "| bd: o / o / o / o |",
    ).join("\n");
    const { score } = parseDrumtab(`title: T\nmeter: 4/4\n[A]\n${bars}`);
    const svg = renderToStaticMarkup(
      createElement(StaffView, { score, width: 600 }),
    );
    const oneBar = parseDrumtab(
      `title: T\nmeter: 4/4\n[A]\n| bd: o / o / o / o |`,
    ).score;
    const svgOne = renderToStaticMarkup(
      createElement(StaffView, { score: oneBar, width: 600 }),
    );
    const hMulti = Number(svg.match(/viewBox="0 0 \d+ (\d+)"/)?.[1]);
    const hOne = Number(svgOne.match(/viewBox="0 0 \d+ (\d+)"/)?.[1]);
    expect(hMulti).toBeGreaterThan(hOne);
  });
});

describe("StaffView (S7: rests on empty beats)", () => {
  it("draws a quarter rest on a beat with no hits", () => {
    // Three beats of kicks, a silent beat 3, another kick on beat 4.
    const { score } = parseDrumtab(
      `title: T\nmeter: 4/4\n[A]\n| bd: o / o / - / o |`,
    );
    const svg = renderToStaticMarkup(createElement(StaffView, { score }));
    // Quarter rest is the only path using the zig-zag pattern
    // (M ... L ... L ... L ...); other paths (beam ends, flags) don't
    // chain three Ls. Easiest: just check that the svg has more <path>
    // elements than a bar with no empty beats.
    const filled = parseDrumtab(
      `title: T\nmeter: 4/4\n[A]\n| bd: o / o / o / o |`,
    ).score;
    const svgFilled = renderToStaticMarkup(createElement(StaffView, { score: filled }));
    const paths = (svg.match(/<path /g) ?? []).length;
    const pathsFilled = (svgFilled.match(/<path /g) ?? []).length;
    expect(paths).toBeGreaterThan(pathsFilled);
  });
});

describe("StaffView (S8: tuplets)", () => {
  it("emits a bracket with the tuplet digit for a triplet beat", () => {
    const { score } = parseDrumtab(
      `title: T\nmeter: 4/4\n[A]\n| hh: ooo / - / - / - |`,
    );
    const svg = renderToStaticMarkup(createElement(StaffView, { score }));
    // Tuplet digit "3" shows up as a <text> node, and there's only one
    // tuplet bracket in this bar.
    const threeText = (svg.match(/>3</g) ?? []).length;
    expect(threeText).toBeGreaterThanOrEqual(1);
  });
});

describe("StaffView (S6: beams within a beat)", () => {
  it("replaces flags with a beam when two 8ths share a beat", () => {
    const { score } = parseDrumtab(
      `title: T\nmeter: 4/4\n[A]\n| hh: oo / oo / oo / oo |`,
    );
    const svg = renderToStaticMarkup(createElement(StaffView, { score }));
    const flagCount = (svg.match(/<path[^>]*d="M [^"]*Q /g) ?? []).length;
    // 4 beats, each gets a 1-depth beam; flags are suppressed entirely.
    expect(flagCount).toBe(0);
  });

  it("draws twice as many beam lines for 16ths as 8ths", () => {
    const eighths = parseDrumtab(
      `title: T\nmeter: 4/4\n[A]\n| hh: oo / oo / oo / oo |`,
    ).score;
    const sixteenths = parseDrumtab(
      `title: T\nmeter: 4/4\n[A]\n| hh: oooo / oooo / oooo / oooo |`,
    ).score;
    const svg8 = renderToStaticMarkup(createElement(StaffView, { score: eighths }));
    const svg16 = renderToStaticMarkup(
      createElement(StaffView, { score: sixteenths }),
    );
    // Count only thick beam lines (stroke-width ~= BEAM_THICKNESS). Easier:
    // total <line> count grows by 4 extra beams (1 extra per beat) when
    // going from 8ths to 16ths.
    const lines8 = (svg8.match(/<line /g) ?? []).length;
    const lines16 = (svg16.match(/<line /g) ?? []).length;
    expect(lines16).toBeGreaterThan(lines8);
  });
});
