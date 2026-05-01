// Baseline sizes so we can compare before/after visual tweaks.
// Run: bun scripts/dump-sizes.ts
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { parseDrumtab } from "../src/notation/parser";
import { layoutScore } from "../src/notation/layout";
import { DrumChart } from "../src/notation/renderer";
import { StaffView } from "../src/notation/staff/renderer";
const cases = [
  ["popRockish", "title: Pop-Rock\ntempo: 100\nmeter: 4/4\n[A]\n| hh: x x x x  bd: o - o -  sn: - o - o |\n| hh: x x x x  bd: o - o -  sn: - o (o) o |\n| hh: x x x x  bd: o - o -  sn: - o - o |\n| hh: x x x x  bd: - - - -  sn: >o - - o |"],
  ["compound", "title: T\nmeter: 4/4\n[A]\n| hh: xxxx / xxxx / xxxx / xxxx  bd: o - / o - / o - / o -  sn: - o / - o / - o / - o |"],
  ["dotted", "title: T\nmeter: 4/4\n[A]\n| hh: o.o / oo / oo / oo |"],
  ["tripletBar", "title: T\nmeter: 4/4\n[A]\n| sn: (3)xxx / (3)xxx / (3)xxx / (3)xxx |"],
] as const;

for (const [name, src] of cases) {
  const { score } = parseDrumtab(src);
  const layout = layoutScore(score, { showLabels: true, expanded: false, width: 980 });
  const drum = renderToStaticMarkup(
    createElement(DrumChart, { layout, showLabels: true }),
  );
  const staff = renderToStaticMarkup(createElement(StaffView, { score }));

  // Pull the root <svg> viewBox and size so we can compare layout.
  const drumMatch = drum.match(/viewBox="0 0 (\d+) (\d+)"/);
  const staffMatch = staff.match(/viewBox="0 0 (\d+) (\d+)"/);
  console.log(`=== ${name} ===`);
  console.log(`  Drumit SVG: ${drumMatch?.[1] ?? "?"}×${drumMatch?.[2] ?? "?"}  bytes=${drum.length}`);
  console.log(`  Staff  SVG: ${staffMatch?.[1] ?? "?"}×${staffMatch?.[2] ?? "?"}  bytes=${staff.length}`);
  console.log(`  Drumit bar 0 rowMaxHeight: ${layout.rows[0]?.[0]?.rowMaxHeight}`);
  console.log(`  Drumit rows: ${layout.rows.length}`);
}
