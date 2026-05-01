import { parseDrumtab } from "../src/notation/parser";
import { layoutScore } from "../src/notation/layout";

const src = `title: T
meter: 4/4
[A]
| cr: -- / - / - / -  hh: oo / o , o- / o- , o / oo  bd: o- / - , -o / -o , o / - , --  sn: - / x- / -- / x-  ft: - / - , -- / - / - |`;
const bar = layoutScore(parseDrumtab(src).score, {
  width: 1200,
  showLabels: false,
  expanded: false,
}).rows[0][0];
bar.beats.forEach((bt, i) => {
  console.log(`beat ${i}:`);
  for (const bm of bt.beams) {
    console.log(
      `  rg=${bm.rowGroup} d=${bm.depth} x=[${bm.x1.toFixed(1)},${bm.x2.toFixed(1)}]`,
    );
  }
});
