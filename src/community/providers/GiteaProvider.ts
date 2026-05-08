import type {
  GitProvider,
  LoadedScore,
  ScoreIndex,
  SourceConfig,
} from "../GitProvider";
import { parseIndexJson } from "./shared";

export class GiteaProvider implements GitProvider {
  readonly id: string;
  readonly displayName: string;
  private readonly host: string;
  private readonly owner: string;
  private readonly repo: string;
  private readonly branch: string;
  private readonly fetchImpl: typeof fetch;

  constructor(config: SourceConfig & { kind: "gitea" }, fetchImpl?: typeof fetch) {
    this.id = config.id;
    this.displayName = config.displayName;
    const raw = config.host.replace(/\/+$/, "");
    this.host = raw.startsWith("http") ? raw : `https://${raw}`;
    this.owner = config.owner;
    this.repo = config.repo;
    this.branch = config.branch ?? "main";
    this.fetchImpl = fetchImpl ?? ((...args) => fetch(...args));
  }

  private rawUrl(path: string): string {
    const trimmed = path.replace(/^\/+/, "");
    return `${this.host}/${this.owner}/${this.repo}/raw/branch/${this.branch}/${trimmed}`;
  }

  async loadIndex(): Promise<ScoreIndex> {
    const text = await this.getText("index.json");
    return parseIndexJson(text, this.id);
  }

  async loadScore(path: string): Promise<LoadedScore> {
    return { source: await this.getText(path) };
  }

  private async getText(path: string): Promise<string> {
    const url = this.rawUrl(path);
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const res = await this.fetchImpl(url);
        if (!res.ok) {
          throw new Error(`GET ${url} failed: ${res.status} ${res.statusText}`);
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
