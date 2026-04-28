import type { PlaybackEvent } from "../notation/scheduler";
import type { PlaybackEngine } from "./engine";
import { gmDrumMap, DEFAULT_NOTE_DURATION_S } from "../notation/midi";

/**
 * Web MIDI output engine. Sends noteOn/noteOff messages to the selected
 * MIDI output port on channel 10 (standard percussion channel).
 *
 * Unlike Web Audio, Web MIDI's `send(msg, futureTime)` schedules the message
 * in the underlying MIDI subsystem and CANNOT be cancelled. If we queued
 * three seconds of future events and the user hits Stop, those events would
 * still play. To make Stop actually stop, we dispatch every message through
 * a local `setTimeout` so Stop can clear the timers before they fire.
 */
export class MidiEngine implements PlaybackEngine {
  readonly kind = "midi" as const;
  readonly name: string;

  private access: MIDIAccess | null = null;
  private output: MIDIOutput | null = null;
  private readonly channel = 9; // 0-indexed, 9 = MIDI channel 10

  /** Pending dispatch timers, cleared on stop(). */
  private timers = new Set<ReturnType<typeof setTimeout>>();
  /** Notes currently sounding, so Stop can release them. */
  private active = new Set<number>();

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
    const output = this.output;
    if (!output) return;
    const note = gmDrumMap[event.hit.instrument];
    if (note === undefined) return;

    const onDelayMs = Math.max(0, whenSeconds * 1000);
    const duration = (event.duration || DEFAULT_NOTE_DURATION_S) * 1000;
    const offDelayMs = onDelayMs + duration;
    const statusOn = 0x90 | this.channel;
    const statusOff = 0x80 | this.channel;

    const onTimer = setTimeout(() => {
      this.timers.delete(onTimer);
      try {
        output.send([statusOn, note, event.velocity]);
        this.active.add(note);
      } catch {
        // output may have been closed
      }
    }, onDelayMs);
    this.timers.add(onTimer);

    const offTimer = setTimeout(() => {
      this.timers.delete(offTimer);
      try {
        output.send([statusOff, note, 0]);
        this.active.delete(note);
      } catch {
        // ignore
      }
    }, offDelayMs);
    this.timers.add(offTimer);
  }

  stop(): void {
    // Cancel every pending dispatch.
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();

    // Release everything currently sounding on this channel.
    const output = this.output;
    if (!output) return;
    const statusOff = 0x80 | this.channel;
    for (const note of this.active) {
      try {
        output.send([statusOff, note, 0]);
      } catch {
        // ignore
      }
    }
    this.active.clear();

    // Broadcast "All Notes Off" (CC 123) and "All Sound Off" (CC 120) for
    // good measure — some soft synths ignore stray noteOffs.
    const cc = 0xb0 | this.channel;
    try {
      output.send([cc, 123, 0]);
      output.send([cc, 120, 0]);
    } catch {
      // ignore
    }
  }

  dispose(): void {
    this.stop();
    this.output = null;
    this.access = null;
  }
}
