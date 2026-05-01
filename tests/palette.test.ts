import { describe, expect, it } from "vitest";
import {
  instrumentAccent,
  rowGroupAccent,
} from "../src/notation/palette";

describe("palette", () => {
  it("exposes a colour entry for every row group", () => {
    expect(Object.keys(rowGroupAccent)).toEqual(
      expect.arrayContaining(["cymbals", "toms", "snare", "kick"]),
    );
  });

  it("instrumentAccent routes every instrument to its row-group palette", () => {
    expect(instrumentAccent("kick")).toBe(rowGroupAccent.kick);
    expect(instrumentAccent("snare")).toBe(rowGroupAccent.snare);
    expect(instrumentAccent("hihatClosed")).toBe(rowGroupAccent.cymbals);
    expect(instrumentAccent("ride")).toBe(rowGroupAccent.cymbals);
    expect(instrumentAccent("tomHigh")).toBe(rowGroupAccent.toms);
    expect(instrumentAccent("floorTom")).toBe(rowGroupAccent.toms);
  });

  it("every palette entry has solid/tint/text/ring classes", () => {
    for (const rg of Object.values(rowGroupAccent)) {
      expect(rg.solid).toMatch(/bg-/);
      expect(rg.tint).toMatch(/bg-/);
      expect(rg.text).toMatch(/text-/);
      expect(rg.ring).toMatch(/ring-/);
    }
  });
});
