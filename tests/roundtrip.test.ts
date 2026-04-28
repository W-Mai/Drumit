import { describe, expect, it } from "vitest";
import { parseDrumtab } from "../src/notation/parser";
import { serializeScore } from "../src/notation/serialize";
import { layoutScore } from "../src/notation/layout";

/** Little helper: seeded mulberry32 random so runs are deterministic. */
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

function randomBar(r: () => number): string {
  const rand = <T>(arr: readonly T[]) => arr[Math.floor(r() * arr.length)];
  const lanes = [
    ["hh", ["x"]],
    ["bd", ["o"]],
    ["sn", ["o", "(o)", ">o", "o/R", "o/L"]],
    ["cr", ["o"]],
    ["ft", ["o"]],
  ] as const;
  const divisions = [1, 2, 3, 4, 6];
  const beats = Array.from({ length: 4 }, () => {
    const d = rand(divisions);
    // Pick 2 lanes
    return lanes
      .slice(0, 3)
      .map(([alias, heads]) => {
        const tokens: string[] = [];
        for (let i = 0; i < d; i += 1) {
          tokens.push(r() < 0.35 ? "-" : rand(heads));
        }
        return `${alias}: ${tokens.join(" ")}`;
      })
      .join("  ");
  });
  return `| ${beats.join(" / ")} |`;
}

describe("round-trip fuzz", () => {
  const cases = Array.from({ length: 20 }, (_, i) => i);
  for (const seed of cases) {
    it(`seed=${seed} parses, serializes, re-parses without error`, () => {
      const r = rng(seed + 1);
      const src = `title: Fuzz\nmeter: 4/4\n[A]\n${randomBar(r)}\n${randomBar(r)}\n${randomBar(r)}\n${randomBar(r)}\n`;
      const p1 = parseDrumtab(src);
      expect(p1.diagnostics.filter((d) => d.level === "error")).toHaveLength(0);
      const out1 = serializeScore(p1.score);
      const p2 = parseDrumtab(out1);
      expect(p2.diagnostics.filter((d) => d.level === "error")).toHaveLength(0);
      const out2 = serializeScore(p2.score);
      // Idempotent: a second round-trip is a fixed point.
      expect(out2).toBe(out1);
      // Layout doesn't throw & height positive.
      const layout = layoutScore(p2.score, {
        showLabels: false,
        expanded: false,
        width: 900,
      });
      expect(layout.height).toBeGreaterThan(0);
      layout.rows
        .flat()
        .forEach((bar) =>
          bar.hits.forEach((h) => {
            expect(Number.isFinite(h.x)).toBe(true);
            expect(Number.isFinite(h.y)).toBe(true);
          }),
        );
    });
  }
});
