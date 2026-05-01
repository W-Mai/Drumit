import { describe, expect, it } from "vitest";
import {
  gmDrumMap,
  hitVelocity,
  DEFAULT_NOTE_DURATION_S,
} from "../src/notation/midi";
import type { Hit } from "../src/notation/types";

function hit(articulations: Hit["articulations"] = []): Hit {
  return { instrument: "snare", head: "x", articulations };
}

describe("gmDrumMap", () => {
  it("covers every playable instrument with a GM note number", () => {
    const instruments: Array<keyof typeof gmDrumMap> = [
      "kick",
      "snare",
      "hihatClosed",
      "hihatHalfOpen",
      "hihatOpen",
      "hihatFoot",
      "ride",
      "rideBell",
      "crashLeft",
      "crashRight",
      "tomHigh",
      "tomMid",
      "floorTom",
    ];
    for (const inst of instruments) {
      expect(gmDrumMap[inst]).toBeGreaterThanOrEqual(0);
      expect(gmDrumMap[inst]).toBeLessThanOrEqual(127);
    }
  });

  it("matches canonical GM percussion note numbers", () => {
    expect(gmDrumMap.kick).toBe(36); // Bass Drum 1
    expect(gmDrumMap.snare).toBe(38); // Acoustic Snare
    expect(gmDrumMap.hihatClosed).toBe(42);
    expect(gmDrumMap.hihatOpen).toBe(46);
    expect(gmDrumMap.ride).toBe(51);
    expect(gmDrumMap.crashLeft).toBe(49);
    expect(gmDrumMap.floorTom).toBe(41);
  });
});

describe("hitVelocity", () => {
  it("returns 80 for a plain hit", () => {
    expect(hitVelocity(hit())).toBe(80);
  });

  it("returns 40 for a ghost hit", () => {
    expect(hitVelocity(hit(["ghost"]))).toBe(40);
  });

  it("returns 120 for an accented hit", () => {
    expect(hitVelocity(hit(["accent"]))).toBe(120);
  });

  it("ghost beats accent when both are present (softer wins, per jianpu)", () => {
    // Contradictory articulations shouldn't crash.
    expect(hitVelocity(hit(["ghost", "accent"]))).toBe(40);
  });

  it("ignores non-velocity articulations (flam / roll / choke)", () => {
    expect(hitVelocity(hit(["flam"]))).toBe(80);
    expect(hitVelocity(hit(["roll"]))).toBe(80);
    expect(hitVelocity(hit(["choke"]))).toBe(80);
  });
});

describe("DEFAULT_NOTE_DURATION_S", () => {
  it("is a short positive duration", () => {
    expect(DEFAULT_NOTE_DURATION_S).toBeGreaterThan(0);
    expect(DEFAULT_NOTE_DURATION_S).toBeLessThan(0.5);
  });
});
