import type { PlaybackEvent } from "../notation/scheduler";
import type { PlaybackEngine } from "./engine";
import { gmDrumMap, DEFAULT_NOTE_DURATION_S } from "../notation/midi";

/**
 * Web MIDI output engine with precise look-ahead scheduling.
 *
 * Rationale:
 *   - `output.send(msg)` fires immediately on the MIDI clock — jittery.
 *   - `output.send(msg, timestamp)` fires at the MIDI subsystem's precise
 *     scheduled time. But once queued it can't be cancelled.
 *
 * We use look-ahead scheduling: every 25 ms we enqueue every pending
 * message whose timestamp falls inside the next 100 ms window, straight
 * into the MIDI subsystem with a precise `timestamp`. Stop() drops any
 * message not yet inside the window. Users hear at most ~100 ms of
 * tail after Stop, but timing during playback is rock-solid.
 */

const LOOKAHEAD_MS = 150;
const TICK_MS = 25;

interface PendingMsg {
  /** Absolute `performance.now()` timestamp in ms. */
  timestamp: number;
  message: [number, number, number];
  /** MIDI note (for active tracking on note-on). */
  note?: number;
  kind: "on" | "off" | "cc";
}

export class MidiEngine implements PlaybackEngine {
  readonly kind = "midi" as const;
  readonly name: string;

  private access: MIDIAccess | null = null;
  private output: MIDIOutput | null = null;
  private readonly channel = 9; // MIDI channel 10

  private pending: PendingMsg[] = [];
  /** MIDI notes that have been handed to the MIDI subsystem as note-on
   *  but whose note-off hasn't been released. */
  private active = new Set<number>();

  /** Worker-based timer that isn't throttled when the tab is hidden. */
  private schedulerWorker: Worker | null = null;
  private workerRunning = false;

  constructor(outputName: string | null = null) {
    this.name = outputName ? `MIDI: ${outputName}` : "Web MIDI";
  }

  async ensureReady(): Promise<void> {
    if (!this.access) {
      if (!navigator.requestMIDIAccess) {
        throw new Error("Web MIDI is not supported in this browser");
      }
      this.access = await navigator.requestMIDIAccess({ sysex: false });
    }
  }

  listOutputs(): MIDIOutput[] {
    if (!this.access) return [];
    return [...this.access.outputs.values()];
  }

  selectOutputById(id: string | null): void {
    if (!this.access) return;
    this.output = id ? (this.access.outputs.get(id) ?? null) : null;
  }

  scheduleEvent(event: PlaybackEvent, whenSeconds: number): void {
    if (!this.output) return;
    const note = gmDrumMap[event.hit.instrument];
    if (note === undefined) return;

    const base = performance.now();
    const onAt = base + Math.max(0, whenSeconds * 1000);
    const offAt =
      onAt + (event.duration || DEFAULT_NOTE_DURATION_S) * 1000;
    const statusOn = 0x90 | this.channel;
    const statusOff = 0x80 | this.channel;

    this.pending.push({
      timestamp: onAt,
      message: [statusOn, note, event.velocity],
      note,
      kind: "on",
    });
    this.pending.push({
      timestamp: offAt,
      message: [statusOff, note, 0],
      note,
      kind: "off",
    });

    this.ensureScheduler();
  }

  stop(): void {
    // Drop anything still in the look-ahead queue.
    this.pending = [];

    this.stopScheduler();

    const output = this.output;
    if (!output) return;

    // Release every note that has been enqueued into the MIDI subsystem
    // but not yet released.
    const now = performance.now();
    const statusOff = 0x80 | this.channel;
    for (const note of this.active) {
      try {
        output.send([statusOff, note, 0], now);
      } catch {
        // ignore
      }
    }
    this.active.clear();

    // CC123 / CC120 for good measure — some soft synths ignore stray noteOffs.
    const cc = 0xb0 | this.channel;
    try {
      output.send([cc, 123, 0], now);
      output.send([cc, 120, 0], now);
    } catch {
      // ignore
    }
  }

  dispose(): void {
    this.stop();
    if (this.schedulerWorker) {
      this.schedulerWorker.terminate();
      this.schedulerWorker = null;
    }
    this.output = null;
    this.access = null;
  }

  private ensureScheduler(): void {
    if (!this.schedulerWorker) {
      this.schedulerWorker = new Worker(
        new URL("./timerWorker.ts", import.meta.url),
        { type: "module" },
      );
      this.schedulerWorker.addEventListener("message", (e) => {
        if (e.data?.type === "tick") this.tick();
      });
    }
    if (!this.workerRunning) {
      this.schedulerWorker.postMessage({ type: "start", intervalMs: TICK_MS });
      this.workerRunning = true;
    }
    // Run first tick immediately so the first event doesn't wait.
    this.tick();
  }

  private stopScheduler(): void {
    if (this.schedulerWorker && this.workerRunning) {
      this.schedulerWorker.postMessage({ type: "stop" });
      this.workerRunning = false;
    }
  }

  private tick(): void {
    const output = this.output;
    if (!output) return;
    if (this.pending.length === 0) {
      this.stopScheduler();
      return;
    }
    const horizon = performance.now() + LOOKAHEAD_MS;
    const next: PendingMsg[] = [];
    for (const msg of this.pending) {
      if (msg.timestamp <= horizon) {
        // Hand to MIDI subsystem with precise scheduled time.
        try {
          output.send(msg.message, msg.timestamp);
          if (msg.kind === "on" && msg.note !== undefined) {
            this.active.add(msg.note);
          } else if (msg.kind === "off" && msg.note !== undefined) {
            // Note: the note-off will actually fire at msg.timestamp, but
            // we can't know when that happens. Remove from active list
            // when we enqueue it — slightly inaccurate but safe: stop()
            // will broadcast CC120 anyway.
            this.active.delete(msg.note);
          }
        } catch {
          // ignore send errors (port closed)
        }
      } else {
        next.push(msg);
      }
    }
    this.pending = next;
  }
}
