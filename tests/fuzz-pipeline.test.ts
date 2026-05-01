// Fuzz pipeline: for each seed, build a random score, chain multiple
// edits, then push the result through every downstream layer. A pass
// means every stage accepted every intermediate — any layer-boundary
// assumption that breaks on some combination of inputs surfaces here.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { parseDrumtab } from "../src/notation/parser";
import { serializeScore } from "../src/notation/serialize";
import { layoutScore } from "../src/notation/layout";
import { DrumChart } from "../src/notation/renderer";
import { schedule } from "../src/notation/scheduler";
import { exportScoreToMidi } from "../src/notation/midiExport";
import { expandScore } from "../src/notation/expand";
import {
  toggleSlot,
  cycleDots,
  toggleArticulation,
  setLaneDivision,
  toggleBarRepeatEnd,
} from "../src/notation/edit";
import type { Score, Instrument } from "../src/notation/types";

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const INSTRUMENTS: Instrument[] = [
  "kick",
  "snare",
  "hihatClosed",
  "ride",
  "crashLeft",
  "floorTom",
];
const ARTICULATIONS = ["accent", "ghost", "flam", "roll"] as const;

function randomStartBar(r: () => number): string {
  const rand = <T>(arr: readonly T[]) => arr[Math.floor(r() * arr.length)];
  const divisions = [1, 2, 3, 4, 6];
  const lanes = [
    ["hh", ["x"]],
    ["bd", ["o"]],
    ["sn", ["o", "(o)", ">o"]],
  ] as const;
  const beats = Array.from({ length: 4 }, () => {
    const d = rand(divisions);
    return lanes
      .map(([alias, heads]) => {
        const tokens: string[] = [];
        for (let i = 0; i < d; i += 1) {
          tokens.push(r() < 0.3 ? "-" : rand(heads));
        }
        return `${alias}: ${tokens.join(" ")}`;
      })
      .join("  ");
  });
  return `| ${beats.join(" / ")} |`;
}

function applyRandomEdit(score: Score, r: () => number): Score {
  const rand = <T>(arr: readonly T[]) => arr[Math.floor(r() * arr.length)];
  const totalBars = score.sections.reduce((n, s) => n + s.bars.length, 0);
  if (totalBars === 0) return score;
  const barIdx = Math.floor(r() * totalBars);
  const op = Math.floor(r() * 5);
  try {
    switch (op) {
      case 0: {
        const inst = rand(INSTRUMENTS);
        return toggleSlot(score, barIdx, 0, inst, 0);
      }
      case 1: {
        const inst = rand(INSTRUMENTS);
        return cycleDots(score, barIdx, 0, inst, 0);
      }
      case 2: {
        const inst = rand(INSTRUMENTS);
        const art = rand(ARTICULATIONS);
        return toggleArticulation(score, barIdx, 0, inst, 0, art);
      }
      case 3: {
        const inst = rand(INSTRUMENTS);
        const d = 1 + Math.floor(r() * 4);
        return setLaneDivision(score, barIdx, 0, inst, d);
      }
      case 4:
        return toggleBarRepeatEnd(score, barIdx, 2);
      default:
        return score;
    }
  } catch {
    // Edit may be a no-op on unusual bars — that's fine.
    return score;
  }
}

describe("fuzz: seed → parse → 5 edits → full pipeline", () => {
  for (let seed = 0; seed < 40; seed += 1) {
    it(`seed=${seed} survives 5 random edits + full downstream pipeline`, () => {
      const r = rng(seed + 1);
      const src = `title: Fuzz\ntempo: 100\nmeter: 4/4\n[A]\n${randomStartBar(r)}\n${randomStartBar(r)}\n`;
      const p1 = parseDrumtab(src);
      expect(p1.diagnostics.filter((d) => d.level === "error")).toHaveLength(0);
      let s = p1.score;
      for (let i = 0; i < 5; i += 1) {
        s = applyRandomEdit(s, r);
      }

      // Every layer must accept the result without error.
      const out = serializeScore(s);
      const p2 = parseDrumtab(out);
      expect(p2.diagnostics.filter((d) => d.level === "error")).toHaveLength(0);
      expect(serializeScore(p2.score)).toBe(out);

      const layout = layoutScore(p2.score, {
        showLabels: false,
        expanded: false,
        width: 900,
      });
      expect(layout.height).toBeGreaterThan(0);
      for (const bar of layout.rows.flat()) {
        expect(bar.height).toBeGreaterThan(0);
        for (const h of bar.hits) {
          expect(Number.isFinite(h.x)).toBe(true);
          expect(Number.isFinite(h.y)).toBe(true);
        }
      }

      const svg = renderToStaticMarkup(
        createElement(DrumChart, { layout, showLabels: false }),
      );
      expect(svg.startsWith("<svg")).toBe(true);

      const { totalDuration } = schedule(p2.score);
      expect(totalDuration).toBeGreaterThan(0);

      const midi = exportScoreToMidi(p2.score);
      expect(midi.length).toBeGreaterThan(50);

      const expanded = expandScore(p2.score);
      expect(
        expanded.sections.reduce((n, s) => n + s.bars.length, 0),
      ).toBeGreaterThan(0);
    });
  }
});
