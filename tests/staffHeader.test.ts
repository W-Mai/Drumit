import { describe, expect, it } from "vitest";
import { parseDrumtab } from "../src/notation/parser";
import { layoutStaff } from "../src/notation/staff/layout";

function layoutOf(source: string) {
  const { score } = parseDrumtab(source);
  return layoutStaff(score, { width: 800 });
}

describe("staff header — meta drives band height", () => {
  it("uses the base header band when no extra meta is present", () => {
    const layout = layoutOf(
      `title: Bare\nmeter: 4/4\n[A]\n| hh: x x x x |`,
    );
    expect(layout.headerHeight).toBe(42);
  });

  it("grows when composer is present", () => {
    const layout = layoutOf(
      `title: Demo\ncomposer: Alice\nmeter: 4/4\n[A]\n| hh: x x x x |`,
    );
    expect(layout.headerHeight).toBeGreaterThan(42);
  });

  it("grows when license is present (sharing the subtitle row)", () => {
    const layout = layoutOf(
      `title: Demo\nlicense: MIT\nmeter: 4/4\n[A]\n| hh: x x x x |`,
    );
    expect(layout.headerHeight).toBeGreaterThan(42);
  });
});
