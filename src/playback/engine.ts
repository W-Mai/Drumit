import type { PlaybackEvent } from "../notation/scheduler";

/**
 * Abstract playback engine. Implementations schedule a list of events for
 * future playback at absolute times (relative to the audio clock or MIDI
 * port clock).
 */
export interface PlaybackEngine {
  readonly name: string;
  readonly kind: "midi" | "synth";

  /** Resume or initialize the engine (e.g. AudioContext.resume()). */
  ensureReady(): Promise<void>;

  /**
   * Schedule an event at `whenSeconds` seconds from "now" on the engine's
   * own clock. Returns a handle that can be cancelled via `stop()`.
   */
  scheduleEvent(event: PlaybackEvent, whenSeconds: number): void;

  /** Stop all currently scheduled / sounding notes. */
  stop(): void;

  /** Dispose any resources (disconnect MIDI ports / close AudioContext). */
  dispose?(): void;
}
