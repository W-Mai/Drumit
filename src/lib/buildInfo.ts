/**
 * Read compile-time build info injected by `vite.config.ts::define`.
 * Falls back to neutral values when the symbol isn't defined — this can
 * happen inside some test or tooling runtimes that don't transform
 * module-scope identifiers.
 */
export interface BuildInfo {
  version: string;
  gitHash: string;
  gitBranch: string;
  gitDirty: boolean;
  builtAt: string;
}

function readDefined(): BuildInfo | null {
  try {
    // The symbol is substituted at bundle time; if it wasn't, accessing
    // it throws a ReferenceError.
    const v = __BUILD_INFO__ as unknown as BuildInfo;
    if (v && typeof v === "object" && typeof v.version === "string") return v;
  } catch {
    // fallthrough
  }
  return null;
}

export const buildInfo: BuildInfo = readDefined() ?? {
  version: "dev",
  gitHash: "unknown",
  gitBranch: "unknown",
  gitDirty: false,
  builtAt: new Date().toISOString(),
};
