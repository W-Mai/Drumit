import { describe, expect, it, vi } from "vitest";
import { GiteeProvider } from "../src/community/providers/GiteeProvider";
import { GiteaProvider } from "../src/community/providers/GiteaProvider";
import type { SourceConfig } from "../src/community/GitProvider";

function mockFetch(handler: (url: string) => Response | Promise<Response>) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    return handler(url);
  });
}

const giteeConfig: SourceConfig & { kind: "gitee" } = {
  id: "gitee:user/repo",
  kind: "gitee",
  owner: "user",
  repo: "repo",
  branch: "main",
  displayName: "Gitee Repo",
};

const giteaConfig: SourceConfig & { kind: "gitea" } = {
  id: "gitea:git.example.com/user/repo",
  kind: "gitea",
  host: "git.example.com",
  owner: "user",
  repo: "repo",
  branch: "develop",
  displayName: "Gitea Repo",
};

describe("GiteeProvider", () => {
  it("fetches from gitee.com raw URL", async () => {
    const fetchImpl = mockFetch((url) => {
      expect(url).toBe(
        "https://gitee.com/user/repo/raw/main/index.json",
      );
      return new Response(
        JSON.stringify({ generatedAt: "x", scores: [] }),
        { status: 200 },
      );
    });
    const p = new GiteeProvider(giteeConfig, fetchImpl as unknown as typeof fetch);
    const index = await p.loadIndex();
    expect(index.scores).toEqual([]);
  });

  it("uses 'master' as default branch", async () => {
    const fetchImpl = mockFetch((url) => {
      expect(url).toContain("/master/");
      return new Response(
        JSON.stringify({ generatedAt: "x", scores: [] }),
        { status: 200 },
      );
    });
    const p = new GiteeProvider(
      { ...giteeConfig, branch: undefined },
      fetchImpl as unknown as typeof fetch,
    );
    await p.loadIndex();
  });
});

describe("GiteaProvider", () => {
  it("fetches from the host's raw URL with branch in path", async () => {
    const fetchImpl = mockFetch((url) => {
      expect(url).toBe(
        "https://git.example.com/user/repo/raw/branch/develop/index.json",
      );
      return new Response(
        JSON.stringify({ generatedAt: "x", scores: [] }),
        { status: 200 },
      );
    });
    const p = new GiteaProvider(giteaConfig, fetchImpl as unknown as typeof fetch);
    const index = await p.loadIndex();
    expect(index.scores).toEqual([]);
  });

  it("strips trailing slash from host", async () => {
    const fetchImpl = mockFetch((url) => {
      expect(url).toBe(
        "https://git.example.com/user/repo/raw/branch/main/index.json",
      );
      return new Response(
        JSON.stringify({ generatedAt: "x", scores: [] }),
        { status: 200 },
      );
    });
    const p = new GiteaProvider(
      { ...giteaConfig, host: "https://git.example.com/", branch: "main" },
      fetchImpl as unknown as typeof fetch,
    );
    await p.loadIndex();
  });

  it("loads a score path as raw text", async () => {
    const fetchImpl = mockFetch(
      () =>
        new Response("title: Demo\nmeter: 4/4\n[A]\n| hh: x x x x |\n", {
          status: 200,
        }),
    );
    const p = new GiteaProvider(giteaConfig, fetchImpl as unknown as typeof fetch);
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
    const p = new GiteaProvider(giteaConfig, fetchImpl as unknown as typeof fetch);
    const index = await p.loadIndex();
    expect(index.scores).toEqual([]);
    expect(calls).toBe(2);
  });
});
