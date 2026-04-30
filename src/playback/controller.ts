import type { Score, Bar } from "../notation/types";
import {
  schedule,
  metronomeEvents,
  expandPlayOrder,
  type PlaybackEvent,
  type ScheduleOptions,
} from "../notation/scheduler";
import type { PlaybackEngine } from "./engine";

export type PlaybackState = "idle" | "playing" | "paused";

export interface CursorPos {
  /** Source-bar index (flat, across all sections). */
  barIndex: number;
  beatIndex: number;
  time: number;
  /**
   * Position in the expanded (unrolled) bar sequence — used by the
   * Expanded preview to highlight the exact instance of a repeated
   * bar that is currently playing. Always set; in compact mode it
   * matches the first occurrence of `barIndex` in the play order.
   */
  expandedBarIndex: number;
}

/** Wall-clock span of one entry in the scheduler's expanded play order. */
interface BarTimelineEntry {
  /** Index into the expanded play-order. */
  playOrderIndex: number;
  /** Source flat bar index that this timeline entry resolves to. */
  sourceBarIndex: number;
  /** First beat's time for this entry (seconds from score start). */
  startTime: number;
  /** Exclusive upper bound (== next entry's startTime). */
  endTime: number;
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
  /**
   * Wall-clock timeline of the unrolled playback. `reschedule()`
   * rebuilds it whenever the score / tempo change. The cursor ticker
   * uses it to derive `{ sourceBarIndex, expandedBarIndex }` from
   * elapsed time alone — independent of which bar happens to hold the
   * nearest emitted event, so empty bars don't freeze the cursor.
   */
  private barTimeline: BarTimelineEntry[] = [];

  private state: PlaybackState = "idle";
  /** Seconds into the score where playback should resume from. */
  private pauseTime = 0;
  /**
   * If set while idle, the next play() will begin from this time rather
   * than `startBar`. Cleared the moment playback starts. Lets callers
   * seek by wall-clock time (used by expanded preview) without leaving
   * the controller in a bogus "paused" state.
   */
  private pendingStartTime: number | null = null;
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
    this.pendingStartTime = null;
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

  /**
   * Move the play head to an absolute time. Used by the expanded-preview
   * mode, where a visually-selected bar maps to a point in the unrolled
   * timeline that doesn't line up with any single source-bar boundary.
   */
  setStartTime(seconds: number): void {
    const clamped = Math.max(0, Math.min(this.totalDuration, seconds));
    if (this.state === "playing") {
      this.teardownScheduling();
      this.pauseTime = clamped;
      this.pendingStartTime = null;
      this.beginPlayback(this.pauseTime);
    } else if (this.state === "paused") {
      this.pauseTime = clamped;
      this.pendingStartTime = null;
    } else {
      // idle: remember for the next play() without perturbing state.
      this.pendingStartTime = clamped;
    }
  }

  /* ------------ transport ------------ */

  async play(): Promise<void> {
    if (this.state === "playing") return;
    await this.engine.ensureReady();

    const resumeFrom =
      this.state === "paused"
        ? this.pauseTime
        : this.pendingStartTime !== null
          ? this.pendingStartTime
          : this.loop
            ? this.computeBarTime(this.loop.startBar)
            : this.computeBarTime(this.startBar);
    this.pendingStartTime = null;

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
    this.pendingStartTime = null;
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

  /**
   * Compute the cursor position at an arbitrary wall-clock time.
   * Exposed for tests and debugging tools; pure, no side effects.
   */
  cursorAt(time: number): CursorPos {
    const pos = this.positionAt(time);
    return { ...pos, time };
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
    this.barTimeline = this.buildBarTimeline(opts);
  }

  /**
   * Walk the scheduler's play-order and record a wall-clock span for
   * each expanded bar. Mirrors scheduler's own loop so durations stay
   * consistent (same handling of `repeatCount`, inline meter, etc.).
   */
  private buildBarTimeline(opts: ScheduleOptions): BarTimelineEntry[] {
    const bpm =
      opts.tempoOverride && opts.tempoOverride > 0
        ? opts.tempoOverride
        : this.score.tempo?.bpm || 100;
    const secondsPerBeat = 60 / bpm;

    const flatBars: Bar[] = [];
    for (const section of this.score.sections) {
      for (const bar of section.bars) flatBars.push(bar);
    }
    const playOrder = expandPlayOrder(flatBars);

    const timeline: BarTimelineEntry[] = [];
    let cursor = 0;
    playOrder.forEach(({ barIndex }, playOrderIndex) => {
      const bar = flatBars[barIndex];
      if (!bar) return;
      const beats = bar.meter?.beats ?? this.score.meter.beats;
      // Legacy single-bar repeatCount (e.g. a plain "A x3") collapses
      // into one timeline entry — in the expanded view it still
      // occupies one visual slot. Its audible duration is the full
      // N-repeat span.
      const repeats = Math.max(1, bar.repeatCount);
      const duration = beats * secondsPerBeat * repeats;
      const startTime = cursor;
      cursor += duration;
      timeline.push({
        playOrderIndex,
        sourceBarIndex: barIndex,
        startTime,
        endTime: cursor,
      });
    });
    return timeline;
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

  private positionAt(
    time: number,
  ): { barIndex: number; beatIndex: number; expandedBarIndex: number } {
    // Binary search the bar timeline for `time ∈ [startTime, endTime)`.
    // Independent of event density so empty bars and silences don't
    // freeze the cursor on the last bar that happened to emit.
    const timeline = this.barTimeline;
    if (timeline.length === 0) {
      return { barIndex: 0, beatIndex: 0, expandedBarIndex: 0 };
    }
    let lo = 0;
    let hi = timeline.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >>> 1;
      if (timeline[mid].startTime <= time) lo = mid;
      else hi = mid - 1;
    }
    const entry = timeline[lo];
    const bar = this.score.sections
      .flatMap((s) => s.bars)[entry.sourceBarIndex];
    const beatsPerBar = bar?.meter?.beats ?? this.score.meter.beats;
    const bpm =
      this.tempoOverride && this.tempoOverride > 0
        ? this.tempoOverride
        : this.score.tempo?.bpm || 100;
    const secondsPerBeat = 60 / bpm;
    const elapsedInBar = Math.max(0, time - entry.startTime);
    const beatIndex = Math.min(
      beatsPerBar - 1,
      Math.floor(elapsedInBar / secondsPerBeat),
    );
    return {
      barIndex: entry.sourceBarIndex,
      beatIndex,
      expandedBarIndex: entry.playOrderIndex,
    };
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
