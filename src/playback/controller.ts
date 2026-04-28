import type { Score } from "../notation/types";
import {
  schedule,
  metronomeEvents,
  type PlaybackEvent,
  type ScheduleOptions,
} from "../notation/scheduler";
import type { PlaybackEngine } from "./engine";

export type PlaybackState = "idle" | "playing" | "paused";

export interface PlaybackControllerOptions {
  engine: PlaybackEngine;
  score: Score;
  /** When true, include metronome click events. */
  metronome?: boolean;
  /** Tempo override in BPM (0 = use score tempo). */
  tempoOverride?: number;
  /** Looping range: [startBarIdx, endBarIdx] inclusive. */
  loop?: { startBar: number; endBar: number } | null;
  /** Start playback from this bar index (0-based). */
  startBar?: number;
  /** Called every ~30ms with the current playhead position. */
  onCursor?: (pos: { barIndex: number; beatIndex: number; time: number }) => void;
  /** Called when the playback reaches the end (unless loop is on). */
  onEnd?: () => void;
}

export class PlaybackController {
  private engine: PlaybackEngine;
  private score: Score;
  private state: PlaybackState = "idle";
  private events: PlaybackEvent[] = [];
  private metronomeEvts: PlaybackEvent[] = [];
  private totalDuration = 0;
  private cursorTimer: number | null = null;

  private options: PlaybackControllerOptions;

  constructor(options: PlaybackControllerOptions) {
    this.engine = options.engine;
    this.score = options.score;
    this.options = options;
    this.reschedule();
  }

  setEngine(engine: PlaybackEngine) {
    this.stop();
    this.engine = engine;
  }

  setScore(score: Score) {
    this.stop();
    this.score = score;
    this.reschedule();
  }

  setTempo(tempoOverride: number) {
    this.options.tempoOverride = tempoOverride;
    const wasPlaying = this.state === "playing";
    this.stop();
    this.reschedule();
    if (wasPlaying) this.play();
  }

  setMetronome(on: boolean) {
    this.options.metronome = on;
    const wasPlaying = this.state === "playing";
    this.stop();
    this.reschedule();
    if (wasPlaying) this.play();
  }

  getState(): PlaybackState {
    return this.state;
  }

  private reschedule() {
    const opts: ScheduleOptions = {
      tempoOverride: this.options.tempoOverride,
    };
    const { events, totalDuration } = schedule(this.score, opts);
    this.events = events;
    this.totalDuration = totalDuration;
    this.metronomeEvts = this.options.metronome
      ? metronomeEvents(this.score, totalDuration, opts)
      : [];
  }

  async play(): Promise<void> {
    if (this.state === "playing") return;
    await this.engine.ensureReady();

    // Determine start time offset (if startBar is set).
    const startOffset = this.computeBarTime(this.options.startBar ?? 0);

    const all = [...this.events, ...this.metronomeEvts];
    for (const evt of all) {
      if (evt.time < startOffset) continue;
      const when = evt.time - startOffset;
      this.engine.scheduleEvent(evt, when);
    }

    this.state = "playing";
    const startedAt = performance.now();
    this.cursorTimer = window.setInterval(() => {
      const elapsed = (performance.now() - startedAt) / 1000 + startOffset;
      if (elapsed >= this.totalDuration) {
        this.stop();
        this.options.onEnd?.();
        return;
      }
      const pos = this.positionAt(elapsed);
      this.options.onCursor?.({ ...pos, time: elapsed });
    }, 33);
  }

  pause(): void {
    // Lightweight: true pause requires per-event cancellation. For now we
    // treat pause as stop (scheduled events continue until drained). A full
    // implementation would maintain handles to cancel future events.
    this.stop();
    this.state = "paused";
  }

  stop(): void {
    this.engine.stop();
    if (this.cursorTimer !== null) {
      window.clearInterval(this.cursorTimer);
      this.cursorTimer = null;
    }
    this.state = "idle";
  }

  /** Given an elapsed time, return the bar/beat position. */
  private positionAt(time: number): { barIndex: number; beatIndex: number } {
    for (let i = this.events.length - 1; i >= 0; i -= 1) {
      if (this.events[i].time <= time) {
        return {
          barIndex: this.events[i].barIndex,
          beatIndex: this.events[i].beatIndex,
        };
      }
    }
    return { barIndex: 0, beatIndex: 0 };
  }

  private computeBarTime(barIndex: number): number {
    if (barIndex <= 0) return 0;
    // Find the first event at or after the given bar.
    for (const ev of this.events) {
      if (ev.barIndex >= barIndex) return ev.time;
    }
    return this.totalDuration;
  }

  dispose(): void {
    this.stop();
    this.engine.dispose?.();
  }
}
