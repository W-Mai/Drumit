#!/usr/bin/env bun
/**
 * Fetch CC0 drum samples from the Virtuosity Drums kit and convert to
 * OGG Vorbis under `public/samples/`.
 *
 * Source: https://github.com/sfzinstruments/virtuosity_drums (CC0 1.0)
 *
 * Uses the "lofi" mix-down. File names within lofi aren't fully
 * consistent (some have _rr1/_rr2 round-robin suffixes, some don't), so
 * the script queries the GitHub API for each folder and picks the first
 * medium-velocity (vl3) match for the articulation we want.
 *
 * Drumit's SampleEngine doesn't do velocity layers yet — one hit per
 * instrument gets scaled via the hit's velocity at playback time.
 *
 * Requires `ffmpeg` on PATH with `libvorbis` support (Homebrew's
 * standard `ffmpeg` has it; the minimal `ffmpeg --with-fdk-aac` package
 * may not).
 *
 * Usage:
 *   bun run samples:fetch
 */

import { existsSync, mkdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

const OUT_DIR = join(process.cwd(), "public", "samples");
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

const REPO = "sfzinstruments/virtuosity_drums";
const BRANCH = "master";

interface SampleSpec {
  stem: string;
  folder: string;
  articulation: string;
}

// Each entry: output name + folder under lofi + which articulation token
// to look for inside the filename. The picker finds the first vl3 file
// matching `lofi_<folder>_<articulation>_vl3…`.
const SAMPLES: SampleSpec[] = [
  { stem: "kick", folder: "kick", articulation: "snoff" },
  { stem: "snare", folder: "snare", articulation: "center" },
  { stem: "hihat-closed", folder: "hh", articulation: "closed" },
  { stem: "hihat-halfopen", folder: "hh", articulation: "half" },
  { stem: "hihat-open", folder: "hh", articulation: "open" },
  { stem: "hihat-foot", folder: "hh", articulation: "pedal" },
  { stem: "ride", folder: "ride", articulation: "ride" },
  { stem: "ride-bell", folder: "ride", articulation: "bell" },
  { stem: "crash-left", folder: "crash", articulation: "crash" },
  { stem: "crash-right", folder: "flatride", articulation: "crash" },
  { stem: "tom-high", folder: "htom", articulation: "center" },
  // No dedicated mid-tom in the lofi kit; re-use the high tom but softer
  // via a lower-velocity sample (vl2 instead of vl3).
  { stem: "tom-mid", folder: "htom", articulation: "center", /* picked explicitly below */ },
  { stem: "floor-tom", folder: "ltom", articulation: "center" },
];

interface GhEntry {
  name: string;
  download_url: string;
}

async function listFolder(folder: string): Promise<GhEntry[]> {
  const url = `https://api.github.com/repos/${REPO}/contents/Samples/lofi/${folder}?ref=${BRANCH}`;
  const headers: Record<string, string> = {
    "User-Agent": "drumit-sample-fetcher",
  };
  // GitHub gates unauthenticated API traffic to 60/hour; use a token if
  // one is on the environment so repeat runs don't hit the cap.
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`list folder ${folder}: ${res.status}`);
  return (await res.json()) as GhEntry[];
}

function pickSample(
  entries: GhEntry[],
  folder: string,
  articulation: string,
  overrideVelocity?: string,
): GhEntry | null {
  const vel = overrideVelocity ?? "vl3";
  // Prefer rr1 if present, otherwise the first match at this velocity.
  const prefix = `lofi_${folder}_${articulation}_${vel}`;
  const rr1 = entries.find((e) => e.name === `${prefix}_rr1.flac`);
  if (rr1) return rr1;
  const plain = entries.find((e) => e.name === `${prefix}.flac`);
  if (plain) return plain;
  return entries.find((e) => e.name.startsWith(prefix)) ?? null;
}

const successes: string[] = [];
const failures: Array<{ stem: string; reason: string }> = [];

// Cache GitHub folder listings so we make at most one API call per folder.
const folderCache = new Map<string, GhEntry[]>();

for (const spec of SAMPLES) {
  try {
    let entries = folderCache.get(spec.folder);
    if (!entries) {
      entries = await listFolder(spec.folder);
      folderCache.set(spec.folder, entries);
    }
    // tom-mid fallback uses vl2 of the high tom.
    const override = spec.stem === "tom-mid" ? "vl2" : undefined;
    const pick = pickSample(entries, spec.folder, spec.articulation, override);
    if (!pick) {
      failures.push({ stem: spec.stem, reason: "no match" });
      console.warn(
        `  ${spec.stem}: no ${spec.articulation} sample found in ${spec.folder}`,
      );
      continue;
    }
    console.log(`fetch ${spec.stem} ← ${pick.name}`);
    const tmpFile = join(tmpdir(), `drumit-${spec.stem}.flac`);
    const outFile = join(OUT_DIR, `${spec.stem}.ogg`);
    const res = await fetch(pick.download_url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = new Uint8Array(await res.arrayBuffer());
    await Bun.write(tmpFile, buf);

    const ff = spawnSync(
      "ffmpeg",
      [
        "-y",
        "-i",
        tmpFile,
        "-af",
        [
          "silenceremove=start_periods=1:start_silence=0.02:start_threshold=-55dB",
          "atrim=duration=2.5",
          "asetpts=N/SR/TB",
          "loudnorm=I=-16:TP=-1.5:LRA=8",
          "afade=t=out:st=2.2:d=0.3",
        ].join(","),
        "-ac",
        "1",
        // Opus only supports 48 kHz (internally always resamples there).
        "-ar",
        "48000",
        // Homebrew's default ffmpeg ships libopus but not libvorbis,
        // and the native "vorbis" encoder rejects most options. Opus is
        // strictly better quality per bit and every evergreen browser
        // decodes it inside an OGG container.
        "-c:a",
        "libopus",
        "-b:a",
        "64k",
        outFile,
      ],
      { stdio: "pipe" },
    );
    try {
      unlinkSync(tmpFile);
    } catch {
      /* ignore */
    }
    if (ff.status !== 0) {
      throw new Error(
        `ffmpeg: ${ff.stderr?.toString().slice(-400) ?? "unknown"}`,
      );
    }
    const size = (await Bun.file(outFile).arrayBuffer()).byteLength;
    console.log(`  → ${outFile} (${(size / 1024).toFixed(1)} kB)`);
    successes.push(spec.stem);
  } catch (err) {
    failures.push({ stem: spec.stem, reason: (err as Error).message });
    console.warn(`  ${spec.stem} failed: ${(err as Error).message}`);
  }
}

console.log(
  `\nDone: ${successes.length}/${SAMPLES.length} samples written to ${OUT_DIR}`,
);
if (failures.length) {
  for (const f of failures) console.log(`  FAIL ${f.stem}: ${f.reason}`);
  process.exit(1);
}

const total = successes.reduce((acc, s) => {
  const file = Bun.file(join(OUT_DIR, `${s}.ogg`));
  return acc + (file.size ?? 0);
}, 0);
console.log(`Total: ${(total / 1024).toFixed(1)} kB`);
