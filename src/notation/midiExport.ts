import type { Score } from "./types";
import { gmDrumMap, hitVelocity } from "./midi";
import { schedule } from "./scheduler";

/**
 * Export a `Score` as a Standard MIDI File (SMF Type 0). Channel 10 is
 * reserved for percussion in General MIDI, so every drum hit is written
 * there (zero-indexed channel 9).
 *
 * The output is a single-track SMF with:
 *   - a leading tempo meta-event (FF 51 03) derived from the score BPM
 *   - one Note On + Note Off per scheduled hit, mapped through gmDrumMap
 *   - a trailing End of Track meta-event
 *
 * PPQ is fixed at 480 (division used by most notation apps).
 */
export const PPQ = 480;
const MIDI_CHANNEL_DRUMS = 9; // zero-indexed channel 10

export interface ExportOptions {
  /** BPM override (0 or omitted = score tempo; falls back to 100). */
  tempoOverride?: number;
}

/**
 * Serialize a score to a Uint8Array containing SMF bytes, ready to be
 * saved as a `.mid` file.
 */
export function exportScoreToMidi(
  score: Score,
  options: ExportOptions = {},
): Uint8Array {
  const bpm =
    options.tempoOverride && options.tempoOverride > 0
      ? options.tempoOverride
      : score.tempo?.bpm || 100;

  // Schedule in seconds, then convert to ticks. Using seconds (instead of
  // musical positions) keeps the tempo override honest and avoids having
  // to re-walk the play-order expansion logic.
  const { events, totalDuration } = schedule(score, {
    tempoOverride: options.tempoOverride,
  });

  const secondsPerQuarter = 60 / bpm;

  // Build a list of absolute-tick MIDI channel events.
  interface TickEvent {
    tick: number;
    // Preserve insertion order for events sharing the same tick — note
    // offs should fire before note ons at the same boundary to avoid
    // accidentally releasing a just-started note on the same key.
    seq: number;
    status: number;
    data1: number;
    data2: number;
  }
  const ticks: TickEvent[] = [];
  let seq = 0;

  for (const e of events) {
    const note = gmDrumMap[e.hit.instrument];
    if (note === undefined) continue;
    const velocity = Math.max(1, Math.min(127, e.velocity ?? hitVelocity(e.hit)));
    const onTick = Math.max(0, Math.round((e.time / secondsPerQuarter) * PPQ));
    const offTick = Math.max(
      onTick + 1,
      Math.round(((e.time + Math.max(0.01, e.duration)) / secondsPerQuarter) * PPQ),
    );
    ticks.push({
      tick: onTick,
      seq: seq++,
      status: 0x90 | MIDI_CHANNEL_DRUMS,
      data1: note,
      data2: velocity,
    });
    ticks.push({
      tick: offTick,
      seq: seq++,
      status: 0x80 | MIDI_CHANNEL_DRUMS,
      data1: note,
      data2: 64,
    });
  }

  // Stable sort: by tick, then by status (note-off 0x80 before note-on
  // 0x90 at the same tick), then by original insertion order.
  ticks.sort((a, b) => {
    if (a.tick !== b.tick) return a.tick - b.tick;
    const aIsOff = (a.status & 0xf0) === 0x80;
    const bIsOff = (b.status & 0xf0) === 0x80;
    if (aIsOff !== bIsOff) return aIsOff ? -1 : 1;
    return a.seq - b.seq;
  });

  // Assemble the track body: tempo meta + events + end-of-track.
  const body: number[] = [];

  // Delta 0 — tempo meta FF 51 03 <3 bytes microseconds per quarter>.
  const microsPerQuarter = Math.round(60_000_000 / bpm);
  body.push(...vlq(0));
  body.push(0xff, 0x51, 0x03);
  body.push(
    (microsPerQuarter >> 16) & 0xff,
    (microsPerQuarter >> 8) & 0xff,
    microsPerQuarter & 0xff,
  );

  // Delta 0 — time signature meta FF 58 04 nn dd cc bb.
  // nn = numerator, dd = denominator as power of 2 (4 → 2, 8 → 3), cc =
  // MIDI clocks per metronome click (24 = quarter), bb = 32nd notes per
  // quarter (8).
  const num = score.meter.beats;
  const den = score.meter.beatUnit;
  const denPow = Math.max(0, Math.round(Math.log2(den)));
  body.push(...vlq(0));
  body.push(0xff, 0x58, 0x04, num & 0xff, denPow & 0xff, 24, 8);

  // Channel events with delta-time differences.
  let prevTick = 0;
  for (const ev of ticks) {
    const delta = Math.max(0, ev.tick - prevTick);
    prevTick = ev.tick;
    body.push(...vlq(delta));
    body.push(ev.status, ev.data1, ev.data2);
  }

  // End of Track — always at or after the last event.
  const finalTick = Math.max(
    prevTick,
    Math.round((totalDuration / secondsPerQuarter) * PPQ),
  );
  body.push(...vlq(Math.max(0, finalTick - prevTick)));
  body.push(0xff, 0x2f, 0x00);

  // Header chunk: format 0, 1 track, PPQ division.
  const header = new Uint8Array(14);
  writeAscii(header, 0, "MThd");
  writeUint32BE(header, 4, 6);
  writeUint16BE(header, 8, 0); // format 0
  writeUint16BE(header, 10, 1); // 1 track
  writeUint16BE(header, 12, PPQ);

  // Track chunk header: "MTrk" + 4-byte length + body.
  const trackHeader = new Uint8Array(8);
  writeAscii(trackHeader, 0, "MTrk");
  writeUint32BE(trackHeader, 4, body.length);

  const out = new Uint8Array(header.length + trackHeader.length + body.length);
  out.set(header, 0);
  out.set(trackHeader, header.length);
  out.set(body, header.length + trackHeader.length);
  return out;
}

/**
 * Variable-length quantity encoding as used in SMF delta times.
 * Up to 4 bytes, big-endian, with the MSB set on continuation bytes.
 */
export function vlq(value: number): number[] {
  if (value < 0) value = 0;
  if (value === 0) return [0];
  const buf: number[] = [];
  let v = value;
  buf.push(v & 0x7f);
  v >>>= 7;
  while (v > 0) {
    buf.push((v & 0x7f) | 0x80);
    v >>>= 7;
  }
  return buf.reverse();
}

function writeAscii(arr: Uint8Array, offset: number, str: string): void {
  for (let i = 0; i < str.length; i += 1) arr[offset + i] = str.charCodeAt(i);
}

function writeUint16BE(arr: Uint8Array, offset: number, value: number): void {
  arr[offset] = (value >> 8) & 0xff;
  arr[offset + 1] = value & 0xff;
}

function writeUint32BE(arr: Uint8Array, offset: number, value: number): void {
  arr[offset] = (value >>> 24) & 0xff;
  arr[offset + 1] = (value >>> 16) & 0xff;
  arr[offset + 2] = (value >>> 8) & 0xff;
  arr[offset + 3] = value & 0xff;
}
