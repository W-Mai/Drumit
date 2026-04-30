#!/usr/bin/env bun
/**
 * Placeholder fetcher for the WAV SampleEngine.
 *
 * The intent is for this script to download a small set of CC0 drum
 * samples and ffmpeg them into `public/samples/*.ogg`. However, finding
 * stable public URLs for CC0 samples without a per-host API key turned
 * out to be unreliable (Freesound needs OAuth, GitHub archives move
 * around, etc.).
 *
 * For now this script is a scaffold. To install samples:
 *
 *   1. Drop 13 single-hit drum samples into `public/samples/` as
 *      `kick.ogg`, `snare.ogg`, `hihat-closed.ogg`, …
 *      See `src/playback/sampleEngine.ts::SAMPLE_FILES` for the exact
 *      file names the engine looks for.
 *   2. Any missing file = that instrument stays silent on the Samples
 *      engine, but the engine itself still runs.
 *
 * When we have a curated source, fill the SAMPLES array below with
 * [stem, url] pairs, uncomment the download loop, and run
 * `bun run samples:fetch`. ffmpeg is required on PATH.
 */

import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const OUT_DIR = join(process.cwd(), "public", "samples");
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

// Populate this array with hand-picked CC0 sources and re-run the
// script. Each URL should decode to a short drum one-shot.
const SAMPLES: Array<readonly [stem: string, url: string]> = [
  // ["kick", "https://example.com/kick.wav"],
];

if (SAMPLES.length === 0) {
  console.log(
    "No sample URLs configured yet. Drop .ogg files into public/samples/ " +
      "by hand, or edit scripts/fetch-samples.ts to add a source list.\n" +
      "Expected filenames (see src/playback/sampleEngine.ts):\n" +
      "  kick.ogg snare.ogg hihat-{closed,halfopen,open,foot}.ogg\n" +
      "  ride.ogg ride-bell.ogg crash-{left,right}.ogg\n" +
      "  tom-{high,mid}.ogg floor-tom.ogg",
  );
  process.exit(0);
}

console.warn(
  "fetch loop not executed; wire ffmpeg in once SAMPLES[] is filled out.",
);
