import { describe, expect, it } from "vitest";
import { parseDrumtab } from "../src/notation/parser";
import { serializeScore } from "../src/notation/serialize";
import {
  DRUMIT_META_PREFIX,
  exportScoreToMidi,
} from "../src/notation/midiExport";
import { importScoreFromMidi } from "../src/notation/midiImport";

function stripDrumitMeta(bytes: Uint8Array): Uint8Array {
  const prefix = new TextEncoder().encode(DRUMIT_META_PREFIX);
  for (let i = 0; i < bytes.length - prefix.length; i += 1) {
    let match = true;
    for (let j = 0; j < prefix.length; j += 1) {
      if (bytes[i + j] !== prefix[j]) {
        match = false;
        break;
      }
    }
    if (!match) continue;
    for (let k = i - 1; k >= 0; k -= 1) {
      if (bytes[k - 1] === 0xff && bytes[k] === 0x01) {
        // Step back past the delta VLQ preceding FF 01.
        let metaStart = k - 1;
        while (metaStart > 0 && (bytes[metaStart - 1] & 0x80) !== 0) {
          metaStart -= 1;
        }
        metaStart -= 1;
        let p = k + 1;
        let len = 0;
        while (p < bytes.length) {
          const b = bytes[p];
          len = (len << 7) | (b & 0x7f);
          p += 1;
          if ((b & 0x80) === 0) break;
        }
        const metaEnd = p + len;
        const removed = metaEnd - metaStart;
        const out = new Uint8Array(bytes.length - removed);
        out.set(bytes.subarray(0, metaStart), 0);
        out.set(bytes.subarray(metaEnd), metaStart);
        // Patch the enclosing MTrk length down by `removed`.
        for (let q = metaStart - 1; q >= 3; q -= 1) {
          if (
            out[q - 3] === 0x4d &&
            out[q - 2] === 0x54 &&
            out[q - 1] === 0x72 &&
            out[q] === 0x6b
          ) {
            const lenOffset = q + 1;
            const old =
              (out[lenOffset] << 24) |
              (out[lenOffset + 1] << 16) |
              (out[lenOffset + 2] << 8) |
              out[lenOffset + 3];
            const updated = old - removed;
            out[lenOffset] = (updated >>> 24) & 0xff;
            out[lenOffset + 1] = (updated >>> 16) & 0xff;
            out[lenOffset + 2] = (updated >>> 8) & 0xff;
            out[lenOffset + 3] = updated & 0xff;
            break;
          }
        }
        return out;
      }
    }
  }
  return bytes;
}

const SAMPLE = `title: 新谱
tempo: 100
meter: 4/4

[hh]
| bd: o- / -- / -- , o / --  hh: o , oo / o , o- / o- , o / o , o-  sn: - / x , -x / -x , - / x , -x |
| hh: - / - / - , ---- / - , - , - , -  sn: - / - / 0.xx / xx. |
| bd: o- / -- / -- , o / --  hh: o , oo / o , o- / o- , o / o , o-  sn: - / x , -x / -x , - / x , -x |
| hh: - / - / - , ---- / - , - , - , -  sn: - / - / --xx , --xx / 0x. |
| hh: - / - / - , ---- / - , - , - , -  sn: - / - / x , x , - , - / x.x |
| ride: o- / - / - / --  hhf: -x / -x / -x / xx  hh: oo / o- / o- / o-  hho: - / o- / - / -  bd: - / 0- / - , - / -o |
| bd: o--- / ---o / --o- / -  sn: - / x--- / - / x---  hh: oooo / oooo / oooo / oooo |
`;

describe("MIDI round-trip", () => {
  it("drumit-exported MIDI imports back to the same canonical drumtab", () => {
    const { score } = parseDrumtab(SAMPLE);
    const canonical = serializeScore(score);
    const bytes = exportScoreToMidi(score);
    const imported = importScoreFromMidi(bytes);
    expect(imported.source).toBe("embedded");
    expect(serializeScore(imported.score)).toBe(canonical);
  });

  it("reaches a fixed point on the second round-trip", () => {
    const { score } = parseDrumtab(SAMPLE);
    const once = serializeScore(
      importScoreFromMidi(exportScoreToMidi(score)).score,
    );
    const twice = serializeScore(
      importScoreFromMidi(
        exportScoreToMidi(parseDrumtab(once).score),
      ).score,
    );
    expect(twice).toBe(once);
  });

  it("infers a simple groove back when the drumit meta is stripped", () => {
    const src = `title: T\ntempo: 120\nmeter: 4/4\n[A]\n| bd: o - o - / o - o - / o - o - / o - o -  sn: - o - o / - o - o / - o - o / - o - o |`;
    const { score } = parseDrumtab(src);
    const bytes = stripDrumitMeta(exportScoreToMidi(score));
    const imported = importScoreFromMidi(bytes);
    expect(imported.source).toBe("inferred");
    const beat0 = imported.score.sections[0].bars[0].beats[0];
    const bd = beat0.lanes.find((l) => l.instrument === "kick")?.slots;
    const sn = beat0.lanes.find((l) => l.instrument === "snare")?.slots;
    expect(bd?.filter((s) => s !== null).length).toBe(2);
    expect(sn?.filter((s) => s !== null).length).toBe(2);
  });

  it("falls back to note-inference on plain MIDI without drumit metadata", () => {
    // Minimal SMF: tempo meta + one kick note (36) at tick 0.
    const bytes = new Uint8Array([
      0x4d, 0x54, 0x68, 0x64,
      0x00, 0x00, 0x00, 0x06,
      0x00, 0x00,
      0x00, 0x01,
      0x01, 0xe0,
      0x4d, 0x54, 0x72, 0x6b,
      0x00, 0x00, 0x00, 0x13,
      0x00, 0xff, 0x51, 0x03, 0x0f, 0x42, 0x40,
      0x00, 0x99, 0x24, 0x50,
      0x10, 0x89, 0x24, 0x40,
      0x00, 0xff, 0x2f, 0x00,
    ]);
    const result = importScoreFromMidi(bytes);
    expect(result.source).toBe("inferred");
    const kicks = result.score.sections[0].bars[0].beats[0].lanes
      .find((l) => l.instrument === "kick")
      ?.slots.filter((s) => s !== null);
    expect(kicks?.length).toBe(1);
  });
});
