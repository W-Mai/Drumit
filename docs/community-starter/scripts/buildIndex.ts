#!/usr/bin/env bun
/*
 * Scans scores/*.drumtab, parses each via the parser shipped with this
 * template, and rewrites index.json. Exits non-zero if two scores share a
 * slug — that lets the CI block such PRs before they land on main.
 *
 * Drumit's parser is reproduced in ./parser.ts as a self-contained subset:
 * we only need the score-level meta, not bar parsing, so the slim version
 * keeps this template free of npm dependencies.
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseScoreMeta } from "./parser";

interface IndexEntry {
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
}

async function main() {
  const root = process.cwd();
  const scoresDir = path.join(root, "scores");
  const files = await listScores(scoresDir);
  files.sort();

  const entries: IndexEntry[] = [];
  const seenSlugs = new Map<string, string>();

  for (const file of files) {
    const full = path.join(scoresDir, file);
    const text = await readFile(full, "utf8");
    const meta = parseScoreMeta(text);
    const slug = meta.slug ?? path.basename(file, ".drumtab");
    if (seenSlugs.has(slug)) {
      console.error(
        `Duplicate slug '${slug}' in ${file} (already used by ${seenSlugs.get(
          slug,
        )})`,
      );
      process.exit(1);
    }
    seenSlugs.set(slug, file);
    entries.push({
      slug,
      path: `scores/${file}`,
      title: meta.title ?? slug,
      composer: meta.composer,
      arranger: meta.arranger,
      album: meta.album,
      license: meta.license,
      difficulty: meta.difficulty,
      style: meta.style,
      techniques: meta.techniques,
      tempo: meta.tempo,
      meter: meta.meter,
    });
  }

  entries.sort((a, b) => a.slug.localeCompare(b.slug));

  const out = {
    generatedAt: new Date().toISOString(),
    scores: entries,
  };
  await writeFile(
    path.join(root, "index.json"),
    JSON.stringify(out, null, 2) + "\n",
    "utf8",
  );
  console.log(`Wrote index.json with ${entries.length} score(s).`);
}

async function listScores(dir: string): Promise<string[]> {
  try {
    return (await readdir(dir)).filter((f) => f.endsWith(".drumtab"));
  } catch {
    return [];
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
