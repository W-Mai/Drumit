import type {
  GitProvider,
  LoadedScore,
  ScoreIndex,
  SourceConfig,
} from "../GitProvider";

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
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error(`index.json at ${this.id} is not valid JSON`);
    }
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !Array.isArray((parsed as ScoreIndex).scores)
    ) {
      throw new Error(`index.json at ${this.id} is missing 'scores' array`);
    }
    return parsed as ScoreIndex;
  }

  async loadScore(path: string): Promise<LoadedScore> {
    const source = await this.getText(path);
    return { source };
  }

  // One automatic retry covers transient hiccups (DNS warmup, brief 5xx)
  // without amplifying real outages into long pauses.
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
