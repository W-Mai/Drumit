import type { PlaybackEvent } from "../notation/scheduler";
import type { Instrument } from "../notation/types";
import type { PlaybackEngine } from "./engine";

/**
 * File name each instrument maps to under `public/samples/`. Missing
 * files are tolerated — the engine plays nothing for that instrument
 * but keeps running for the rest.
 */
const SAMPLE_FILES: Record<Instrument, string> = {
  kick: "kick.ogg",
  snare: "snare.ogg",
  hihatClosed: "hihat-closed.ogg",
  hihatHalfOpen: "hihat-halfopen.ogg",
  hihatOpen: "hihat-open.ogg",
  hihatFoot: "hihat-foot.ogg",
  ride: "ride.ogg",
  rideBell: "ride-bell.ogg",
  crashLeft: "crash-left.ogg",
  crashRight: "crash-right.ogg",
  tomHigh: "tom-high.ogg",
  tomMid: "tom-mid.ogg",
  floorTom: "floor-tom.ogg",
};

export interface SampleEngineOptions {
  /** URL prefix that resolves to the folder containing the `.ogg` files. */
  baseUrl?: string;
}

/**
 * Plays real drum samples (OGG Vorbis) via Web Audio. Loads all samples
 * the first time `ensureReady()` is called; failed loads are logged but
 * don't abort the engine — missing instruments simply stay silent.
 */
export class SampleEngine implements PlaybackEngine {
  readonly kind = "sample" as const;
  readonly name = "Drum Samples";

  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private buffers = new Map<Instrument, AudioBuffer>();
  private activeNodes: AudioBufferSourceNode[] = [];
  private loadPromise: Promise<void> | null = null;
  private baseUrl: string;

  constructor(options: SampleEngineOptions = {}) {
    this.baseUrl = options.baseUrl ?? resolveBaseUrl();
  }

  async ensureReady(): Promise<void> {
    if (!this.ctx) {
      const Ctor =
        (window as unknown as { AudioContext?: typeof AudioContext })
          .AudioContext ??
        (
          window as unknown as {
            webkitAudioContext?: typeof AudioContext;
          }
        ).webkitAudioContext;
      if (!Ctor) throw new Error("Web Audio not supported in this browser");
      this.ctx = new Ctor();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.9;
      this.masterGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") await this.ctx.resume();
    await this.loadSamples();
  }

  private loadSamples(): Promise<void> {
    if (this.loadPromise) return this.loadPromise;
    this.loadPromise = (async () => {
      if (!this.ctx) return;
      const entries = Object.entries(SAMPLE_FILES) as [Instrument, string][];
      await Promise.all(
        entries.map(async ([instrument, file]) => {
          try {
            const res = await fetch(this.baseUrl + file);
            if (!res.ok) return;
            const array = await res.arrayBuffer();
            const buf = await this.ctx!.decodeAudioData(array);
            this.buffers.set(instrument, buf);
          } catch {
            // Keep the engine usable for the instruments that did load.
          }
        }),
      );
    })();
    return this.loadPromise;
  }

  /** How many samples successfully loaded. 0 means silent playback. */
  get loadedCount(): number {
    return this.buffers.size;
  }

  scheduleEvent(event: PlaybackEvent, whenSeconds: number): void {
    if (!this.ctx || !this.masterGain) return;
    const buf = this.buffers.get(event.hit.instrument);
    if (!buf) return;
    const t = this.ctx.currentTime + whenSeconds;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const gain = this.ctx.createGain();
    // Keep velocity-to-gain mapping consistent with SynthEngine so the
    // same chart feels equally loud across the two engines.
    gain.gain.value = Math.min(1, (event.velocity / 127) * 1.2);
    src.connect(gain).connect(this.masterGain);
    src.start(t);
    this.activeNodes.push(src);
  }

  stop(): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    for (const node of this.activeNodes) {
      try {
        node.stop(now);
      } catch {
        // already stopped
      }
      node.disconnect?.();
    }
    this.activeNodes = [];
  }

  dispose(): void {
    this.stop();
    this.ctx?.close();
    this.ctx = null;
    this.masterGain = null;
    this.buffers.clear();
    this.loadPromise = null;
  }
}

function resolveBaseUrl(): string {
  const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL;
  return (base ?? "/") + "samples/";
}
