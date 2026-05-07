import type { SourceConfig } from "./GitProvider";

const KEY = "drumit:communitySources";
const VERSION = 1;

interface Stored {
  version: number;
  sources: SourceConfig[];
}

const DEFAULT_SOURCES: SourceConfig[] = [
  {
    id: "github:drumit-community/scores",
    kind: "github",
    owner: "drumit-community",
    repo: "scores",
    branch: "main",
    displayName: "Drumit Community",
  },
];

export function listSources(): SourceConfig[] {
  if (typeof localStorage === "undefined") return [...DEFAULT_SOURCES];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [...DEFAULT_SOURCES];
    const parsed = JSON.parse(raw) as Stored;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !Array.isArray(parsed.sources)
    ) {
      return [...DEFAULT_SOURCES];
    }
    return parsed.sources;
  } catch {
    return [...DEFAULT_SOURCES];
  }
}

export function saveSources(sources: SourceConfig[]): void {
  if (typeof localStorage === "undefined") return;
  try {
    const payload: Stored = { version: VERSION, sources };
    localStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    // quota / disabled — ignore
  }
}

export function addSource(config: SourceConfig): SourceConfig[] {
  const next = [...listSources().filter((s) => s.id !== config.id), config];
  saveSources(next);
  return next;
}

export function removeSource(id: string): SourceConfig[] {
  const next = listSources().filter((s) => s.id !== id);
  saveSources(next);
  return next;
}

export function makeGithubSourceId(owner: string, repo: string): string {
  return `github:${owner}/${repo}`;
}
