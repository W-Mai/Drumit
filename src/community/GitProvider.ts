export interface ScoreIndexEntry {
  slug: string;
  path: string;
  title: string;
  composer?: string[];
  arranger?: string;
  album?: string;
  license?: string;
  difficulty?: number;
  style?: string[];
  techniques?: string[];
  tempo?: number;
  meter?: string;
  updatedAt?: string;
  thumbnailPath?: string;
}

export interface ScoreIndex {
  generatedAt: string;
  scores: ScoreIndexEntry[];
}

export type SourceConfig =
  | {
      id: string;
      kind: "github";
      owner: string;
      repo: string;
      branch?: string;
      displayName: string;
    }
  | {
      id: string;
      kind: "gitee";
      owner: string;
      repo: string;
      branch?: string;
      displayName: string;
    }
  | {
      id: string;
      kind: "gitea";
      host: string;
      owner: string;
      repo: string;
      branch?: string;
      displayName: string;
    };

export interface LoadedScore {
  source: string;
  sha?: string;
}

export interface GitProvider {
  readonly id: string;
  readonly displayName: string;
  loadIndex(): Promise<ScoreIndex>;
  loadScore(path: string): Promise<LoadedScore>;
  upsertScore?(
    path: string,
    source: string,
    message: string,
    token: string,
    branch?: string,
  ): Promise<{ sha: string }>;
  ensureFork?(token: string): Promise<{ owner: string; repo: string; alreadyExisted: boolean }>;
  openPR?(
    title: string,
    body: string,
    head: string,
    base: string,
    token: string,
  ): Promise<{ url: string }>;
}
