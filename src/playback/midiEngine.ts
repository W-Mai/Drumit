import type { PlaybackEvent } from "../notation/scheduler";
import type { PlaybackEngine } from "./engine";
import { gmDrumMap, DEFAULT_NOTE_DURATION_S } from "../notation/midi";

/**
 * A Web MIDI output engine. Sends noteOn/noteOff messages to the selected
 * MIDI output port on channel 10 (standard percussion channel).
 *
 * The browser must grant MIDI access; without a user gesture many browsers
 * refuse. Callers are expected to call `requestAccess()` from a click.
 */
export class MidiEngine implements PlaybackEngine {
  readonly kind = "midi" as const;
  readonly name: string;

  private access: MIDIAccess | null = null;
  private output: MIDIOutput | null = null;
  private readonly channel = 9; // MIDI channels are 0-indexed, 9 = channel 10

  /** All currently-sounding notes so we can force a stop. */
  private activeNotes: { port: MIDIOutput; note: number; scheduledAt: number }[] = [];

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
    if (!id) {
      this.output = null;
      return;
    }
    this.output = this.access.outputs.get(id) ?? null;
  }

  scheduleEvent(event: PlaybackEvent, whenSeconds: number): void {
    if (!this.output) return;
    const note = gmDrumMap[event.hit.instrument];
    if (note === undefined) return;
    const onTime = performance.now() + whenSeconds * 1000;
    const offTime = onTime + (event.duration || DEFAULT_NOTE_DURATION_S) * 1000;
    const status = 0x90 | this.channel; // noteOn
    const statusOff = 0x80 | this.channel;
    this.output.send([status, note, event.velocity], onTime);
    this.output.send([statusOff, note, 0], offTime);
    this.activeNotes.push({ port: this.output, note, scheduledAt: onTime });
  }

  stop(): void {
    if (!this.output) return;
    const now = performance.now();
    const statusOff = 0x80 | this.channel;
    for (const n of this.activeNotes) {
      try {
        n.port.send([statusOff, n.note, 0], now);
      } catch {
        // ignore
      }
    }
    // All notes off on channel 10.
    const statusCc = 0xb0 | this.channel;
    try {
      this.output.send([statusCc, 123, 0], now);
    } catch {
      // ignore
    }
    this.activeNotes = [];
  }

  dispose(): void {
    this.stop();
    this.output = null;
    this.access = null;
  }
}
