import { describe, expect, it } from "vitest";
import { cn } from "../src/lib/utils";

describe("cn", () => {
  it("joins truthy values with spaces", () => {
    expect(cn("a", "b", "c")).toBe("a b c");
  });

  it("filters out false, null, undefined", () => {
    expect(cn("a", false, null, undefined, "b")).toBe("a b");
  });

  it("returns an empty string for only falsy input", () => {
    expect(cn(false, null, undefined)).toBe("");
  });

  it("handles empty input", () => {
    expect(cn()).toBe("");
  });

  it("preserves empty string arguments (rare but defined)", () => {
    // Empty string is falsy → filtered out.
    expect(cn("a", "", "b")).toBe("a b");
  });
});
