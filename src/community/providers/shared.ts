import type { ScoreIndex } from "../GitProvider";

/**
 * Shared index.json validator used by all providers. Keeps the "scores
 * array" check in one place so GiteaProvider / GiteeProvider don't
 * duplicate GitHubProvider's logic.
 */
export function parseIndexJson(text: string, sourceId: string): ScoreIndex {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`index.json at ${sourceId} is not valid JSON`);
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    !Array.isArray((parsed as ScoreIndex).scores)
  ) {
    throw new Error(`index.json at ${sourceId} is missing 'scores' array`);
  }
  return parsed as ScoreIndex;
}
