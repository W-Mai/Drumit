/**
 * Entry point for the embedded player that ships inside
 * `playable HTML` exports.
 *
 * The embedded player reads a `.drumtab` source from a `<script
 * id="drumtab-source" type="text/plain">` element and wires up the
 * Play / Pause / Stop buttons in the exported page. It uses the real
 * parser + scheduler + synth engine, so any chart that plays in the
 * Drumit app plays identically in the exported HTML.
 *
 * This file is bundled into an IIFE at build time (see
 * `scripts/build-player.ts`) and the resulting string is dropped into
 * the exported HTML by `src/notation/exporters/html.ts`.
 */

import { parseDrumtab } from "../notation/parser";
import { SynthEngine } from "./synthEngine";
import { PlaybackController } from "./controller";

declare global {
  interface Window {
    __drumitInit?: () => void;
  }
}

export function init(): void {
  const sourceEl = document.getElementById("drumtab-source");
  if (!sourceEl) return;
  const text = sourceEl.textContent ?? "";
  if (!text.trim()) return;

  const parsed = parseDrumtab(text);
  if (parsed.diagnostics.some((d) => d.level === "error")) {
    console.warn("[drumit] source has errors; playback may be partial", parsed.diagnostics);
  }

  const playBtn = document.getElementById("play") as HTMLButtonElement | null;
  const pauseBtn = document.getElementById("pause") as HTMLButtonElement | null;
  const stopBtn = document.getElementById("stop") as HTMLButtonElement | null;
  if (!playBtn || !stopBtn) return;

  const engine = new SynthEngine();
  const controller = new PlaybackController({
    engine,
    score: parsed.score,
  });

  controller.onStateChange((state) => {
    if (state === "playing") {
      playBtn.textContent = "▶ Playing";
      playBtn.disabled = true;
      if (pauseBtn) pauseBtn.disabled = false;
      stopBtn.disabled = false;
    } else if (state === "paused") {
      playBtn.textContent = "▶ Resume";
      playBtn.disabled = false;
      if (pauseBtn) pauseBtn.disabled = true;
      stopBtn.disabled = false;
    } else {
      playBtn.textContent = "▶ Play";
      playBtn.disabled = false;
      if (pauseBtn) pauseBtn.disabled = true;
      stopBtn.disabled = true;
    }
  });

  playBtn.addEventListener("click", () => {
    void controller.play();
  });
  if (pauseBtn) {
    pauseBtn.addEventListener("click", () => controller.pause());
  }
  stopBtn.addEventListener("click", () => controller.stop());
}

// Auto-boot on DOM ready. The bundled IIFE is injected at the bottom of
// the exported HTML, so DOM is already parsed by the time this runs —
// but keep the guard for safety.
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
  init();
}
