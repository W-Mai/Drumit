import { useEffect, useMemo, useState } from "react";
import type { Score } from "../notation/types";
import {
  PlaybackController,
  type PlaybackState,
} from "../playback/controller";
import type { PlaybackEngine } from "../playback/engine";
import { SynthEngine } from "../playback/synthEngine";
import { MidiEngine } from "../playback/midiEngine";
import { SampleEngine } from "../playback/sampleEngine";
import { useHotkeys } from "../lib/useHotkeys";
import { Badge, Button, Field, Select, TextInput } from "./ui";

export type EngineKind = "synth" | "sample" | "midi";

interface Props {
  score: Score;
  startBar?: number;
  /**
   * Absolute time (seconds) to start from, taking precedence over
   * `startBar`. The expanded preview uses this because its bar indices
   * live in the unrolled timeline that doesn't map 1:1 to source bars.
   */
  startTimeOverride?: number;
  onCursor?: (pos: {
    barIndex: number;
    beatIndex: number;
    expandedBarIndex: number;
  }) => void;
  onStop?: () => void;
  onEngineChange?: (kind: EngineKind) => void;
}

export function PlaybackBar({
  score,
  startBar,
  startTimeOverride,
  onCursor,
  onStop,
  onEngineChange,
}: Props) {
  const [engineKind, setEngineKind] = useState<EngineKind>("synth");
  const [tempoOverride, setTempoOverride] = useState<number>(0);
  const [metronome, setMetronome] = useState(false);
  const [midiOutputs, setMidiOutputs] = useState<MIDIOutput[]>([]);
  const [selectedOutput, setSelectedOutput] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [loopEnabled, setLoopEnabled] = useState(false);
  const [playState, setPlayState] = useState<PlaybackState>("idle");

  const midiAvailable =
    typeof navigator !== "undefined" && !!navigator.requestMIDIAccess;

  // Populate MIDI outputs lazily on first switch to MIDI engine.
  useEffect(() => {
    if (engineKind !== "midi" || !midiAvailable) return;
    (async () => {
      try {
        const access = await navigator.requestMIDIAccess({ sysex: false });
        const outs = [...access.outputs.values()];
        setMidiOutputs(outs);
        if (outs.length && !selectedOutput) setSelectedOutput(outs[0].id);
      } catch (err) {
        setError((err as Error).message);
      }
    })();
  }, [engineKind, midiAvailable, selectedOutput]);

  // One long-lived controller for the whole component lifetime.
  // Engine swaps happen via controller.setEngine() — controller identity
  // stays stable so subscriptions and state never get torn down mid-play.
  const controller = useMemo(() => {
    const initialEngine: PlaybackEngine = new SynthEngine();
    return new PlaybackController({
      engine: initialEngine,
      score,
      metronome,
      tempoOverride,
      startBar,
      loop:
        loopEnabled && typeof startBar === "number"
          ? { startBar, endBar: startBar }
          : null,
    });
    // Intentionally empty deps: build once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [samplesLoaded, setSamplesLoaded] = useState(false);
  const [samplesLoading, setSamplesLoading] = useState(false);

  // Swap engine whenever engineKind changes. Sample loading status is
  // pushed via an async IIFE so the setState calls happen after the
  // effect body returns (satisfies react-hooks/set-state-in-effect).
  useEffect(() => {
    let cancelled = false;
    let next: PlaybackEngine;
    if (engineKind === "midi") {
      next = new MidiEngine();
    } else if (engineKind === "sample") {
      const sampleEngine = new SampleEngine();
      next = sampleEngine;
      void (async () => {
        if (cancelled) return;
        setSamplesLoading(true);
        setSamplesLoaded(false);
        try {
          await sampleEngine.ensureReady();
          if (!cancelled) setSamplesLoaded(sampleEngine.loadedCount > 0);
        } finally {
          if (!cancelled) setSamplesLoading(false);
        }
      })();
    } else {
      next = new SynthEngine();
    }
    controller.setEngine(next);
    onEngineChange?.(engineKind);
    return () => {
      cancelled = true;
    };
  }, [engineKind, controller, onEngineChange]);

  // Apply MIDI port selection whenever it changes (on the current engine).
  useEffect(() => {
    const engine = controller.getEngine();
    if (engine instanceof MidiEngine && selectedOutput) {
      void engine.ensureReady().then(() => {
        engine.selectOutputById(selectedOutput);
      });
    }
  }, [controller, selectedOutput, engineKind]);

  // Subscribe to controller events.
  useEffect(() => {
    const offState = controller.onStateChange(setPlayState);
    const offCursor = controller.onCursor((p) => onCursor?.(p));
    const offEnd = controller.onEnd(() => onStop?.());
    return () => {
      offState();
      offCursor();
      offEnd();
    };
  }, [controller, onCursor, onStop]);

  // Push external option changes into the controller (no restart).
  useEffect(() => {
    controller.setScore(score);
  }, [controller, score]);
  useEffect(() => {
    controller.setMetronome(metronome);
  }, [controller, metronome]);
  useEffect(() => {
    controller.setTempo(tempoOverride);
  }, [controller, tempoOverride]);
  useEffect(() => {
    if (typeof startTimeOverride === "number") {
      // Expanded-preview path: drive the cursor by absolute time.
      // Loop from an expanded bar isn't meaningful (the loop endpoints
      // live in source-bar space), so we just clear any existing loop.
      controller.setLoop(null);
      controller.setStartTime(startTimeOverride);
    } else if (typeof startBar === "number") {
      controller.setLoop(
        loopEnabled ? { startBar, endBar: startBar } : null,
      );
      controller.setStartBar(startBar);
    }
  }, [controller, loopEnabled, startBar, startTimeOverride]);

  // Final cleanup on unmount.
  useEffect(() => {
    return () => {
      controller.dispose();
    };
  }, [controller]);

  const playing = playState === "playing";
  const paused = playState === "paused";

  const handlePlay = async () => {
    setError(null);
    try {
      await controller.play();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handlePause = () => controller.pause();
  const handleStop = () => {
    controller.stop();
    onStop?.();
  };

  useHotkeys([
    {
      key: " ",
      description: "Play / Pause",
      handler: () => {
        if (playing) handlePause();
        else handlePlay();
      },
    },
    {
      key: "Escape",
      description: "Stop",
      handler: () => {
        if (playState !== "idle") handleStop();
      },
    },
    {
      key: "l",
      description: "Toggle loop",
      handler: () => setLoopEnabled((v) => !v),
    },
    {
      key: "m",
      description: "Toggle metronome",
      handler: () => setMetronome((v) => !v),
    },
  ]);

  return (
    <div
      className="
        fixed inset-x-0 bottom-0 z-30
        flex items-center gap-3 overflow-x-auto
        border-t border-stone-200 bg-white px-3 py-2 text-xs
        pb-[max(0.5rem,env(safe-area-inset-bottom))]
        lg:static lg:flex-wrap lg:overflow-visible
        lg:rounded-xl lg:border lg:pb-2
      "
    >
      <div className="flex items-center gap-1">
        <Button
          onClick={playing ? handlePause : handlePlay}
          variant={playing ? "accent" : "success"}
        >
          {playing
            ? "❚❚ Pause"
            : paused
              ? "▶ Resume"
              : typeof startBar === "number" && startBar > 0
                ? `▶ Play @${startBar + 1}`
                : "▶ Play"}
        </Button>
        <Button
          onClick={handleStop}
          disabled={playState === "idle"}
          variant="primary"
        >
          ■ Stop
        </Button>
      </div>

      <Field label="Engine:">
        <Select
          value={engineKind}
          onChange={(e) => setEngineKind(e.target.value as EngineKind)}
        >
          <option value="synth">Synth (internal)</option>
          <option value="sample">Samples (WAV)</option>
          {midiAvailable ? <option value="midi">Web MIDI</option> : null}
        </Select>
      </Field>

      {engineKind === "sample" ? (
        <span className="text-[11px] text-stone-500">
          {samplesLoading
            ? "loading samples…"
            : samplesLoaded
              ? null
              : "no samples installed — silent"}
        </span>
      ) : null}

      {engineKind === "midi" ? (
        <Field label="Port:">
          <Select
            value={selectedOutput}
            onChange={(e) => setSelectedOutput(e.target.value)}
          >
            {midiOutputs.length === 0 ? (
              <option value="">(no ports)</option>
            ) : (
              midiOutputs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name ?? o.id}
                </option>
              ))
            )}
          </Select>
        </Field>
      ) : null}

      <Field label="Tempo:">
        <TextInput
          type="number"
          min={40}
          max={300}
          value={tempoOverride || score.tempo?.bpm || 100}
          onChange={(e) =>
            setTempoOverride(Number.parseInt(e.target.value, 10) || 0)
          }
          className="w-16 text-right"
        />
        <span>bpm</span>
      </Field>

      <Field label={null}>
        <input
          type="checkbox"
          checked={metronome}
          onChange={(e) => setMetronome(e.target.checked)}
        />
        <span>Click</span>
      </Field>

      <Field
        label={null}
        disabled={typeof startBar !== "number"}
        title={
          typeof startBar === "number"
            ? `Loop bar ${startBar + 1}`
            : "Select a bar first"
        }
      >
        <input
          type="checkbox"
          checked={loopEnabled}
          disabled={typeof startBar !== "number"}
          onChange={(e) => setLoopEnabled(e.target.checked)}
        />
        <span>Loop bar</span>
      </Field>

      <span className="ml-auto text-[10px] text-stone-400 tabular-nums">
        {playState}
      </span>

      {error ? <Badge tone="danger">{error}</Badge> : null}

      {!midiAvailable && engineKind === "midi" ? (
        <span className="text-stone-500">
          Web MIDI unavailable — try Chrome / Edge
        </span>
      ) : null}
    </div>
  );
}
