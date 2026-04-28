import { describe, expect, it } from "vitest";
import { parseDrumtab } from "../src/notation/parser";
import { PlaybackController } from "../src/playback/controller";
import type { PlaybackEngine } from "../src/playback/engine";
import type { PlaybackEvent } from "../src/notation/scheduler";

function makeFakeEngine() {
  const scheduled: Array<{ event: PlaybackEvent; when: number }> = [];
  let stopped = 0;
  const engine: PlaybackEngine = {
    name: "fake",
    kind: "synth",
    async ensureReady() {},
    scheduleEvent(event, when) {
      scheduled.push({ event, when });
    },
    stop() {
      stopped += 1;
    },
  };
  return { engine, scheduled, getStopCount: () => stopped };
}

describe("PlaybackController", () => {
  it("schedules only events between startOffset and end", async () => {
    const { score } = parseDrumtab(
      `title: T\ntempo: 60\nmeter: 4/4\n[A]\n| bd: o / o / o / o |\n| sn: o / o / o / o |`,
    );
    const { engine, scheduled } = makeFakeEngine();
    const ctrl = new PlaybackController({
      engine,
      score,
      startBar: 1, // start at bar 2 (0-indexed 1)
    });
    await ctrl.play();
    // All scheduled events should be from the 2nd bar (snare only).
    const instruments = new Set(scheduled.map((s) => s.event.hit.instrument));
    expect(instruments).toEqual(new Set(["snare"]));
    ctrl.stop();
  });

  it("loop option schedules only the loop range", async () => {
    const { score } = parseDrumtab(
      `title: T\ntempo: 60\nmeter: 4/4\n[A]\n| bd: o / o / o / o |\n| sn: o / o / o / o |\n| hh: x / x / x / x |`,
    );
    const { engine, scheduled } = makeFakeEngine();
    const ctrl = new PlaybackController({
      engine,
      score,
      loop: { startBar: 1, endBar: 1 }, // only the 2nd bar
    });
    await ctrl.play();
    const instruments = new Set(scheduled.map((s) => s.event.hit.instrument));
    expect(instruments).toEqual(new Set(["snare"]));
    ctrl.stop();
  });
});
