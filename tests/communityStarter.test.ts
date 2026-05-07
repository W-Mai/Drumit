import { describe, expect, it } from "vitest";
import { parseScoreMeta } from "../docs/community-starter/scripts/parser";

describe("starter parser (docs/community-starter)", () => {
  it("extracts every meta key the canonical parser handles", () => {
    const source = `title: Demo
artist: A
composer: X, Y
arranger: Z
transcriber: T
album: Album
tempo: 120
meter: 4/4
license: MIT
difficulty: 4
style: rock, funk
techniques: triplet
source: https://example.com
slug: demo
changelog: v1

[A]
| hh: x x x x |
`;
    const meta = parseScoreMeta(source);
    expect(meta.title).toBe("Demo");
    expect(meta.composer).toEqual(["X", "Y"]);
    expect(meta.arranger).toBe("Z");
    expect(meta.transcriber).toBe("T");
    expect(meta.album).toBe("Album");
    expect(meta.tempo).toBe(120);
    expect(meta.meter).toBe("4/4");
    expect(meta.license).toBe("MIT");
    expect(meta.difficulty).toBe(4);
    expect(meta.style).toEqual(["rock", "funk"]);
    expect(meta.techniques).toEqual(["triplet"]);
    expect(meta.sourceUrl).toBe("https://example.com");
    expect(meta.slug).toBe("demo");
    expect(meta.changelog).toBe("v1");
  });

  it("ignores section bodies and stops at first [section]", () => {
    const source = `title: T
[A]
slug: should-not-be-picked-up
| hh: x x x x |
`;
    const meta = parseScoreMeta(source);
    expect(meta.title).toBe("T");
    expect(meta.slug).toBeUndefined();
  });

  it("rejects out-of-range difficulty and invalid slug silently", () => {
    const meta = parseScoreMeta(`title: T\ndifficulty: 9\nslug: Bad Slug\n`);
    expect(meta.difficulty).toBeUndefined();
    expect(meta.slug).toBeUndefined();
  });

  it("merges composer across multiple lines", () => {
    const meta = parseScoreMeta(`title: T\ncomposer: A\ncomposer: B, C\n`);
    expect(meta.composer).toEqual(["A", "B", "C"]);
  });
});
