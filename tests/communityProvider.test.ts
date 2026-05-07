import { describe, expect, it, vi } from "vitest";
import { GitHubProvider } from "../src/community/providers/GitHubProvider";
import type { SourceConfig } from "../src/community/GitProvider";

const config: SourceConfig & { kind: "github" } = {
  id: "github:foo/bar",
  kind: "github",
  owner: "foo",
  repo: "bar",
  branch: "main",
  displayName: "Foo Bar",
};

function mockFetch(handler: (url: string) => Response | Promise<Response>) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    return handler(url);
  });
}

describe("GitHubProvider", () => {
  it("loads index.json from raw.githubusercontent.com", async () => {
    const fetchImpl = mockFetch((url) => {
      expect(url).toBe(
        "https://raw.githubusercontent.com/foo/bar/main/index.json",
      );
      return new Response(
        JSON.stringify({
          generatedAt: "2026-05-07",
          scores: [
            { slug: "demo", path: "scores/demo.drumtab", title: "Demo" },
          ],
        }),
        { status: 200 },
      );
    });
    const p = new GitHubProvider(config, fetchImpl as unknown as typeof fetch);
    const index = await p.loadIndex();
    expect(index.scores).toHaveLength(1);
    expect(index.scores[0].slug).toBe("demo");
  });

  it("rejects malformed index.json", async () => {
    const fetchImpl = mockFetch(
      () => new Response("not json", { status: 200 }),
    );
    const p = new GitHubProvider(config, fetchImpl as unknown as typeof fetch);
    await expect(p.loadIndex()).rejects.toThrow(/not valid JSON/);
  });

  it("rejects index.json missing 'scores' array", async () => {
    const fetchImpl = mockFetch(
      () => new Response(JSON.stringify({ generatedAt: "x" }), { status: 200 }),
    );
    const p = new GitHubProvider(config, fetchImpl as unknown as typeof fetch);
    await expect(p.loadIndex()).rejects.toThrow(/missing 'scores'/);
  });

  it("loads a score path as raw text", async () => {
    const fetchImpl = mockFetch((url) => {
      expect(url).toBe(
        "https://raw.githubusercontent.com/foo/bar/main/scores/demo.drumtab",
      );
      return new Response("title: Demo\nmeter: 4/4\n[A]\n| hh: x x x x |\n", {
        status: 200,
      });
    });
    const p = new GitHubProvider(config, fetchImpl as unknown as typeof fetch);
    const { source } = await p.loadScore("scores/demo.drumtab");
    expect(source).toMatch(/^title: Demo/);
  });

  it("retries once on transient failure then succeeds", async () => {
    let calls = 0;
    const fetchImpl = mockFetch(() => {
      calls += 1;
      if (calls === 1) throw new Error("network");
      return new Response(
        JSON.stringify({ generatedAt: "x", scores: [] }),
        { status: 200 },
      );
    });
    const p = new GitHubProvider(config, fetchImpl as unknown as typeof fetch);
    const index = await p.loadIndex();
    expect(index.scores).toEqual([]);
    expect(calls).toBe(2);
  });

  it("throws after second failure", async () => {
    const fetchImpl = mockFetch(() => {
      throw new Error("dead");
    });
    const p = new GitHubProvider(config, fetchImpl as unknown as typeof fetch);
    await expect(p.loadIndex()).rejects.toThrow(/dead/);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("uses non-default branch when provided", async () => {
    const fetchImpl = mockFetch((url) => {
      expect(url).toContain("/develop/");
      return new Response(
        JSON.stringify({ generatedAt: "x", scores: [] }),
        { status: 200 },
      );
    });
    const p = new GitHubProvider(
      { ...config, branch: "develop" },
      fetchImpl as unknown as typeof fetch,
    );
    await p.loadIndex();
  });
});
