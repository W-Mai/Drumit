import { describe, expect, it } from "vitest";
import { isValidSlug, slugify } from "../src/notation/slug";

describe("slugify", () => {
  it("lowercases and replaces spaces with dash", () => {
    expect(slugify("My Funk Groove")).toBe("my-funk-groove");
  });

  it("strips leading and trailing dashes", () => {
    expect(slugify("  Hello, world!  ")).toBe("hello-world");
  });

  it("collapses runs of non-alphanumerics into single dash", () => {
    expect(slugify("a___b---c   d")).toBe("a-b-c-d");
  });

  it("ASCII-folds accented Latin", () => {
    expect(slugify("Café Olé")).toBe("cafe-ole");
  });

  it("drops CJK characters (no transliteration)", () => {
    // Pure CJK input becomes empty; user must hand-type a slug.
    expect(slugify("摇滚")).toBe("");
    expect(slugify("rock 摇滚 groove")).toBe("rock-groove");
  });

  it("returns empty string on empty input", () => {
    expect(slugify("")).toBe("");
  });
});

describe("isValidSlug", () => {
  it("accepts kebab-case", () => {
    expect(isValidSlug("my-funk-groove")).toBe(true);
    expect(isValidSlug("a")).toBe(true);
    expect(isValidSlug("abc123")).toBe(true);
  });

  it("rejects empty / leading dash / trailing dash / uppercase / underscore", () => {
    expect(isValidSlug("")).toBe(false);
    expect(isValidSlug("-foo")).toBe(false);
    expect(isValidSlug("foo-")).toBe(false);
    expect(isValidSlug("Foo")).toBe(false);
    expect(isValidSlug("foo_bar")).toBe(false);
    expect(isValidSlug("foo bar")).toBe(false);
    expect(isValidSlug("foo/bar")).toBe(false);
  });
});
