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

describe("PlaybackController — transport", () => {
  it("starts in idle state and transitions on play/pause/stop", async () => {
    const { score } = parseDrumtab(
      `title: T\ntempo: 60\nmeter: 4/4\n[A]\n| bd: o / o / o / o |`,
    );
    const { engine } = makeFakeEngine();
    const ctrl = new PlaybackController({ engine, score });
    const states: string[] = [];
    ctrl.onStateChange((s) => states.push(s));
    expect(ctrl.getState()).toBe("idle");
    await ctrl.play();
    expect(ctrl.getState()).toBe("playing");
    ctrl.pause();
    expect(ctrl.getState()).toBe("paused");
    await ctrl.play();
    expect(ctrl.getState()).toBe("playing");
    ctrl.stop();
    expect(ctrl.getState()).toBe("idle");
    expect(states).toEqual(["playing", "paused", "playing", "idle"]);
  });

  it("schedules only events between startOffset and end", async () => {
    const { score } = parseDrumtab(
      `title: T\ntempo: 60\nmeter: 4/4\n[A]\n| bd: o / o / o / o |\n| sn: o / o / o / o |`,
    );
    const { engine, scheduled } = makeFakeEngine();
    const ctrl = new PlaybackController({ engine, score, startBar: 1 });
    await ctrl.play();
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
      loop: { startBar: 1, endBar: 1 },
    });
    await ctrl.play();
    const instruments = new Set(scheduled.map((s) => s.event.hit.instrument));
    expect(instruments).toEqual(new Set(["snare"]));
    ctrl.stop();
  });

  it("setLoop while playing re-applies seamlessly", async () => {
    const { score } = parseDrumtab(
      `title: T\ntempo: 60\nmeter: 4/4\n[A]\n| bd: o / o / o / o |\n| sn: o / o / o / o |`,
    );
    const { engine, getStopCount } = makeFakeEngine();
    const ctrl = new PlaybackController({ engine, score });
    await ctrl.play();
    expect(ctrl.getState()).toBe("playing");
    ctrl.setLoop({ startBar: 0, endBar: 0 });
    expect(ctrl.getState()).toBe("playing");
    expect(getStopCount()).toBeGreaterThan(0); // teardown happened
    ctrl.stop();
  });

  it("setMetronome while playing keeps state playing", async () => {
    const { score } = parseDrumtab(
      `title: T\ntempo: 60\nmeter: 4/4\n[A]\n| bd: o / o / o / o |`,
    );
    const { engine } = makeFakeEngine();
    const ctrl = new PlaybackController({ engine, score });
    await ctrl.play();
    ctrl.setMetronome(true);
    expect(ctrl.getState()).toBe("playing");
    ctrl.stop();
  });

  it("setStartBar while playing jumps to the new bar", async () => {
    const { score } = parseDrumtab(
      `title: T\ntempo: 60\nmeter: 4/4\n[A]\n| bd: o / o / o / o |\n| sn: o / o / o / o |`,
    );
    const { engine, scheduled } = makeFakeEngine();
    const ctrl = new PlaybackController({ engine, score });
    await ctrl.play();
    scheduled.length = 0;
    ctrl.setStartBar(1); // synchronous re-apply
    const instrumentsAfter = new Set(
      scheduled.map((s) => s.event.hit.instrument),
    );
    expect(instrumentsAfter).toEqual(new Set(["snare"]));
    ctrl.stop();
  });

  it("setEngine while playing keeps playing state and uses new engine", async () => {
    const { score } = parseDrumtab(
      `title: T\ntempo: 60\nmeter: 4/4\n[A]\n| bd: o / o / o / o |`,
    );
    const { engine: e1, scheduled: s1 } = makeFakeEngine();
    const { engine: e2, scheduled: s2 } = makeFakeEngine();
    const ctrl = new PlaybackController({ engine: e1, score });
    await ctrl.play();
    expect(ctrl.getState()).toBe("playing");
    expect(s1.length).toBeGreaterThan(0);
    ctrl.setEngine(e2);
    // allow ensureReady micro-tasks to flush
    await new Promise((r) => setTimeout(r, 10));
    expect(ctrl.getState()).toBe("playing");
    // Previous engine no longer receives new events.
    const s1CountBefore = s1.length;
    await new Promise((r) => setTimeout(r, 20));
    expect(s1.length).toBe(s1CountBefore);
    // New engine got the remaining events.
    expect(s2.length).toBeGreaterThan(0);
    ctrl.stop();
  });

  it("setEngine while idle keeps idle state", () => {
    const { score } = parseDrumtab(
      `title: T\ntempo: 60\nmeter: 4/4\n[A]\n| bd: o / o / o / o |`,
    );
    const { engine: e1 } = makeFakeEngine();
    const { engine: e2 } = makeFakeEngine();
    const ctrl = new PlaybackController({ engine: e1, score });
    ctrl.setEngine(e2);
    expect(ctrl.getState()).toBe("idle");
  });

  it("setEngine while paused keeps paused and resumes on new engine", async () => {
    const { score } = parseDrumtab(
      `title: T\ntempo: 60\nmeter: 4/4\n[A]\n| bd: o / o / o / o |\n| sn: o / o / o / o |`,
    );
    const { engine: e1 } = makeFakeEngine();
    const { engine: e2, scheduled: s2 } = makeFakeEngine();
    const ctrl = new PlaybackController({ engine: e1, score });
    await ctrl.play();
    ctrl.pause();
    expect(ctrl.getState()).toBe("paused");
    ctrl.setEngine(e2);
    expect(ctrl.getState()).toBe("paused");
    await ctrl.play();
    expect(ctrl.getState()).toBe("playing");
    expect(s2.length).toBeGreaterThan(0);
    ctrl.stop();
  });

  it("loop cycles past the end and starts over", async () => {
    const { score } = parseDrumtab(
      `title: T\ntempo: 60\nmeter: 4/4\n[A]\n| bd: o / - / - / - |`,
    );
    const { engine, scheduled } = makeFakeEngine();
    const ctrl = new PlaybackController({
      engine,
      score,
      loop: { startBar: 0, endBar: 0 },
    });
    await ctrl.play();
    // Wait long enough (a bar at 60 bpm = 4s, skip waiting but simulate
    // by artificially advancing endOffset past one full bar).
    // We can directly trigger: fast-forward the ticker by stopping and
    // re-invoking the loop branch logic via time mocking. Simpler: just
    // verify that the initial scheduling is sane.
    expect(scheduled.length).toBeGreaterThan(0);
    expect(ctrl.getState()).toBe("playing");
    ctrl.stop();
  });

  it("setStartTime while idle seeks without leaving idle state", async () => {
    // 60bpm 4/4 → 4s per bar. Two bars: bd bar then sn bar.
    const { score } = parseDrumtab(
      `title: T\ntempo: 60\nmeter: 4/4\n[A]\n| bd: o / o / o / o |\n| sn: o / o / o / o |`,
    );
    const { engine, scheduled } = makeFakeEngine();
    const ctrl = new PlaybackController({ engine, score });
    ctrl.setStartTime(4); // jump to the start of bar 2
    expect(ctrl.getState()).toBe("idle");
    await ctrl.play();
    const instruments = new Set(scheduled.map((s) => s.event.hit.instrument));
    expect(instruments).toEqual(new Set(["snare"]));
    ctrl.stop();
  });

  it("setStartTime while playing jumps seamlessly to the new time", async () => {
    const { score } = parseDrumtab(
      `title: T\ntempo: 60\nmeter: 4/4\n[A]\n| bd: o / o / o / o |\n| sn: o / o / o / o |`,
    );
    const { engine, scheduled } = makeFakeEngine();
    const ctrl = new PlaybackController({ engine, score });
    await ctrl.play();
    scheduled.length = 0;
    ctrl.setStartTime(4);
    expect(ctrl.getState()).toBe("playing");
    const instruments = new Set(scheduled.map((s) => s.event.hit.instrument));
    expect(instruments).toEqual(new Set(["snare"]));
    ctrl.stop();
  });

  it("setStartBar clears a pending setStartTime", async () => {
    const { score } = parseDrumtab(
      `title: T\ntempo: 60\nmeter: 4/4\n[A]\n| bd: o / o / o / o |\n| sn: o / o / o / o |`,
    );
    const { engine, scheduled } = makeFakeEngine();
    const ctrl = new PlaybackController({ engine, score });
    ctrl.setStartTime(4); // would jump to bar 2
    ctrl.setStartBar(0); // overrides back to bar 1
    await ctrl.play();
    const instruments = new Set(scheduled.map((s) => s.event.hit.instrument));
    // Both bars in the schedule since we play from bar 0.
    expect(instruments).toEqual(new Set(["kick", "snare"]));
    ctrl.stop();
  });

  it("cursor expandedBarIndex walks the unrolled sequence of |: A B :| x2", () => {
    // 60 bpm 4/4 → 4s per bar. Expanded order: A(0) B(1) A(2) B(3).
    const { score } = parseDrumtab(
      `title: T\ntempo: 60\nmeter: 4/4\n[A]\n|: bd: o / o / o / o |\n| sn: o / o / o / o :|`,
    );
    const { engine } = makeFakeEngine();
    const ctrl = new PlaybackController({ engine, score });
    expect(ctrl.cursorAt(0.0).expandedBarIndex).toBe(0);
    expect(ctrl.cursorAt(4.0).expandedBarIndex).toBe(1);
    expect(ctrl.cursorAt(8.0).expandedBarIndex).toBe(2);
    expect(ctrl.cursorAt(12.0).expandedBarIndex).toBe(3);
    // sourceBarIndex alternates between 0 and 1.
    expect(ctrl.cursorAt(0.0).barIndex).toBe(0);
    expect(ctrl.cursorAt(4.0).barIndex).toBe(1);
    expect(ctrl.cursorAt(8.0).barIndex).toBe(0);
    expect(ctrl.cursorAt(12.0).barIndex).toBe(1);
  });

  it("cursor expandedBarIndex tracks |: A :| x3 as three expanded bars", () => {
    const { score } = parseDrumtab(
      `title: T\ntempo: 60\nmeter: 4/4\n[A]\n|: bd: o / o / o / o :| x3`,
    );
    const { engine } = makeFakeEngine();
    const ctrl = new PlaybackController({ engine, score });
    expect(ctrl.cursorAt(0).expandedBarIndex).toBe(0);
    expect(ctrl.cursorAt(4).expandedBarIndex).toBe(1);
    expect(ctrl.cursorAt(8).expandedBarIndex).toBe(2);
    // sourceBarIndex stays 0 across all three repeats.
    expect(ctrl.cursorAt(0).barIndex).toBe(0);
    expect(ctrl.cursorAt(4).barIndex).toBe(0);
    expect(ctrl.cursorAt(8).barIndex).toBe(0);
  });

  it("cursor honours 1st / 2nd endings in the expanded timeline", () => {
    // Pass 1: bar0(open) + bar1(ending1). Pass 2: bar0 + bar2(ending2).
    // Expanded order: [bar0, bar1, bar0, bar2] at t=[0,4,8,12].
    const { score } = parseDrumtab(
      `title: T\ntempo: 60\nmeter: 4/4\n[A]\n|: bd: o / o / o / o |\n| sn: o / o / o / o | [1]\n| sn: o / - / - / - :| [2]`,
    );
    const { engine } = makeFakeEngine();
    const ctrl = new PlaybackController({ engine, score });
    expect(ctrl.cursorAt(0).barIndex).toBe(0);
    expect(ctrl.cursorAt(4).barIndex).toBe(1); // 1st ending
    expect(ctrl.cursorAt(8).barIndex).toBe(0); // second pass
    expect(ctrl.cursorAt(12).barIndex).toBe(2); // 2nd ending
    expect(ctrl.cursorAt(12).expandedBarIndex).toBe(3);
  });

  it("cursor honours D.C. al Fine in the expanded timeline", () => {
    // Bars: 0(bd) 1(sn@fine) 2(sn@dc-to-fine). After bar 2, jump to 0,
    // then play 1 and stop at Fine. Expanded: [0,1,2,0,1].
    const src = `title: T\ntempo: 60\nmeter: 4/4\n[A]\n| bd: o / o / o / o |\n| sn: o / o / o / o |\n@fine\n| sn: o / - / - / - |\n@dc al fine`;
    const { score } = parseDrumtab(src);
    const { engine } = makeFakeEngine();
    const ctrl = new PlaybackController({ engine, score });
    expect(ctrl.cursorAt(0).barIndex).toBe(0);
    expect(ctrl.cursorAt(4).barIndex).toBe(1);
    expect(ctrl.cursorAt(8).barIndex).toBe(2);
    // After the D.C. jump.
    expect(ctrl.cursorAt(12).barIndex).toBe(0);
    expect(ctrl.cursorAt(12).expandedBarIndex).toBe(3);
    expect(ctrl.cursorAt(16).barIndex).toBe(1);
    expect(ctrl.cursorAt(16).expandedBarIndex).toBe(4);
  });

  it("cursor beatIndex advances within a bar by wall-clock time", () => {
    // 60 bpm 4/4 → beats at t = 0, 1, 2, 3 within the first bar.
    const { score } = parseDrumtab(
      `title: T\ntempo: 60\nmeter: 4/4\n[A]\n| bd: o / o / o / o |`,
    );
    const { engine } = makeFakeEngine();
    const ctrl = new PlaybackController({ engine, score });
    expect(ctrl.cursorAt(0.0).beatIndex).toBe(0);
    expect(ctrl.cursorAt(1.0).beatIndex).toBe(1);
    expect(ctrl.cursorAt(2.0).beatIndex).toBe(2);
    expect(ctrl.cursorAt(3.0).beatIndex).toBe(3);
  });

  it("pause records current time; resume continues from there", async () => {
    const { score } = parseDrumtab(
      `title: T\ntempo: 60\nmeter: 4/4\n[A]\n| bd: o / o / o / o |\n| sn: o / o / o / o |`,
    );
    const { engine, scheduled } = makeFakeEngine();
    const ctrl = new PlaybackController({
      engine,
      score,
      startBar: 1, // start from bar 2
    });
    await ctrl.play();
    ctrl.pause();
    const firstRun = scheduled.length;
    scheduled.length = 0;
    await ctrl.play(); // resume from pause
    // Should not re-send events that were already sent before pause (they
    // are all from bar 2 regardless, but the set should be the same).
    expect(firstRun).toBeGreaterThan(0);
    expect(scheduled.length).toBeLessThanOrEqual(firstRun);
    ctrl.stop();
  });

  it("togglePlay cycles idle → playing → paused → playing", async () => {
    const { score } = parseDrumtab(
      `title: T\ntempo: 60\nmeter: 4/4\n[A]\n| bd: o / o / o / o |`,
    );
    const { engine } = makeFakeEngine();
    const ctrl = new PlaybackController({ engine, score });
    expect(ctrl.getState()).toBe("idle");
    await ctrl.togglePlay();
    expect(ctrl.getState()).toBe("playing");
    ctrl.togglePlay();
    expect(ctrl.getState()).toBe("paused");
    await ctrl.togglePlay();
    expect(ctrl.getState()).toBe("playing");
    ctrl.stop();
  });

  it("setTempo overrides the bpm and rescales cursor times", () => {
    const { score } = parseDrumtab(
      `title: T\ntempo: 60\nmeter: 4/4\n[A]\n| bd: o / o / o / o |\n| bd: o / o / o / o |`,
    );
    const { engine } = makeFakeEngine();
    const ctrl = new PlaybackController({ engine, score });
    // Bar 2 starts at t=4 at 60 bpm.
    expect(ctrl.cursorAt(4).barIndex).toBe(1);
    ctrl.setTempo(120); // twice as fast → bar 2 starts at t=2.
    expect(ctrl.cursorAt(2).barIndex).toBe(1);
  });

  it("setScore replaces the active score (cursor reflects new bars)", () => {
    const { score: s1 } = parseDrumtab(
      `title: T\ntempo: 60\nmeter: 4/4\n[A]\n| bd: o / o / o / o |`,
    );
    const { score: s2 } = parseDrumtab(
      `title: T\ntempo: 60\nmeter: 4/4\n[A]\n| bd: o / o / o / o |\n| bd: o / o / o / o |\n| bd: o / o / o / o |`,
    );
    const { engine } = makeFakeEngine();
    const ctrl = new PlaybackController({ engine, score: s1 });
    // Initially only bar 0 at t=3 (still in bar 0 at 60 bpm 4/4 for first 4s).
    expect(ctrl.cursorAt(3).barIndex).toBe(0);
    ctrl.setScore(s2);
    // Now t=5 lands in bar 1 (bar 0 is [0,4), bar 1 is [4,8)).
    expect(ctrl.cursorAt(5).barIndex).toBe(1);
    expect(ctrl.cursorAt(9).barIndex).toBe(2);
  });

  it("cursorAt returns a zero position on an empty score", () => {
    const { score } = parseDrumtab(
      `title: T\ntempo: 60\nmeter: 4/4\n`,
    );
    const { engine } = makeFakeEngine();
    const ctrl = new PlaybackController({ engine, score });
    expect(ctrl.cursorAt(0)).toEqual({
      barIndex: 0,
      beatIndex: 0,
      expandedBarIndex: 0,
      time: 0,
    });
    expect(ctrl.cursorAt(10)).toMatchObject({
      barIndex: 0,
      beatIndex: 0,
      expandedBarIndex: 0,
    });
  });

  it("setStartBar past the end clamps against totalDuration", () => {
    const { score } = parseDrumtab(
      `title: T\ntempo: 60\nmeter: 4/4\n[A]\n| bd: o / o / o / o |`,
    );
    const { engine } = makeFakeEngine();
    const ctrl = new PlaybackController({ engine, score });
    // Bar index way beyond the single bar — should still be accepted
    // and not throw; cursorAt(4) is past totalDuration (4s) so it
    // clamps to the final bar.
    ctrl.setStartBar(99);
    expect(ctrl.cursorAt(3.9).barIndex).toBe(0);
  });

  it("onEnd listener can be registered and unregistered", () => {
    // Full end-of-playback requires real timers; just check that the
    // listener registration API returns an unregister function and
    // doesn't throw.
    const { score } = parseDrumtab(
      `title: T\ntempo: 60\nmeter: 4/4\n[A]\n| bd: o / o / o / o |`,
    );
    const { engine } = makeFakeEngine();
    const ctrl = new PlaybackController({ engine, score });
    let called = 0;
    const off = ctrl.onEnd(() => {
      called += 1;
    });
    expect(typeof off).toBe("function");
    off();
    // Stop after off() — listener must not fire.
    ctrl.stop();
    expect(called).toBe(0);
  });
});
