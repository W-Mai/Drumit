import { GitHubProvider } from "./providers/GitHubProvider";
import type { GitProvider, SourceConfig } from "./GitProvider";

export type {
  GitProvider,
  ScoreIndex,
  ScoreIndexEntry,
  SourceConfig,
  LoadedScore,
} from "./GitProvider";

export {
  listSources,
  saveSources,
  addSource,
  removeSource,
  makeGithubSourceId,
} from "./sources";

export function makeProvider(config: SourceConfig): GitProvider {
  switch (config.kind) {
    case "github":
      return new GitHubProvider(config);
  }
}
