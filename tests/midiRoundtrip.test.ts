import { describe, expect, it } from "vitest";
import { parseDrumtab } from "../src/notation/parser";
import { serializeScore } from "../src/notation/serialize";
import { exportScoreToMidi } from "../src/notation/midiExport";
import { importScoreFromMidi } from "../src/notation/midiImport";

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

  it("throws on a plain MIDI without drumit metadata (Phase B stub)", () => {
    // Manually-crafted minimal SMF with one tempo meta and nothing else.
    const bytes = new Uint8Array([
      0x4d, 0x54, 0x68, 0x64,
      0x00, 0x00, 0x00, 0x06,
      0x00, 0x00,
      0x00, 0x01,
      0x01, 0xe0,
      0x4d, 0x54, 0x72, 0x6b,
      0x00, 0x00, 0x00, 0x0b,
      0x00, 0xff, 0x51, 0x03, 0x0f, 0x42, 0x40,
      0x00, 0xff, 0x2f, 0x00,
    ]);
    expect(() => importScoreFromMidi(bytes)).toThrow(/not yet supported/);
  });
});
