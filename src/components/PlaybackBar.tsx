import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
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
import { cn } from "../lib/utils";
import {
  Badge,
  Button,
  Field,
  NumberStepper,
  SelectMenu,
  Spinner,
  Switch,
} from "./ui";

export type EngineKind = "synth" | "sample" | "midi";

/**
 * Imperative handle exposed to parents for transport control that
 * shouldn't be driven by prop identity. Mainly: seeking only when the
 * user explicitly asks for it (clicking a bar, using a hotkey) rather
 * than as a side effect of unrelated state changes (toggling between
 * compact and expanded preview, which used to yank the playhead back
 * to the selection).
 */
export interface PlaybackBarHandle {
  seekToBar(barIndex: number): void;
  seekToTime(seconds: number): void;
  togglePlay(): void;
}

interface Props {
  score: Score;
  /**
   * Source-bar index to treat as the loop start (and the initial
   * play-from bar on first mount). Changes to this prop while the
   * controller exists only update the loop configuration — they no
   * longer move the playhead. Use the imperative `seekToBar` /
   * `seekToTime` handle for that.
   */
  startBar?: number;
  onCursor?: (pos: {
    barIndex: number;
    beatIndex: number;
    expandedBarIndex: number;
    time: number;
  }) => void;
  onStop?: () => void;
  onEngineChange?: (kind: EngineKind) => void;
  onStateChange?: (state: PlaybackState) => void;
}

export const PlaybackBar = forwardRef<PlaybackBarHandle, Props>(function PlaybackBar(
  { score, startBar, onCursor, onStop, onEngineChange, onStateChange },
  ref,
) {
  const [engineKind, setEngineKind] = useState<EngineKind>("synth");
  const [tempoOverride, setTempoOverride] = useState<number>(0);
  const [metronome, setMetronome] = useState(false);
  const [midiOutputs, setMidiOutputs] = useState<MIDIOutput[]>([]);
  const [selectedOutput, setSelectedOutput] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [loopEnabled, setLoopEnabled] = useState(false);
  const [playState, setPlayState] = useState<PlaybackState>("idle");
  const [beatTick, setBeatTick] = useState<{ key: number; downbeat: boolean }>({
    key: 0,
    downbeat: false,
  });
  const lastBeatRef = useRef<number>(-1);

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
    const offState = controller.onStateChange((s) => {
      setPlayState(s);
      onStateChange?.(s);
    });
    const offCursor = controller.onCursor((p) => {
      if (lastBeatRef.current !== p.beatIndex) {
        lastBeatRef.current = p.beatIndex;
        setBeatTick((prev) => ({
          key: prev.key + 1,
          downbeat: p.beatIndex === 0,
        }));
      }
      onCursor?.(p);
    });
    const offEnd = controller.onEnd(() => onStop?.());
    return () => {
      offState();
      offCursor();
      offEnd();
    };
  }, [controller, onCursor, onStop, onStateChange]);

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
  // Keep the loop window in sync with the current selection (startBar).
  // This does NOT move the playhead — seeking is imperative now (see
  // the PlaybackBarHandle ref below). That way changing the Preview
  // mode or selection while playing doesn't yank playback back to the
  // selected bar.
  useEffect(() => {
    if (typeof startBar === "number") {
      controller.setLoop(
        loopEnabled ? { startBar, endBar: startBar } : null,
      );
    } else {
      controller.setLoop(null);
    }
  }, [controller, loopEnabled, startBar]);

  useImperativeHandle(
    ref,
    () => ({
      seekToBar: (barIndex: number) => controller.setStartBar(barIndex),
      seekToTime: (seconds: number) => controller.setStartTime(seconds),
      togglePlay: () => controller.togglePlay(),
    }),
    [controller],
  );

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
          pressable
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
          pressable
        >
          ■ Stop
        </Button>
      </div>

      <Field label="Engine:">
        <SelectMenu
          value={engineKind}
          onChange={(v) => setEngineKind(v as EngineKind)}
          options={[
            { value: "synth", label: "Synth", description: "internal" },
            { value: "sample", label: "Samples", description: "WAV" },
            ...(midiAvailable
              ? [{ value: "midi", label: "Web MIDI", description: "device" }]
              : []),
          ]}
        />
      </Field>

      {engineKind === "sample" ? (
        <span className="flex items-center gap-1.5 text-[11px] text-stone-500">
          {samplesLoading ? (
            <>
              <Spinner size={11} />
              loading samples…
            </>
          ) : samplesLoaded ? null : (
            "no samples installed — silent"
          )}
        </span>
      ) : null}

      {engineKind === "midi" ? (
        <Field label="Port:">
          <SelectMenu
            value={selectedOutput}
            onChange={setSelectedOutput}
            placeholder="(no ports)"
            options={
              midiOutputs.length === 0
                ? [{ value: "", label: "(no ports)", disabled: true }]
                : midiOutputs.map((o) => ({
                    value: o.id,
                    label: o.name ?? o.id,
                  }))
            }
          />
        </Field>
      ) : null}

      <Field label="Tempo:">
        <NumberStepper
          min={40}
          max={300}
          value={tempoOverride || score.tempo?.bpm || 100}
          onChange={(v) => setTempoOverride(v)}
          suffix="bpm"
        />
      </Field>

      <Switch
        checked={metronome}
        onChange={setMetronome}
        label={
          <span className="flex items-center gap-1.5">
            Click
            <span
              key={beatTick.key}
              className={cn(
                "inline-block size-1.5 rounded-full",
                metronome && playState === "playing"
                  ? beatTick.downbeat
                    ? "bg-emerald-500 motion-pulse-soft"
                    : "bg-emerald-300/70 motion-pulse-soft"
                  : "bg-stone-300",
              )}
            />
          </span>
        }
      />

      <Switch
        checked={loopEnabled}
        disabled={typeof startBar !== "number"}
        onChange={setLoopEnabled}
        label="Loop bar"
        title={
          typeof startBar === "number"
            ? `Loop bar ${startBar + 1}`
            : "Select a bar first"
        }
      />

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
});
