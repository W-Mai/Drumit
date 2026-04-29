/**
 * Compile-time build metadata injected by `vite.config.ts` via
 * `define`. Read-only; see also `src/lib/buildInfo.ts` which wraps it
 * with runtime fallbacks.
 */
interface DrumitBuildInfo {
  readonly version: string;
  readonly gitHash: string;
  readonly gitBranch: string;
  readonly gitDirty: boolean;
  readonly builtAt: string; // ISO 8601
}

declare const __BUILD_INFO__: DrumitBuildInfo;
