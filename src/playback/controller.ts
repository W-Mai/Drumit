import type { Score } from "../notation/types";
import {
  schedule,
  metronomeEvents,
  type PlaybackEvent,
  type ScheduleOptions,
} from "../notation/scheduler";
import type { PlaybackEngine } from "./engine";

export type PlaybackState = "idle" | "playing" | "paused";

export interface CursorPos {
  barIndex: number;
  beatIndex: number;
  time: number;
}

export interface PlaybackControllerOptions {
  engine: PlaybackEngine;
  score: Score;
  metronome?: boolean;
  tempoOverride?: number;
  loop?: { startBar: number; endBar: number } | null;
  startBar?: number;
}

type Listener<T> = (v: T) => void;

/**
 * Headless playback state machine.
 *
 * Lifecycle:
 *   idle ──play()──► playing
 *   playing ──pause()──► paused ──play()──► playing
 *   *       ──stop()──► idle (cursor cleared)
 *
 * The UI subscribes to `onStateChange` / `onCursor` / `onEnd` instead of
 * tracking "playing" itself. All option changes can be applied while
 * playing and the playback continues seamlessly from the current position.
 */
export class PlaybackController {
  private engine: PlaybackEngine;
  private score: Score;
  private metronome: boolean;
  private tempoOverride: number;
  private loop: { startBar: number; endBar: number } | null;
  private startBar: number;

  private events: PlaybackEvent[] = [];
  private metronomeEvts: PlaybackEvent[] = [];
  private totalDuration = 0;

  private state: PlaybackState = "idle";
  /** Seconds into the score where playback should resume from. */
  private pauseTime = 0;
  /** wall-clock `performance.now()` at last `play()`. */
  private startedAt = 0;
  /** Cached play-session `startOffset` (in score time). */
  private startOffset = 0;
  /** Cached `endOffset` for loop/play-once. */
  private endOffset = 0;

  private cursorTimer: ReturnType<typeof setInterval> | null = null;

  private stateListeners = new Set<Listener<PlaybackState>>();
  private cursorListeners = new Set<Listener<CursorPos>>();
  private endListeners = new Set<Listener<void>>();

  constructor(options: PlaybackControllerOptions) {
    this.engine = options.engine;
    this.score = options.score;
    this.metronome = options.metronome ?? false;
    this.tempoOverride = options.tempoOverride ?? 0;
    this.loop = options.loop ?? null;
    this.startBar = options.startBar ?? 0;
    this.reschedule();
  }

  /* ------------ subscriptions ------------ */

  onStateChange(fn: Listener<PlaybackState>): () => void {
    this.stateListeners.add(fn);
    return () => {
      this.stateListeners.delete(fn);
    };
  }
  onCursor(fn: Listener<CursorPos>): () => void {
    this.cursorListeners.add(fn);
    return () => {
      this.cursorListeners.delete(fn);
    };
  }
  onEnd(fn: Listener<void>): () => void {
    this.endListeners.add(fn);
    return () => {
      this.endListeners.delete(fn);
    };
  }
  getState(): PlaybackState {
    return this.state;
  }
  getEngine(): PlaybackEngine {
    return this.engine;
  }

  /* ------------ option setters (safe to call while playing) ------------ */

  setEngine(engine: PlaybackEngine): void {
    const wasPlaying = this.state === "playing";
    const elapsed = wasPlaying ? this.currentTime() : this.pauseTime;

    this.teardownScheduling();
    const previous = this.engine;
    this.engine = engine;
    previous.dispose?.();

    if (wasPlaying) {
      // Restart on the new engine. We flip to "paused" first so play()
      // takes the paused-resume path using pauseTime as the position.
      this.pauseTime = elapsed;
      this.setState("paused");
      void this.play();
    } else if (this.state === "paused") {
      this.pauseTime = elapsed;
    }
  }

  setScore(score: Score): void {
    this.score = score;
    this.reschedule();
    this.reapplyIfPlaying();
  }

  setMetronome(on: boolean): void {
    this.metronome = on;
    this.reschedule();
    this.reapplyIfPlaying();
  }

  setTempo(tempoOverride: number): void {
    this.tempoOverride = tempoOverride;
    this.reschedule();
    this.reapplyIfPlaying();
  }

  setLoop(loop: { startBar: number; endBar: number } | null): void {
    // Normalize: treat endBar < startBar as single-bar loop on startBar.
    this.loop = loop
      ? {
          startBar: Math.min(loop.startBar, loop.endBar),
          endBar: Math.max(loop.startBar, loop.endBar),
        }
      : null;
    this.reapplyIfPlaying();
  }

  /** Move the play head without stopping. */
  setStartBar(startBar: number): void {
    this.startBar = startBar;
    if (this.state === "playing") {
      this.teardownScheduling();
      this.pauseTime = this.computeBarTime(startBar);
      // Re-enter playback synchronously at the new position; state stays
      // "playing" throughout.
      this.beginPlayback(this.pauseTime);
    } else if (this.state === "paused") {
      this.pauseTime = this.computeBarTime(startBar);
    }
  }

  /* ------------ transport ------------ */

  async play(): Promise<void> {
    if (this.state === "playing") return;
    await this.engine.ensureReady();

    const resumeFrom =
      this.state === "paused"
        ? this.pauseTime
        : this.loop
          ? this.computeBarTime(this.loop.startBar)
          : this.computeBarTime(this.startBar);

    this.beginPlayback(resumeFrom);
  }

  /** Synchronous, no-ensureReady playback starter used by setters + play(). */
  private beginPlayback(resumeFrom: number): void {
    this.startOffset = resumeFrom;
    this.endOffset = this.loop
      ? this.computeBarEndTime(this.loop.endBar)
      : this.totalDuration;

    if (resumeFrom >= this.endOffset) {
      this.pauseTime = 0;
      if (this.state !== "idle") this.setState("idle");
      return;
    }

    this.scheduleRange(resumeFrom, this.endOffset);
    this.startedAt = performance.now();
    this.startTicker();
    if (this.state !== "playing") this.setState("playing");
  }

  pause(): void {
    if (this.state !== "playing") return;
    const elapsed = this.currentTime();
    this.teardownScheduling();
    this.pauseTime = elapsed;
    this.setState("paused");
  }

  stop(): void {
    this.teardownScheduling();
    this.pauseTime = 0;
    if (this.state !== "idle") this.setState("idle");
  }

  /** Toggle between play and pause (useful for hotkey). */
  togglePlay(): void {
    if (this.state === "playing") this.pause();
    else void this.play();
  }

  dispose(): void {
    this.stop();
    this.engine.dispose?.();
    this.stateListeners.clear();
    this.cursorListeners.clear();
    this.endListeners.clear();
  }

  /* ------------ internals ------------ */

  private reschedule(): void {
    const opts: ScheduleOptions = { tempoOverride: this.tempoOverride };
    const { events, totalDuration } = schedule(this.score, opts);
    this.events = events;
    this.totalDuration = totalDuration;
    this.metronomeEvts = this.metronome
      ? metronomeEvents(this.score, totalDuration, opts)
      : [];
  }

  private reapplyIfPlaying(): void {
    if (this.state !== "playing") return;
    const elapsed = this.currentTime();
    this.teardownScheduling();
    this.pauseTime = elapsed;
    this.beginPlayback(elapsed);
  }

  private scheduleRange(from: number, to: number): void {
    const all = [...this.events, ...this.metronomeEvts];
    for (const evt of all) {
      if (evt.time < from) continue;
      if (evt.time >= to) continue;
      this.engine.scheduleEvent(evt, evt.time - from);
    }
  }

  private startTicker(): void {
    this.cursorTimer = globalThis.setInterval(() => {
      const elapsed = this.currentTime();
      if (elapsed >= this.endOffset) {
        if (this.loop) {
          // Restart synchronously from the loop start. beginPlayback sets up
          // new timers and schedules events; state stays "playing".
          this.teardownScheduling();
          const from = this.computeBarTime(this.loop.startBar);
          this.pauseTime = from;
          this.beginPlayback(from);
          return;
        }
        // Natural end → stop (clears cursor).
        this.stop();
        this.endListeners.forEach((fn) => fn());
        return;
      }
      const pos = this.positionAt(elapsed);
      this.cursorListeners.forEach((fn) => fn({ ...pos, time: elapsed }));
    }, 30);
  }

  private teardownScheduling(): void {
    this.engine.stop();
    if (this.cursorTimer !== null) {
      globalThis.clearInterval(this.cursorTimer);
      this.cursorTimer = null;
    }
  }

  private setState(next: PlaybackState): void {
    if (this.state === next) return;
    this.state = next;
    this.stateListeners.forEach((fn) => fn(next));
  }

  private currentTime(): number {
    if (this.state === "paused") return this.pauseTime;
    return (performance.now() - this.startedAt) / 1000 + this.startOffset;
  }

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
    for (const ev of this.events) {
      if (ev.barIndex >= barIndex) return ev.time;
    }
    return this.totalDuration;
  }

  private computeBarEndTime(barIndex: number): number {
    for (const ev of this.events) {
      if (ev.barIndex > barIndex) return ev.time;
    }
    return this.totalDuration;
  }
}
