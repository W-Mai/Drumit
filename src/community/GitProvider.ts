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
  // v2 reservations:
  // upsertScore?(path: string, source: string, message: string): Promise<void>;
  // openPR?(...): Promise<{ url: string }>;
}
