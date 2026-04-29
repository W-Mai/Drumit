#!/usr/bin/env bun
/**
 * Render a handful of `.drumtab` samples into standalone SVG files that
 * can be embedded into the README. Tailwind class attributes are rewritten
 * into a single inline `<style>` block so the files render correctly in
 * places that don't load the Tailwind stylesheet (GitHub, local viewers,
 * etc.).
 *
 * Usage:
 *   bun run scripts/generate-samples.ts
 *
 * Outputs to `docs/samples/*.svg`.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parseDrumtab } from "../src/notation/parser";
import { layoutScore } from "../src/notation/layout";
import { DrumChart } from "../src/notation/renderer";

// Tailwind classes used by the renderer, flattened into plain CSS so the
// SVGs stand alone. Kept minimal — only declarations that affect final
// pixels (colour, stroke, typography) need to be here.
const INLINE_CSS = `
  text { font-family: 'Helvetica Neue', Arial, sans-serif; }
  .fill-stone-50 { fill: #fafaf9; }
  .fill-stone-400 { fill: #a8a29e; }
  .fill-stone-500 { fill: #78716c; }
  .fill-stone-700 { fill: #44403c; }
  .fill-stone-900 { fill: #1c1917; }
  .fill-amber-100 { fill: #fef3c7; }
  .fill-emerald-300\\/40 { fill: #6ee7b780; }
  .fill-none { fill: none; }
  .fill-transparent { fill: transparent; }
  .stroke-stone-300 { stroke: #d6d3d1; }
  .stroke-stone-400 { stroke: #a8a29e; }
  .stroke-stone-600 { stroke: #57534e; }
  .stroke-stone-700 { stroke: #44403c; }
  .stroke-stone-900 { stroke: #1c1917; }
  .stroke-transparent { stroke: transparent; }
  .font-bold { font-weight: 700; }
  .font-black { font-weight: 900; }
  .font-extrabold { font-weight: 800; }
  .font-semibold { font-weight: 600; }
  .font-medium { font-weight: 500; }
  .italic { font-style: italic; }
  .tabular-nums { font-variant-numeric: tabular-nums; }
  .tracking-wider { letter-spacing: 0.05em; }
`;

/* Size-bearing utilities that we inject as attributes since they have to
 * survive as computed style on each element (text-[9px] etc. don't map
 * to a shared CSS class — the size is encoded in the class name). */
const TEXT_SIZE_RE = /text-\[(\d+(?:\.\d+)?)(px|rem|em)\]/;

interface Sample {
  /** Filename without extension. */
  slug: string;
  /** Short human label — used in a `<title>` for a11y. */
  label: string;
  /** The `.drumtab` source. */
  source: string;
  /** Optional preferred width in px. */
  width?: number;
  /** Show instrument labels on the left of each lane. */
  showLabels?: boolean;
}

const samples: Sample[] = [
  {
    slug: "dong-ci-da-ci",
    label: "动次打次 — basic 8th-note rock beat",
    width: 900,
    source: `title: 动次打次
tempo: 100
meter: 4/4

[A]
| hh: oo / oo / oo / oo  bd: o- / -- / o- / -  sn: - / x- / - / x- |
`,
  },

  {
    slug: "mixed-subdivisions",
    label: "Mixed in-beat subdivisions & voice stacking",
    width: 900,
    source: `title: Mixed subdivisions
tempo: 100
meter: 4/4

[A]
| cr: -- / - / - / -  hh: oo / o , o- / o- , o / oo  bd: o- / - , -o / -o , o / - , --  sn: - / x- / -- / x-  ft: - / - , -- / - / - |
`,
  },

  {
    slug: "tuplets",
    label: "Triplets and sextuplets",
    width: 900,
    source: `title: Tuplets
tempo: 100
meter: 4/4

[A]
| hh: xxx / xxx / xxx / xxx   bd: o / - / o / -   sn: - / o / - / o |
| hh: xxxxxx / xxxxxx / xxxxxx / xxxxxx   bd: o / - / - / -   sn: - / - / o / - |
`,
  },

  {
    slug: "repeats-endings",
    label: "Repeats with 1st/2nd endings",
    width: 900,
    source: `title: Repeats & endings
tempo: 100
meter: 4/4

[A]
|: hh: oo / oo / oo / oo  bd: o- / -- / o- / --  sn: - / x- / - / x- |
| hh: oo / oo / oo / oo  bd: o- / -- / o- / --  sn: - / x- / - / >x :| [1]
| hh: oo / oo / oo / oo  bd: o- / -- / o- / --  sn: - / x- / -- / xxx | [2]
`,
  },

  {
    slug: "fill-articulations",
    label: "Fill with flam, ghost, accent, syncopation",
    width: 900,
    source: `title: Fill with articulations
tempo: 100
meter: 4/4

[B fill]
| hh: o / o / o / oooo   bd: o / - / o / -   sn: - / x / - / x x x |
`,
  },
];

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function postProcess(svg: string, label: string): string {
  // Insert a <style> element immediately after the opening <svg ...>. We
  // also promote every `class="..."` on the root element to live alongside
  // it so downstream processors don't strip them.
  const titleText = escapeXml(label);
  const styled = svg.replace(
    /<svg([^>]*)>/,
    (match, attrs) =>
      `<svg${attrs} xmlns="http://www.w3.org/2000/svg"><title>${titleText}</title><style>${INLINE_CSS}</style>`,
  );

  // Convert Tailwind text-size utilities (text-[14px]) into explicit
  // font-size attributes so they survive outside a Tailwind runtime.
  return styled.replace(
    /class="([^"]*)"/g,
    (_m, cls: string) => {
      const match = TEXT_SIZE_RE.exec(cls);
      if (!match) return `class="${cls}"`;
      const [, size, unit] = match;
      // Keep the original class but also inline font-size for robustness.
      return `class="${cls}" style="font-size:${size}${unit}"`;
    },
  );
}

function renderSample(sample: Sample): string {
  const { score } = parseDrumtab(sample.source);
  const layout = layoutScore(score, {
    showLabels: sample.showLabels ?? false,
    expanded: false,
    width: sample.width ?? 900,
  });
  const raw = renderToStaticMarkup(
    createElement(DrumChart, {
      layout,
      showLabels: sample.showLabels ?? false,
    }),
  );
  return postProcess(raw, sample.label);
}

function main() {
  const outDir = join(process.cwd(), "docs", "samples");
  mkdirSync(outDir, { recursive: true });

  for (const sample of samples) {
    const svg = renderSample(sample);
    const filePath = join(outDir, `${sample.slug}.svg`);
    writeFileSync(filePath, svg, "utf-8");
    console.log(`wrote ${filePath} (${svg.length} bytes)`);
  }
}

main();
