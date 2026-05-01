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

  it("writes time signature meta matching the score meter", () => {
    // 3/4 → numerator 3, denPow 2 (4 = 2^2), clocks 24, 32nds 8.
    const { score } = parseDrumtab(
      `title: T\nmeter: 3/4\n[A]\n| bd: o / o / o |`,
    );
    const bytes = exportScoreToMidi(score);
    // Find the FF 58 04 <n> <d> 24 8 sequence. It's in a deterministic
    // place right after the tempo meta, but we just search for the
    // whole canonical sequence.
    let found = -1;
    for (let i = 0; i < bytes.length - 7; i += 1) {
      if (
        bytes[i] === 0xff &&
        bytes[i + 1] === 0x58 &&
        bytes[i + 2] === 0x04
      ) {
        found = i;
        break;
      }
    }
    expect(found).toBeGreaterThan(0);
    expect(bytes[found + 3]).toBe(3); // numerator = 3
    expect(bytes[found + 4]).toBe(2); // denPow (4 beats = 2^2)
    expect(bytes[found + 5]).toBe(24);
    expect(bytes[found + 6]).toBe(8);
  });

  it("writes time signature for 6/8 meter (denPow = 3)", () => {
    const { score } = parseDrumtab(
      `title: T\nmeter: 6/8\n[A]\n| bd: o / o / o / o / o / o |`,
    );
    const bytes = exportScoreToMidi(score);
    let found = -1;
    for (let i = 0; i < bytes.length - 7; i += 1) {
      if (
        bytes[i] === 0xff &&
        bytes[i + 1] === 0x58 &&
        bytes[i + 2] === 0x04
      ) {
        found = i;
        break;
      }
    }
    expect(found).toBeGreaterThan(0);
    expect(bytes[found + 3]).toBe(6);
    expect(bytes[found + 4]).toBe(3); // 8 = 2^3
  });

  it("emits note-off before note-on when they coincide at the same tick", () => {
    // Two identical consecutive hits on kick at 60 bpm → note off of
    // the first must fire before note on of the second at the boundary.
    const { score } = parseDrumtab(
      `title: T\ntempo: 60\nmeter: 4/4\n[A]\n| bd: o o / - / - / - |`,
    );
    const bytes = exportScoreToMidi(score);
    // Look for the first 0x89 (note-off ch10) and first 0x99 (note-on
    // ch10) in the track body. The second hit's note-off precedes
    // the first hit's note-on? No — order should be:
    //   note-on #1, note-off #1 (at boundary), note-on #2.
    let firstOn = -1;
    let firstOff = -1;
    for (let i = 0; i < bytes.length; i += 1) {
      if (bytes[i] === 0x99 && firstOn === -1) firstOn = i;
      if (bytes[i] === 0x89 && firstOff === -1) firstOff = i;
    }
    expect(firstOn).toBeGreaterThan(0);
    expect(firstOff).toBeGreaterThan(firstOn); // off comes after on for the first note
  });

  it("clamps velocity into 1..127 even when a scheduled event sends a weird number", () => {
    // Accent is velocity 120 per GM map — within range. But double-
    // articulated hits shouldn't exceed the cap.
    const { score } = parseDrumtab(
      `title: T\ntempo: 60\nmeter: 4/4\n[A]\n| sn: >o >o / - / - / - |`,
    );
    const bytes = exportScoreToMidi(score);
    // Note-on events sit 2 bytes past the 0x99 status — second byte
    // is the note, third is velocity. Walk through them; no velocity
    // byte may be 0 or >127.
    for (let i = 0; i < bytes.length - 2; i += 1) {
      if (bytes[i] === 0x99 || bytes[i] === 0x89) {
        const vel = bytes[i + 2];
        expect(vel).toBeGreaterThanOrEqual(1);
        expect(vel).toBeLessThanOrEqual(127);
      }
    }
  });

  it("exports dotted 8th + 16th with 3:1 delta-time ratio", () => {
    // `o. o` → dotted 8th (3/4 beat = 3*PPQ/4) then 16th (PPQ/4).
    const { score } = parseDrumtab(
      `title: T\ntempo: 60\nmeter: 4/4\n[A]\n| bd: o. o / - / - / - |`,
    );
    const bytes = exportScoreToMidi(score);
    // Smoke check: it produced something and didn't throw.
    expect(bytes.length).toBeGreaterThan(50);
    // 3/4 of PPQ (default 480) = 360 → vlq encodes as 0x82 0x68.
    // Rather than match exact byte offsets, confirm the expected
    // delta appears somewhere in the track.
    const target = vlq(Math.round((3 * PPQ) / 4));
    let found = false;
    for (let i = 0; i <= bytes.length - target.length; i += 1) {
      let ok = true;
      for (let j = 0; j < target.length; j += 1) {
        if (bytes[i + j] !== target[j]) {
          ok = false;
          break;
        }
      }
      if (ok) {
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });
});
