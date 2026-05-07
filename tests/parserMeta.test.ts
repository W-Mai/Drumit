import { describe, expect, it } from "vitest";
import { parseDrumtab } from "../src/notation/parser";
import { serializeScore } from "../src/notation/serialize";

const baseBar = "[A]\n| hh: x x x x  bd: o - o -  sn: - o - o |\n";

function parseHeaders(extraHeaders: string) {
  return parseDrumtab(
    `title: Demo\nmeter: 4/4\n${extraHeaders}${baseBar}`,
  );
}

describe("parser — meta headers", () => {
  it("parses composer as comma-split list", () => {
    const { score, diagnostics } = parseHeaders("composer: A, B, C\n");
    expect(diagnostics.filter((d) => d.level === "error")).toHaveLength(0);
    expect(score.composer).toEqual(["A", "B", "C"]);
  });

  it("merges composer across multiple header lines", () => {
    const { score } = parseHeaders("composer: A\ncomposer: B, C\n");
    expect(score.composer).toEqual(["A", "B", "C"]);
  });

  it("parses single-string meta fields", () => {
    const { score } = parseHeaders(
      "arranger: Alice\ntranscriber: Bob\nalbum: Greatest Hits\nlicense: CC-BY-4.0\nsource: https://example.com/x\nchangelog: v2 fix chorus\n",
    );
    expect(score.arranger).toBe("Alice");
    expect(score.transcriber).toBe("Bob");
    expect(score.album).toBe("Greatest Hits");
    expect(score.license).toBe("CC-BY-4.0");
    expect(score.sourceUrl).toBe("https://example.com/x");
    expect(score.changelog).toBe("v2 fix chorus");
  });

  it("parses style and techniques as multi-value", () => {
    const { score } = parseHeaders(
      "style: rock, funk\ntechniques: triplet, blast\n",
    );
    expect(score.style).toEqual(["rock", "funk"]);
    expect(score.techniques).toEqual(["triplet", "blast"]);
  });

  it("parses difficulty as 1..5 integer", () => {
    const { score } = parseHeaders("difficulty: 3\n");
    expect(score.difficulty).toBe(3);
  });

  it("rejects out-of-range difficulty with an error", () => {
    const { score, diagnostics } = parseHeaders("difficulty: 9\n");
    expect(score.difficulty).toBeUndefined();
    expect(diagnostics.some((d) => d.level === "error")).toBe(true);
  });

  it("accepts a valid slug", () => {
    const { score, diagnostics } = parseHeaders("slug: my-funk-groove\n");
    expect(diagnostics.filter((d) => d.level === "error")).toHaveLength(0);
    expect(score.slug).toBe("my-funk-groove");
  });

  it("rejects an invalid slug", () => {
    const { score, diagnostics } = parseHeaders("slug: My Funk!\n");
    expect(score.slug).toBeUndefined();
    expect(diagnostics.some((d) => d.level === "error")).toBe(true);
  });

  it("does not warn 'Unknown header' for newly registered keys", () => {
    const { diagnostics } = parseHeaders(
      "composer: A\nstyle: rock\nlicense: MIT\n",
    );
    expect(
      diagnostics.filter((d) => /Unknown header/.test(d.message)),
    ).toHaveLength(0);
  });
});

describe("serializer — meta headers", () => {
  it("round-trips every meta field", () => {
    const source =
      `title: Demo\nartist: An Artist\ncomposer: A, B\narranger: C\ntranscriber: D\nalbum: Album X\ntempo: 120\nmeter: 4/4\nlicense: CC-BY-4.0\ndifficulty: 3\nstyle: rock, funk\ntechniques: triplet\nsource: https://example.com\nslug: demo-track\nchangelog: v1\n\n` +
      baseBar;
    const { score, diagnostics } = parseDrumtab(source);
    expect(diagnostics.filter((d) => d.level === "error")).toHaveLength(0);
    const out = serializeScore(score);
    const reparsed = parseDrumtab(out);
    expect(reparsed.diagnostics.filter((d) => d.level === "error")).toHaveLength(0);
    expect(reparsed.score.composer).toEqual(["A", "B"]);
    expect(reparsed.score.arranger).toBe("C");
    expect(reparsed.score.transcriber).toBe("D");
    expect(reparsed.score.album).toBe("Album X");
    expect(reparsed.score.license).toBe("CC-BY-4.0");
    expect(reparsed.score.difficulty).toBe(3);
    expect(reparsed.score.style).toEqual(["rock", "funk"]);
    expect(reparsed.score.techniques).toEqual(["triplet"]);
    expect(reparsed.score.sourceUrl).toBe("https://example.com");
    expect(reparsed.score.slug).toBe("demo-track");
    expect(reparsed.score.changelog).toBe("v1");
  });

  it("omits absent meta fields", () => {
    const { score } = parseDrumtab(`title: Bare\nmeter: 4/4\n${baseBar}`);
    const out = serializeScore(score);
    expect(out).not.toMatch(/composer:/);
    expect(out).not.toMatch(/license:/);
    expect(out).not.toMatch(/style:/);
    expect(out).not.toMatch(/slug:/);
  });
});
