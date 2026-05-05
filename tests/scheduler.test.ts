import { describe, expect, it } from "vitest";
import { parseDrumtab } from "../src/notation/parser";
import { schedule, metronomeEvents } from "../src/notation/scheduler";
import { gmDrumMap, hitVelocity } from "../src/notation/midi";

function scheduled(src: string, tempoOverride?: number) {
  const { score } = parseDrumtab(src);
  return schedule(score, { tempoOverride });
}

describe("scheduler", () => {
  it("produces events for a simple 4/4 bar at 120 bpm", () => {
    const { events, totalDuration } = scheduled(
      `title: T\ntempo: 120\nmeter: 4/4\n[A]\n| bd: o / o / o / o  sn: o / o / o / o |`,
    );
    // 4 beats at 120 bpm = 2 seconds
    expect(totalDuration).toBeCloseTo(2, 3);
    // Event count: 4 kick + 4 snare = 8
    expect(events).toHaveLength(8);
    // First kick at t=0, last at t=1.5
    const kicks = events.filter((e) => e.hit.instrument === "kick");
    expect(kicks[0].time).toBeCloseTo(0, 3);
    expect(kicks[3].time).toBeCloseTo(1.5, 3);
  });

  it("honors tempo override", () => {
    const { totalDuration } = scheduled(
      `title: T\ntempo: 120\nmeter: 4/4\n[A]\n| bd: o / o / o / o |`,
      60, // override to 60 bpm → 4 seconds
    );
    expect(totalDuration).toBeCloseTo(4, 3);
  });

  it("expands repeat-previous bars", () => {
    const { events } = scheduled(
      `title: T\ntempo: 60\nmeter: 4/4\n[A]\n| bd: o / o / o / o |\n| % |`,
    );
    // 4 kicks × 2 bars = 8 events
    expect(events.filter((e) => e.hit.instrument === "kick")).toHaveLength(8);
  });

  it("expands repeat count (x3) to 3 bar repetitions", () => {
    const { events, totalDuration } = scheduled(
      `title: T\ntempo: 60\nmeter: 4/4\n[A]\n| bd: o / o / o / o | x3`,
    );
    expect(events.filter((e) => e.hit.instrument === "kick")).toHaveLength(12);
    expect(totalDuration).toBeCloseTo(12, 3);
  });

  it("schedules triplets evenly within a beat", () => {
    const { events } = scheduled(
      `title: T\ntempo: 60\nmeter: 4/4\n[A]\n| sn: (3)xxx / x / x / x |`,
    );
    const beat0 = events
      .filter((e) => e.hit.instrument === "snare" && e.beatIndex === 0)
      .map((e) => e.time);
    expect(beat0).toHaveLength(3);
    const gap1 = beat0[1] - beat0[0];
    const gap2 = beat0[2] - beat0[1];
    expect(Math.abs(gap1 - gap2)).toBeLessThan(0.001);
    // Each triplet slot = 1/3 second (60 bpm, 1 beat = 1 sec, ÷3)
    expect(gap1).toBeCloseTo(1 / 3, 3);
  });

  it("handles intra-beat split with mixed subdivisions", () => {
    const { events } = scheduled(
      `title: T\ntempo: 60\nmeter: 4/4\n[A]\n| hh: o , xx / x / x / x |`,
    );
    const beat0 = events
      .filter((e) => e.hit.instrument === "hihatClosed" && e.beatIndex === 0)
      .map((e) => e.time);
    expect(beat0).toHaveLength(3);
    // First 8th at t=0
    expect(beat0[0]).toBeCloseTo(0, 3);
    // Back-half 16ths at t=0.5 and t=0.75 (half-beat groups, div=2)
    expect(beat0[1]).toBeCloseTo(0.5, 3);
    expect(beat0[2]).toBeCloseTo(0.75, 3);
  });

  it("metronome events count = total beats", () => {
    const { totalDuration } = scheduled(
      `title: T\ntempo: 60\nmeter: 4/4\n[A]\n| bd: o / o / o / o |\n| % |`,
    );
    const { score } = parseDrumtab(
      `title: T\ntempo: 60\nmeter: 4/4\n[A]\n| bd: o / o / o / o |\n| % |`,
    );
    const met = metronomeEvents(score, totalDuration);
    expect(met).toHaveLength(8); // 2 bars × 4 beats
    // Downbeats have higher velocity
    expect(met[0].velocity).toBeGreaterThan(met[1].velocity);
    expect(met[4].velocity).toBeGreaterThan(met[5].velocity);
  });

  it("metronome respects 3/4 meter (3 beats per bar)", () => {
    const src = `title: T\ntempo: 60\nmeter: 3/4\n[A]\n| bd: o / - / - |\n| bd: o / - / - |`;
    const { score } = parseDrumtab(src);
    const { totalDuration } = schedule(score);
    const met = metronomeEvents(score, totalDuration);
    expect(met).toHaveLength(6); // 2 bars × 3 beats
    // Downbeats at t=0 and t=3.
    expect(met[0].time).toBeCloseTo(0, 3);
    expect(met[3].time).toBeCloseTo(3, 3);
  });

  it("leading `%` (no previous bar) still consumes bar duration with no events", () => {
    const { score } = parseDrumtab(
      `title: T\ntempo: 60\nmeter: 4/4\n[A]\n| % |\n| bd: o / o / o / o |`,
    );
    const { events, totalDuration } = schedule(score);
    expect(totalDuration).toBeCloseTo(8, 2); // 2 bars × 4 beats × 1s
    // Bar 0 (`%` with no predecessor) yields no hit events.
    const bar0Events = events.filter((e) => e.barIndex === 0);
    expect(bar0Events).toHaveLength(0);
    // Bar 1's hits exist and start at t=4 (after the silent `%`).
    expect(events[0].barIndex).toBe(1);
    expect(events[0].time).toBeCloseTo(4, 2);
  });

  it("tempoOverride in schedule doubles / halves the total duration", () => {
    const src = `title: T\ntempo: 60\nmeter: 4/4\n[A]\n| bd: o / o / o / o |`;
    const { score } = parseDrumtab(src);
    const normal = schedule(score);
    const fast = schedule(score, { tempoOverride: 120 });
    expect(fast.totalDuration).toBeCloseTo(normal.totalDuration / 2, 3);
  });

  it("hit velocity reflects accent / ghost modifiers", () => {
    const { events } = scheduled(
      `title: T\ntempo: 60\nmeter: 4/4\n[A]\n| sn: o / >o / (o) / o |`,
    );
    const ordered = events.slice().sort((a, b) => a.time - b.time);
    const [plain, accent, ghost] = ordered;
    expect(hitVelocity(plain.hit)).toBe(80);
    expect(hitVelocity(accent.hit)).toBe(120);
    expect(hitVelocity(ghost.hit)).toBe(40);
    // Make the spread explicit: accents must be clearly louder than plain,
    // and ghosts clearly softer. +40 / -40 guarantees ≈3.5 dB / -6 dB gaps.
    expect(hitVelocity(accent.hit) - hitVelocity(plain.hit)).toBeGreaterThanOrEqual(40);
    expect(hitVelocity(plain.hit) - hitVelocity(ghost.hit)).toBeGreaterThanOrEqual(40);
  });
});

describe("articulation expansion", () => {
  it("flam emits a soft grace note ~18ms before the main hit", () => {
    // Put the flam on beat 2 so the grace doesn't get clamped to t=0.
    const { events } = scheduled(
      `title: T\ntempo: 60\nmeter: 4/4\n[A]\n| sn: - / fo / x / x |`,
    );
    const sn = events
      .filter((e) => e.hit.instrument === "snare")
      .sort((a, b) => a.time - b.time);
    expect(sn.length).toBeGreaterThanOrEqual(2);
    const grace = sn[0];
    const main = sn[1];
    expect(main.time - grace.time).toBeCloseTo(0.018, 3);
    expect(grace.velocity).toBeLessThan(main.velocity);
  });

  it("roll expands a single slot into 4 rapid hits", () => {
    const { events } = scheduled(
      `title: T\ntempo: 60\nmeter: 4/4\n[A]\n| sn: ~o / x / x / x |`,
    );
    const rollHits = events.filter(
      (e) => e.hit.instrument === "snare" && e.time < 1,
    );
    expect(rollHits).toHaveLength(4);
  });

  it("choke keeps a single event with shorter duration", () => {
    const { events } = scheduled(
      `title: T\ntempo: 60\nmeter: 4/4\n[A]\n| cr: o! / - / - / - |`,
    );
    const ch = events.filter((e) => e.hit.instrument === "crashLeft");
    expect(ch).toHaveLength(1);
    expect(ch[0].duration).toBeLessThanOrEqual(0.03);
  });

  it("ghost reduces velocity, accent raises it", () => {
    const { events } = scheduled(
      `title: T\ntempo: 60\nmeter: 4/4\n[A]\n| sn: (o) / >o / o / o |`,
    );
    const sn = events
      .filter((e) => e.hit.instrument === "snare")
      .slice()
      .sort((a, b) => a.time - b.time);
    const [ghost, accent, plain] = sn;
    expect(ghost.velocity).toBeLessThan(plain.velocity);
    expect(accent.velocity).toBeGreaterThan(plain.velocity);
  });

  it("schedules dotted eighth + 16th at 3:1 timing", () => {
    // 60 bpm, 4/4 → 1s/beat. Beat 0: `o. -` = dotted 8th (0.75s) + 16th (0.25s).
    // With no hit on the 16th rest, we only get bd at t=0, then next bar
    // lanes; but we can check the timing via a two-hit test.
    const { score } = parseDrumtab(
      `title: T\ntempo: 60\nmeter: 4/4\n[A]\n| bd: o. o / - / - / - |`,
    );
    const { events } = schedule(score);
    const bd = events.filter((e) => e.hit.instrument === "kick");
    expect(bd).toHaveLength(2);
    expect(bd[0].time).toBeCloseTo(0, 3);
    expect(bd[1].time).toBeCloseTo(0.75, 3);
  });

  it("schedules double-dotted 8th + 32nd at 7:1 timing", () => {
    // `o.. o` → dotted²8 (7/8 beat = 0.875s) + 32nd (0.125s).
    const { score } = parseDrumtab(
      `title: T\ntempo: 60\nmeter: 4/4\n[A]\n| bd: o.. o / - / - / - |`,
    );
    const { events } = schedule(score);
    const bd = events.filter((e) => e.hit.instrument === "kick");
    expect(bd).toHaveLength(2);
    expect(bd[1].time).toBeCloseTo(0.875, 3);
  });

  it("end-slot dotted eighth lands at 1/4 beat", () => {
    // `o-o.` — undotted slots each take 1/8 beat, the dotted eighth
    // takes 3/4 beat. At tempo 60 the second onset lands at 0.25s.
    const { score } = parseDrumtab(
      `title: T\ntempo: 60\nmeter: 4/4\n[A]\n| bd: o-o. / - / - / - |`,
    );
    const { events } = schedule(score);
    const bd = events.filter((e) => e.hit.instrument === "kick");
    expect(bd).toHaveLength(2);
    expect(bd[0].time).toBeCloseTo(0, 3);
    expect(bd[1].time).toBeCloseTo(0.25, 3);
  });

  it("total duration is unchanged when the beat contains dots", () => {
    // A bar with dotted notes still sums to the same wall-clock time.
    const { score } = parseDrumtab(
      `title: T\ntempo: 60\nmeter: 4/4\n[A]\n| bd: o.o / o.o / o.o / o.o |`,
    );
    const { totalDuration } = schedule(score);
    expect(totalDuration).toBeCloseTo(4, 3); // 4 beats × 1s
  });
});

describe("GM drum map", () => {
  it("has a note number for every instrument", () => {
    for (const [inst, note] of Object.entries(gmDrumMap)) {
      expect(note, `${inst} missing note`).toBeGreaterThan(0);
      expect(note).toBeLessThan(128);
    }
  });
});
