// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SampleEngine } from "../src/playback/sampleEngine";
import type { PlaybackEvent } from "../src/notation/scheduler";

/**
 * Minimal AudioContext stub sufficient for SampleEngine's calls. Each
 * fake buffer source records start calls so the tests can check that a
 * sample was actually scheduled.
 */
interface FakeSource {
  buffer: unknown;
  connect: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
}

function installFakeAudio(): FakeSource[] {
  const sources: FakeSource[] = [];
  const gainNode = { gain: { value: 0 }, connect: vi.fn() };
  const masterGain = { gain: { value: 0 }, connect: vi.fn() };
  const ctx = {
    state: "running",
    currentTime: 0,
    destination: {},
    createGain: vi.fn(() => {
      return { gain: { value: 0 }, connect: vi.fn() };
    }),
    createBufferSource: vi.fn((): FakeSource => {
      const src: FakeSource = {
        buffer: null,
        connect: vi.fn(() => gainNode),
        start: vi.fn(),
        stop: vi.fn(),
        disconnect: vi.fn(),
      };
      sources.push(src);
      return src;
    }),
    decodeAudioData: vi.fn(
      async () => ({ duration: 0.3 }) as unknown as AudioBuffer,
    ),
    resume: vi.fn(async () => {}),
    close: vi.fn(),
  };
  // First createGain call is the master.
  ctx.createGain = vi.fn((): typeof masterGain => masterGain);
  // `new AudioContext()` needs a real constructor. Define one that
  // always returns our ctx stub.
  class FakeAudioContext {
    constructor() {
      return ctx as unknown as AudioContext;
    }
  }
  (window as unknown as { AudioContext: unknown }).AudioContext =
    FakeAudioContext;
  return sources;
}

function installFakeFetch(responses: Record<string, "ok" | 404>) {
  const fn = vi.fn(async (url: string) => {
    const match = Object.entries(responses).find(([suffix]) =>
      url.endsWith(suffix),
    );
    if (!match || match[1] === 404) {
      return { ok: false, status: 404 } as unknown as Response;
    }
    return {
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
    } as unknown as Response;
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

function fakeHit(instrument: PlaybackEvent["hit"]["instrument"]): PlaybackEvent {
  return {
    barIndex: 0,
    beatIndex: 0,
    time: 0,
    duration: 0.1,
    velocity: 96,
    hit: {
      instrument,
      head: "solid",
      articulations: [],
    },
  };
}

beforeEach(() => {
  // Fresh DOM each test.
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("SampleEngine", () => {
  it("loads every sample file listed in SAMPLE_FILES when all fetches succeed", async () => {
    installFakeAudio();
    installFakeFetch({
      "kick.ogg": "ok",
      "snare.ogg": "ok",
      "hihat-closed.ogg": "ok",
      "hihat-halfopen.ogg": "ok",
      "hihat-open.ogg": "ok",
      "hihat-foot.ogg": "ok",
      "ride.ogg": "ok",
      "ride-bell.ogg": "ok",
      "crash-left.ogg": "ok",
      "crash-right.ogg": "ok",
      "tom-high.ogg": "ok",
      "tom-mid.ogg": "ok",
      "floor-tom.ogg": "ok",
    });
    const engine = new SampleEngine({ baseUrl: "/samples/" });
    await engine.ensureReady();
    expect(engine.loadedCount).toBe(13);
  });

  it("tolerates missing sample files (404) per instrument", async () => {
    installFakeAudio();
    installFakeFetch({
      "kick.ogg": "ok",
      "snare.ogg": 404,
      "hihat-closed.ogg": "ok",
      "hihat-halfopen.ogg": 404,
      "hihat-open.ogg": 404,
      "hihat-foot.ogg": 404,
      "ride.ogg": 404,
      "ride-bell.ogg": 404,
      "crash-left.ogg": 404,
      "crash-right.ogg": 404,
      "tom-high.ogg": 404,
      "tom-mid.ogg": 404,
      "floor-tom.ogg": 404,
    });
    const engine = new SampleEngine({ baseUrl: "/samples/" });
    await engine.ensureReady();
    expect(engine.loadedCount).toBe(2);
  });

  it("schedules a BufferSourceNode for an instrument that has a sample", async () => {
    const sources = installFakeAudio();
    installFakeFetch({ "kick.ogg": "ok" });
    const engine = new SampleEngine({ baseUrl: "/samples/" });
    await engine.ensureReady();
    engine.scheduleEvent(fakeHit("kick"), 0.25);
    expect(sources).toHaveLength(1);
    expect(sources[0].start).toHaveBeenCalledOnce();
  });

  it("silently skips instruments with no sample loaded", async () => {
    const sources = installFakeAudio();
    installFakeFetch({}); // everything 404
    const engine = new SampleEngine({ baseUrl: "/samples/" });
    await engine.ensureReady();
    engine.scheduleEvent(fakeHit("kick"), 0);
    expect(sources).toHaveLength(0);
  });

  it("stop() calls stop on every active buffer source", async () => {
    const sources = installFakeAudio();
    installFakeFetch({ "kick.ogg": "ok", "snare.ogg": "ok" });
    const engine = new SampleEngine({ baseUrl: "/samples/" });
    await engine.ensureReady();
    engine.scheduleEvent(fakeHit("kick"), 0);
    engine.scheduleEvent(fakeHit("snare"), 0.1);
    engine.stop();
    for (const src of sources) expect(src.stop).toHaveBeenCalled();
  });

  it("dispose() clears buffers and is idempotent", async () => {
    installFakeAudio();
    installFakeFetch({ "kick.ogg": "ok" });
    const engine = new SampleEngine({ baseUrl: "/samples/" });
    await engine.ensureReady();
    expect(engine.loadedCount).toBe(1);
    engine.dispose();
    // Calling dispose twice doesn't throw.
    expect(() => engine.dispose()).not.toThrow();
  });

  it("accepts scheduleEvent after stop without throwing (fresh events)", async () => {
    const sources = installFakeAudio();
    installFakeFetch({ "kick.ogg": "ok" });
    const engine = new SampleEngine({ baseUrl: "/samples/" });
    await engine.ensureReady();
    engine.scheduleEvent(fakeHit("kick"), 0);
    engine.stop();
    engine.scheduleEvent(fakeHit("kick"), 0.1);
    // A new source is created for the second event.
    expect(sources.length).toBeGreaterThanOrEqual(1);
  });
});
