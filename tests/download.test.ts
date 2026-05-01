// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { triggerDownload, filenameStem } from "../src/notation/exporters/download";

describe("triggerDownload", () => {
  it("creates a transient anchor with the given filename and clicks it", () => {
    const blob = new Blob(["hello"], { type: "text/plain" });
    const createSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:fake");
    const revokeSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    triggerDownload(blob, "test.txt");

    expect(createSpy).toHaveBeenCalledWith(blob);
    expect(clickSpy).toHaveBeenCalledOnce();
    createSpy.mockRestore();
    revokeSpy.mockRestore();
    clickSpy.mockRestore();
  });

  it("revokes the object URL on next tick", async () => {
    const blob = new Blob(["x"], { type: "text/plain" });
    const createSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:fake");
    const revokeSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    triggerDownload(blob, "a.txt");
    await new Promise((r) => setTimeout(r, 5));
    expect(revokeSpy).toHaveBeenCalledWith("blob:fake");
    createSpy.mockRestore();
    revokeSpy.mockRestore();
  });

  it("removes the anchor from the DOM after clicking", () => {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:fake");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const before = document.querySelectorAll("a").length;
    triggerDownload(new Blob(["x"]), "y.txt");
    expect(document.querySelectorAll("a").length).toBe(before);
  });
});

describe("filenameStem", () => {
  it("slugs whitespace into underscores", () => {
    expect(filenameStem("Hello World Tune")).toBe("Hello_World_Tune");
  });

  it("strips filesystem-unsafe chars", () => {
    expect(filenameStem('weird:*?/<>|"name')).toBe("weirdname");
  });

  it("falls back to 'chart' on empty input", () => {
    expect(filenameStem("")).toBe("chart");
    expect(filenameStem("   ")).toBe("chart");
  });

  it("honors a custom fallback", () => {
    expect(filenameStem("", "drumit")).toBe("drumit");
  });

  it("truncates to 48 chars", () => {
    const long = "a".repeat(60);
    expect(filenameStem(long).length).toBe(48);
  });
});
