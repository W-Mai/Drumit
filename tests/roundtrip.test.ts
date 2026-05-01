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
    ["ride", ["o"]],
    ["t1", ["o"]],
  ] as const;
  const divisions = [1, 2, 3, 4, 6, 8];
  const pickLanes = 1 + Math.floor(r() * 4); // 1..4 lanes
  const beats = Array.from({ length: 4 }, () => {
    const d = rand(divisions);
    // Fisher-Yates with our rng to deterministically pick N lanes.
    const shuffled = lanes.slice();
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = Math.floor(r() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const chosen = shuffled.slice(0, pickLanes);
    return chosen
      .map(([alias, heads]) => {
        const tokens: string[] = [];
        for (let i = 0; i < d; i += 1) {
          if (r() < 0.3) tokens.push("-");
          else {
            const base = rand(heads);
            // 15% chance of a dot on this hit (if it's a head, not a rest).
            const dots = r() < 0.15 ? "." : r() < 0.03 ? ".." : "";
            tokens.push(base + dots);
          }
        }
        // 25% chance: split this beat into two `,` groups.
        if (r() < 0.25 && tokens.length >= 2) {
          const mid = Math.floor(tokens.length / 2);
          return `${alias}: ${tokens.slice(0, mid).join(" ")} , ${tokens.slice(mid).join(" ")}`;
        }
        return `${alias}: ${tokens.join(" ")}`;
      })
      .join("  ");
  });
  return `| ${beats.join(" / ")} |`;
}

describe("round-trip fuzz", () => {
  const cases = Array.from({ length: 100 }, (_, i) => i);
  for (const seed of cases) {
    it(`seed=${seed} parses, serializes, re-parses without error`, () => {
      const r = rng(seed + 1);
      const barCount = 2 + Math.floor(r() * 5); // 2..6 bars
      const bars = Array.from({ length: barCount }, () => randomBar(r));
      const src = `title: Fuzz\nmeter: 4/4\n[A]\n${bars.join("\n")}\n`;
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
