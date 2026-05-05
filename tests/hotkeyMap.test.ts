import { describe, expect, it } from "vitest";
import {
  INSTRUMENT_BY_DIGIT,
  DIGIT_BY_INSTRUMENT,
} from "../src/notation/hotkeyMap";

describe("hotkey map", () => {
  it("maps 9 digit keys (0 is reserved for explicit rest)", () => {
    expect(Object.keys(INSTRUMENT_BY_DIGIT)).toHaveLength(9);
    expect(INSTRUMENT_BY_DIGIT["0"]).toBeUndefined();
  });

  it("each instrument appears exactly once", () => {
    const instruments = Object.values(INSTRUMENT_BY_DIGIT);
    expect(new Set(instruments).size).toBe(instruments.length);
  });

  it("reverse map is consistent with forward map", () => {
    for (const [digit, inst] of Object.entries(INSTRUMENT_BY_DIGIT)) {
      expect(DIGIT_BY_INSTRUMENT[inst]).toBe(digit);
    }
  });

  it("digit keys are all single numeric characters", () => {
    for (const digit of Object.keys(INSTRUMENT_BY_DIGIT)) {
      expect(digit).toMatch(/^[0-9]$/);
    }
  });
});
