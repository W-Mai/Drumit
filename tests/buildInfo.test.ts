import { describe, expect, it } from "vitest";
import { buildInfo } from "../src/lib/buildInfo";

describe("buildInfo", () => {
  it("always provides a non-empty version string", () => {
    expect(typeof buildInfo.version).toBe("string");
    expect(buildInfo.version.length).toBeGreaterThan(0);
  });

  it("falls back to 'dev' / 'unknown' when the define isn't injected", () => {
    // In the Vitest run the Vite define isn't applied, so we expect
    // the fallback values.
    expect(buildInfo.version).toBe("dev");
    expect(buildInfo.gitHash).toBe("unknown");
    expect(buildInfo.gitBranch).toBe("unknown");
    expect(buildInfo.gitDirty).toBe(false);
  });

  it("builtAt is a valid ISO timestamp", () => {
    expect(() => new Date(buildInfo.builtAt)).not.toThrow();
    expect(Number.isNaN(new Date(buildInfo.builtAt).getTime())).toBe(false);
  });
});
