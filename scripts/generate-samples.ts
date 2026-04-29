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
import { parseDrumtab } from "../src/notation/parser";
import { renderScoreToSvg } from "../src/notation/exporters/svg";

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

function renderSample(sample: Sample): string {
  const { score } = parseDrumtab(sample.source);
  return renderScoreToSvg(score, {
    width: sample.width ?? 900,
    showLabels: sample.showLabels ?? false,
    title: sample.label,
  });
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
