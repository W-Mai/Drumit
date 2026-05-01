import { parseDrumtab } from "../src/notation/parser";
import { layoutScore } from "../src/notation/layout";

const cases: { name: string; src: string; width: number }[] = [
  {
    name: "A: cr/hh/bd/sn/ft multi-lane",
    width: 1200,
    src: `title: T
meter: 4/4
[A]
| cr: -- / - / - / -  hh: oo / o , o- / o- , o / oo  bd: o- / - , -o / -o , o / - , --  sn: - / x- / -- / x-  ft: - / - , -- / - / - |`,
  },
  {
    name: "B: hh 16ths + varied drums",
    width: 1200,
    src: `title: T
meter: 4/4
[A]
| hh: oooo / oooo / oooo / oooo  bd: oooo / o- / o- / o-  sn: -- / -x / -x / -x  hho: ---- / - / - / -  ride: - / o--- / - / -  cr: - / -o-- / - / -  cr2: - / --o- / - / -  t1: - / ---o / - / - |`,
  },
  {
    name: "C: oooo + o- + -x",
    width: 900,
    src: `title: T
meter: 4/4
[A]
| hh: oooo / oooo / oooo / oooo  bd: o- / o- / o- / o-  sn: -x / -x / -x / -x |`,
  },
  {
    name: "D: o.o dotted",
    width: 900,
    src: `title: T
meter: 4/4
[A]
| hh: o.o / oo / oo / oo |`,
  },
  {
    name: "E: sn - , -x  bd o , --",
    width: 900,
    src: `title: T
meter: 4/4
[A]
| sn: - , -x / - / - / -  bd: o , -- / - / - / - |`,
  },
];

for (const c of cases) {
  console.log(`\n### ${c.name} ###`);
  const bar = layoutScore(parseDrumtab(c.src).score, {
    width: c.width,
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
}
