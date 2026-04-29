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

// Visual tokens for the embedded player highlight. Kept as inline
// styles so they don't depend on any stylesheet class (exported SVG's
// transient classes are neutralized on export to avoid black-block
// fallbacks — see src/notation/exporters/svg.ts).
const HL_BAR_FILL = "rgba(209, 250, 229, 0.7)"; // emerald-100/70
const HL_BAR_STROKE = "#10b981"; // emerald-500
const HL_BEAT_FILL = "rgba(110, 231, 183, 0.4)"; // emerald-300/40
// Start-bar selection (not currently playing). Amber to match the app.
const SEL_BAR_FILL = "rgba(254, 215, 170, 0.6)"; // amber-200/60
const SEL_BAR_STROKE = "#f59e0b"; // amber-500

export function init(): void {
  const sourceEl = document.getElementById("drumtab-source");
  if (!sourceEl) return;
  const text = sourceEl.textContent ?? "";
  if (!text.trim()) return;

  const parsed = parseDrumtab(text);
  if (parsed.diagnostics.some((d) => d.level === "error")) {
    console.warn(
      "[drumit] source has errors; playback may be partial",
      parsed.diagnostics,
    );
  }

  const playBtn = document.getElementById("play") as HTMLButtonElement | null;
  const pauseBtn = document.getElementById("pause") as HTMLButtonElement | null;
  const stopBtn = document.getElementById("stop") as HTMLButtonElement | null;
  const tempoSlider = document.getElementById(
    "tempo",
  ) as HTMLInputElement | null;
  const tempoLabel = document.getElementById(
    "tempo-value",
  ) as HTMLElement | null;
  const clickToggle = document.getElementById(
    "click",
  ) as HTMLInputElement | null;
  const loopToggle = document.getElementById(
    "loop",
  ) as HTMLInputElement | null;
  if (!playBtn || !stopBtn) return;

  const engine = new SynthEngine();
  const controller = new PlaybackController({
    engine,
    score: parsed.score,
  });

  if (clickToggle) {
    clickToggle.addEventListener("change", () => {
      controller.setMetronome(clickToggle.checked);
    });
  }
  if (loopToggle) {
    loopToggle.addEventListener("change", () => {
      if (loopToggle.checked) {
        controller.setLoop({ startBar: selectedBar, endBar: selectedBar });
      } else {
        controller.setLoop(null);
      }
    });
  }

  if (tempoSlider && tempoLabel) {
    // Treat the slider's initial value as the authoritative tempo so the
    // controller matches what the user sees on the page.
    const initial = Number(tempoSlider.value);
    if (Number.isFinite(initial) && initial > 0) {
      controller.setTempo(initial);
      tempoLabel.textContent = String(initial);
    }
    tempoSlider.addEventListener("input", () => {
      const v = Number(tempoSlider.value);
      if (!Number.isFinite(v) || v <= 0) return;
      tempoLabel.textContent = String(v);
      controller.setTempo(v);
    });
  }

  // Cache of `<g data-bar-index="N">` elements so highlight lookups are O(1).
  const barGroups = new Map<number, SVGGElement>();
  document
    .querySelectorAll<SVGGElement>("[data-bar-index]")
    .forEach((g) => {
      const idx = Number(g.getAttribute("data-bar-index"));
      if (!Number.isNaN(idx)) barGroups.set(idx, g);
    });

  let lastBarIndex = -1;
  let lastBeatIndex = -1;
  // Bar the user most recently clicked, shown in amber when playback is
  // idle. When playback starts, it's the resume-from bar.
  let selectedBar = 0;

  function clearHighlight(barIdx: number) {
    const g = barGroups.get(barIdx);
    if (!g) return;
    const barRect = g.querySelector<SVGRectElement>("[data-bar-highlight]");
    if (barRect) {
      barRect.style.fill = "";
      barRect.style.stroke = "";
      barRect.style.strokeWidth = "";
    }
    g.querySelectorAll<SVGRectElement>("[data-beat-rect]").forEach((r) => {
      r.style.fill = "";
    });
    // If the cleared bar is also the user's selected bar, restore the
    // amber selection tint so it doesn't visually disappear when the
    // playhead moves on.
    if (barIdx === selectedBar) applySelection(barIdx);
  }

  function applyHighlight(barIdx: number, beatIdx: number) {
    const g = barGroups.get(barIdx);
    if (!g) return;
    const barRect = g.querySelector<SVGRectElement>("[data-bar-highlight]");
    if (barRect) {
      barRect.style.fill = HL_BAR_FILL;
      barRect.style.stroke = HL_BAR_STROKE;
      barRect.style.strokeWidth = "1.5";
    }
    const beatRect = g.querySelector<SVGRectElement>(
      `[data-beat-rect][data-beat-index="${beatIdx}"]`,
    );
    if (beatRect) {
      beatRect.style.fill = HL_BEAT_FILL;
    }
  }

  function clearAllHighlights() {
    if (lastBarIndex >= 0) clearHighlight(lastBarIndex);
    lastBarIndex = -1;
    lastBeatIndex = -1;
    // Reinstate the static selection once the playhead is gone.
    applySelection(selectedBar);
  }

  function applySelection(barIdx: number) {
    const g = barGroups.get(barIdx);
    if (!g) return;
    const barRect = g.querySelector<SVGRectElement>("[data-bar-highlight]");
    if (barRect) {
      barRect.style.fill = SEL_BAR_FILL;
      barRect.style.stroke = SEL_BAR_STROKE;
      barRect.style.strokeWidth = "1.5";
    }
  }

  function clearSelection(barIdx: number) {
    const g = barGroups.get(barIdx);
    if (!g) return;
    const barRect = g.querySelector<SVGRectElement>("[data-bar-highlight]");
    if (barRect) {
      barRect.style.fill = "";
      barRect.style.stroke = "";
      barRect.style.strokeWidth = "";
    }
  }

  function setSelectedBar(next: number) {
    if (next === selectedBar) return;
    // Only re-paint the old bar if it isn't currently the playhead.
    if (selectedBar !== lastBarIndex) clearSelection(selectedBar);
    selectedBar = next;
    // Paint the new selection only if it isn't the live playhead (which
    // has precedence and uses the emerald colours).
    if (selectedBar !== lastBarIndex) applySelection(selectedBar);
    controller.setStartBar(selectedBar);
    if (loopToggle?.checked) {
      controller.setLoop({ startBar: selectedBar, endBar: selectedBar });
    }
  }

  // Wire bar-click to "play from here". Pointer events only fire on
  // elements with a fill, so the data-bar-highlight rect (transparent
  // but present) captures clicks across the whole bar.
  for (const [idx, g] of barGroups) {
    g.addEventListener("click", () => setSelectedBar(idx));
  }

  // Paint the initial selection.
  applySelection(selectedBar);

  controller.onCursor((pos) => {
    if (pos.barIndex === lastBarIndex && pos.beatIndex === lastBeatIndex) return;
    if (lastBarIndex >= 0 && lastBarIndex !== pos.barIndex) {
      clearHighlight(lastBarIndex);
    } else if (
      lastBarIndex === pos.barIndex &&
      lastBeatIndex >= 0 &&
      lastBeatIndex !== pos.beatIndex
    ) {
      // Same bar, new beat — clear just the previous beat overlay.
      const g = barGroups.get(lastBarIndex);
      const prev = g?.querySelector<SVGRectElement>(
        `[data-beat-rect][data-beat-index="${lastBeatIndex}"]`,
      );
      if (prev) prev.style.fill = "";
    }
    applyHighlight(pos.barIndex, pos.beatIndex);
    lastBarIndex = pos.barIndex;
    lastBeatIndex = pos.beatIndex;
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
      // idle — clear cursor highlights.
      clearAllHighlights();
      playBtn.textContent = "▶ Play";
      playBtn.disabled = false;
      if (pauseBtn) pauseBtn.disabled = true;
      stopBtn.disabled = true;
    }
  });

  controller.onEnd(() => {
    clearAllHighlights();
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
