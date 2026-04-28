/**
 * Dedicated worker that emits `tick` messages at a steady interval.
 *
 * Browsers throttle `setTimeout` / `setInterval` on hidden tabs (typically
 * to 1 Hz). Web Workers run on a separate thread and are NOT throttled,
 * which is exactly what we need for precise MIDI scheduling even when the
 * tab is backgrounded.
 *
 * Message protocol:
 *   main → worker: { type: "start", intervalMs }
 *   main → worker: { type: "stop" }
 *   worker → main: { type: "tick" }
 */

type Inbound =
  | { type: "start"; intervalMs: number }
  | { type: "stop" };

// In a worker, `self.postMessage(data)` is typed by lib.webworker but we
// don't need those types — we just call `postMessage` directly.

let timer: ReturnType<typeof setInterval> | null = null;

self.addEventListener("message", (e: MessageEvent<Inbound>) => {
  const msg = e.data;
  if (msg.type === "start") {
    if (timer !== null) clearInterval(timer);
    timer = setInterval(() => {
      (postMessage as (data: unknown) => void)({ type: "tick" });
    }, msg.intervalMs);
  } else if (msg.type === "stop") {
    if (timer !== null) clearInterval(timer);
    timer = null;
  }
});

export {}; // make this a module
