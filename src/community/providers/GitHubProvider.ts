import type {
  GitProvider,
  LoadedScore,
  ScoreIndex,
  SourceConfig,
} from "../GitProvider";
import { parseIndexJson } from "./shared";

const RAW_BASE = "https://raw.githubusercontent.com";

export class GitHubProvider implements GitProvider {
  readonly id: string;
  readonly displayName: string;
  private readonly owner: string;
  private readonly repo: string;
  private readonly branch: string;
  private readonly fetchImpl: typeof fetch;

  constructor(config: SourceConfig & { kind: "github" }, fetchImpl?: typeof fetch) {
    this.id = config.id;
    this.displayName = config.displayName;
    this.owner = config.owner;
    this.repo = config.repo;
    this.branch = config.branch ?? "main";
    // Allow tests to inject a stub; otherwise default to global fetch and
    // bind to globalThis so methods don't lose `this` when fetched off the
    // global.
    this.fetchImpl = fetchImpl ?? ((...args) => fetch(...args));
  }

  private rawUrl(path: string): string {
    const trimmed = path.replace(/^\/+/, "");
    return `${RAW_BASE}/${this.owner}/${this.repo}/${this.branch}/${trimmed}`;
  }

  async loadIndex(): Promise<ScoreIndex> {
    const text = await this.getText("index.json");
    return parseIndexJson(text, this.id);
  }

  async loadScore(path: string): Promise<LoadedScore> {
    const source = await this.getText(path);
    return { source };
  }

  async upsertScore(
    path: string,
    source: string,
    message: string,
    token: string,
    branch?: string,
  ): Promise<{ sha: string }> {
    const targetBranch = branch ?? this.branch;
    const api = `https://api.github.com/repos/${this.owner}/${this.repo}/contents/${path}`;
    const existing = await this.fetchImpl(api + `?ref=${targetBranch}`, {
      headers: { Authorization: `token ${token}` },
    });
    let sha: string | undefined;
    if (existing.ok) {
      const data = (await existing.json()) as { sha: string };
      sha = data.sha;
    }
    const body: Record<string, string> = {
      message,
      content: btoa(unescape(encodeURIComponent(source))),
      branch: targetBranch,
    };
    if (sha) body.sha = sha;
    const res = await this.fetchImpl(api, {
      method: "PUT",
      headers: {
        Authorization: `token ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => "");
      throw new Error(`upsertScore failed: ${res.status} ${err}`);
    }
    const result = (await res.json()) as { content: { sha: string } };
    return { sha: result.content.sha };
  }

  async ensureFork(token: string): Promise<{ owner: string; repo: string }> {
    const api = `https://api.github.com/repos/${this.owner}/${this.repo}/forks`;
    const res = await this.fetchImpl(api, {
      method: "POST",
      headers: {
        Authorization: `token ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });
    if (!res.ok && res.status !== 202) {
      throw new Error(`ensureFork failed: ${res.status}`);
    }
    const data = (await res.json()) as { owner: { login: string }; name: string };
    const forkOwner = data.owner.login;
    const forkRepo = data.name;
    for (let i = 0; i < 30; i += 1) {
      await delay(2000);
      const check = await this.fetchImpl(
        `https://api.github.com/repos/${forkOwner}/${forkRepo}`,
        { headers: { Authorization: `token ${token}` } },
      );
      if (check.ok) return { owner: forkOwner, repo: forkRepo };
    }
    throw new Error("Fork timed out after 60 seconds");
  }

  async openPR(
    title: string,
    body: string,
    head: string,
    base: string,
    token: string,
  ): Promise<{ url: string }> {
    const api = `https://api.github.com/repos/${this.owner}/${this.repo}/pulls`;
    const res = await this.fetchImpl(api, {
      method: "POST",
      headers: {
        Authorization: `token ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ title, body, head, base }),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => "");
      throw new Error(`openPR failed: ${res.status} ${err}`);
    }
    const data = (await res.json()) as { html_url: string };
    return { url: data.html_url };
  }

  private async getText(path: string): Promise<string> {
    const url = this.rawUrl(path);
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const res = await this.fetchImpl(url);
        if (!res.ok) {
          throw new Error(
            `GET ${url} failed: ${res.status} ${res.statusText}`,
          );
        }
        return await res.text();
      } catch (err) {
        lastErr = err;
        if (attempt === 0) await delay(300);
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
