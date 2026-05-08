import { GitHubProvider } from "./providers/GitHubProvider";
import { GiteeProvider } from "./providers/GiteeProvider";
import { GiteaProvider } from "./providers/GiteaProvider";
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
  makeGiteeSourceId,
  makeGiteaSourceId,
} from "./sources";

export function makeProvider(config: SourceConfig): GitProvider {
  switch (config.kind) {
    case "github":
      return new GitHubProvider(config);
    case "gitee":
      return new GiteeProvider(config);
    case "gitea":
      return new GiteaProvider(config);
  }
}
