/**
 * Bundled example `.drumtab` files. The sources live in `/samples/*.drumtab`
 * at the repo root so they're editable without TypeScript bureaucracy.
 * Vite inlines them as raw strings at build time via `import.meta.glob`.
 *
 * Each sample exposes a stable `id` (the file stem, e.g.
 * `01-dong-ci-da-ci`), a human-readable `label` derived from the
 * `title:` header of the .drumtab source (falling back to the stem), and
 * the `source` string itself ready to feed into `parseDrumtab`.
 */

// Use `?raw` to inline file contents as strings.
// `eager: true` so the map is a concrete object at module load time.
const modules = import.meta.glob("/samples/*.drumtab", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

export interface Sample {
  id: string;
  label: string;
  source: string;
}

function labelFromSource(source: string, fallback: string): string {
  const titleMatch = source.match(/^\s*title:\s*(.+)$/m);
  return titleMatch?.[1]?.trim() || fallback;
}

function prettifyStem(stem: string): string {
  return stem.replace(/^\d+-/, "").replace(/-/g, " ");
}

/**
 * All bundled samples, sorted by their numeric prefix (`01-…`, `02-…`)
 * so the order in the UI matches the intended curriculum progression.
 */
export const samples: Sample[] = Object.entries(modules)
  .map(([path, source]) => {
    const stem = path
      .replace(/^.*\//, "")
      .replace(/\.drumtab$/, "");
    return {
      id: stem,
      label: labelFromSource(source, prettifyStem(stem)),
      source,
    };
  })
  .sort((a, b) => a.id.localeCompare(b.id, "en"));

/**
 * The first sample is treated as the default starter document when a
 * fresh workspace is initialised.
 */
export function defaultSample(): Sample {
  return samples[0];
}

/** Look up a sample by id (filename stem). */
export function sampleById(id: string): Sample | undefined {
  return samples.find((s) => s.id === id);
}
