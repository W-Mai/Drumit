import { describe, expect, it } from "vitest";
import { validateScore } from "../src/notation/validate";
import type { Score } from "../src/notation/types";

const emptyScore: Score = {
  version: 1,
  title: "OK",
  meter: { beats: 4, beatUnit: 4 },
  sections: [{ label: "A", bars: [] }],
};

describe("validateScore", () => {
  it("reports no diagnostics for a minimally valid score", () => {
    expect(validateScore(emptyScore)).toEqual([]);
  });

  it("errors when title is blank", () => {
    const s: Score = { ...emptyScore, title: "" };
    const d = validateScore(s);
    expect(d.some((x) => x.level === "error" && /title/i.test(x.message))).toBe(
      true,
    );
  });

  it("errors when title is whitespace-only", () => {
    const s: Score = { ...emptyScore, title: "   \t  " };
    expect(
      validateScore(s).some(
        (x) => x.level === "error" && /title/i.test(x.message),
      ),
    ).toBe(true);
  });

  it("errors when meter is missing", () => {
    const s = {
      ...emptyScore,
      meter: { beats: 0, beatUnit: 0 },
    } as Score;
    expect(
      validateScore(s).some(
        (x) => x.level === "error" && /meter/i.test(x.message),
      ),
    ).toBe(true);
  });

  it("errors when there are zero sections", () => {
    const s: Score = { ...emptyScore, sections: [] };
    expect(
      validateScore(s).some(
        (x) => x.level === "error" && /section/i.test(x.message),
      ),
    ).toBe(true);
  });

  it("accumulates multiple errors", () => {
    const s = {
      ...emptyScore,
      title: "",
      meter: { beats: 0, beatUnit: 0 },
      sections: [],
    } as Score;
    const d = validateScore(s);
    expect(d.length).toBeGreaterThanOrEqual(3);
  });
});
