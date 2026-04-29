import { describe, expect, it } from "vitest";
import { parseDrumtab } from "../src/notation/parser";
import { exportScoreToMidi, PPQ, vlq } from "../src/notation/midiExport";
import { defaultSample } from "../src/notation/samples";

const dongCiDaCi = defaultSample().source;

describe("vlq", () => {
  it("encodes zero as a single byte", () => {
    expect(vlq(0)).toEqual([0]);
  });

  it("encodes small values as a single byte", () => {
    expect(vlq(0x40)).toEqual([0x40]);
    expect(vlq(0x7f)).toEqual([0x7f]);
  });

  it("encodes values requiring two bytes", () => {
    // 0x80 → 0x81 0x00 (continuation bit set)
    expect(vlq(0x80)).toEqual([0x81, 0x00]);
    expect(vlq(0x2000)).toEqual([0xc0, 0x00]);
  });

  it("encodes large values across four bytes", () => {
    expect(vlq(0x0fffffff)).toEqual([0xff, 0xff, 0xff, 0x7f]);
  });
});

describe("exportScoreToMidi", () => {
  it("produces a well-formed SMF with MThd + MTrk chunks", () => {
    const { score } = parseDrumtab(dongCiDaCi);
    const bytes = exportScoreToMidi(score);
    // MThd
    expect(bytes[0]).toBe(0x4d);
    expect(bytes[1]).toBe(0x54);
    expect(bytes[2]).toBe(0x68);
    expect(bytes[3]).toBe(0x64);
    // Header length = 6
    expect((bytes[4] << 24) | (bytes[5] << 16) | (bytes[6] << 8) | bytes[7]).toBe(6);
    // format 0, 1 track
    expect((bytes[8] << 8) | bytes[9]).toBe(0);
    expect((bytes[10] << 8) | bytes[11]).toBe(1);
    // division = PPQ
    expect((bytes[12] << 8) | bytes[13]).toBe(PPQ);
    // MTrk immediately after
    expect(bytes[14]).toBe(0x4d);
    expect(bytes[15]).toBe(0x54);
    expect(bytes[16]).toBe(0x72);
    expect(bytes[17]).toBe(0x6b);
  });

  it("ends the track with an End of Track meta-event", () => {
    const { score } = parseDrumtab(dongCiDaCi);
    const bytes = exportScoreToMidi(score);
    const tail = Array.from(bytes.slice(-3));
    expect(tail).toEqual([0xff, 0x2f, 0x00]);
  });

  it("writes a tempo meta-event at the top of the track", () => {
    const { score } = parseDrumtab(dongCiDaCi);
    const bytes = exportScoreToMidi(score);
    // After MThd (14) + MTrk header (8) + delta (1 byte for 0), expect
    // tempo meta bytes FF 51 03.
    // Delta VLQ starts at offset 22 and is 0x00, then FF 51 03 ...
    expect(bytes[22]).toBe(0x00);
    expect(bytes[23]).toBe(0xff);
    expect(bytes[24]).toBe(0x51);
    expect(bytes[25]).toBe(0x03);
  });

  it("writes a time signature meta-event after the tempo", () => {
    const { score } = parseDrumtab(dongCiDaCi);
    const bytes = exportScoreToMidi(score);
    // tempo meta = 1 (delta) + 3 (header) + 3 (bytes) = 7 starting at 22.
    // Next delta (1 byte 0x00), then FF 58 04 nn dd cc bb = 7 bytes.
    const timeSigStart = 22 + 7;
    expect(bytes[timeSigStart]).toBe(0x00); // delta
    expect(bytes[timeSigStart + 1]).toBe(0xff);
    expect(bytes[timeSigStart + 2]).toBe(0x58);
    expect(bytes[timeSigStart + 3]).toBe(0x04);
    // numerator = 4 (meter from dongCiDaCi is 4/4)
    expect(bytes[timeSigStart + 4]).toBe(score.meter.beats);
    // denominator power-of-2 (4 → 2)
    expect(bytes[timeSigStart + 5]).toBe(Math.round(Math.log2(score.meter.beatUnit)));
  });

  it("emits note-on events on channel 10 (0x99) for drum hits", () => {
    const { score } = parseDrumtab(dongCiDaCi);
    const bytes = exportScoreToMidi(score);
    // Find any 0x99 byte somewhere past the header — proves a drum note-on
    // was written. (0x99 = note-on, channel 9 zero-indexed = channel 10.)
    let found = false;
    for (let i = 22; i < bytes.length - 2; i += 1) {
      if (bytes[i] === 0x99) {
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });

  it("produces no hits for an empty score", () => {
    const empty = parseDrumtab("title: empty\ntempo: 100\nmeter: 4/4\n").score;
    const bytes = exportScoreToMidi(empty);
    // Should still be a valid file — MThd + MTrk + meta + end-of-track.
    expect(bytes[0]).toBe(0x4d);
    expect(bytes[bytes.length - 3]).toBe(0xff);
    expect(bytes[bytes.length - 2]).toBe(0x2f);
    expect(bytes[bytes.length - 1]).toBe(0x00);
  });

  it("respects the tempoOverride option", () => {
    const { score } = parseDrumtab(dongCiDaCi);
    const fast = exportScoreToMidi(score, { tempoOverride: 240 });
    // Microseconds per quarter at 240 BPM = 250000 = 0x03D090.
    // Tempo bytes live right after the 1-byte delta at offset 22.
    // delta(22)=0x00, FF 51 03 <hi> <mid> <lo> = offsets 26..28.
    expect(fast[26]).toBe(0x03);
    expect(fast[27]).toBe(0xd0);
    expect(fast[28]).toBe(0x90);
  });
});
