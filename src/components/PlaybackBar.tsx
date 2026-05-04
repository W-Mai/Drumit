import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
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
import {
  Badge,
  Button,
  Field,
  NumberStepper,
  SelectMenu,
  Spinner,
  Switch,
} from "./ui";
import { MobilePlaybackBar } from "./MobilePlaybackBar";
import { BeatStrip } from "./BeatStrip";
import { useI18n } from "../i18n/useI18n";

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
  toggleMetronome(): void;
  getMetronome(): boolean;
}

interface Props {
  score: Score;
  onMetronomeChange?: (on: boolean) => void;
  onBeatStripChange?: (state: {
    beatIndex: number;
    beatProgress: number;
    countIn: { beat: number; total: number } | null;
  }) => void;
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
  {
    score,
    startBar,
    onCursor,
    onStop,
    onEngineChange,
    onStateChange,
    onMetronomeChange,
    onBeatStripChange,
  },
  ref,
) {
  const { t } = useI18n();
  const [engineKind, setEngineKind] = useState<EngineKind>("synth");
  const [tempoOverride, setTempoOverride] = useState<number>(0);
  const [metronome, setMetronome] = useState(false);
  const [midiOutputs, setMidiOutputs] = useState<MIDIOutput[]>([]);
  const [selectedOutput, setSelectedOutput] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [loopEnabled, setLoopEnabled] = useState(false);
  const [playState, setPlayState] = useState<PlaybackState>("idle");
  const [beatCursor, setBeatCursor] = useState<{
    beatIndex: number;
    beatProgress: number;
  }>({ beatIndex: -1, beatProgress: 0 });
  const [countIn, setCountIn] = useState<{ beat: number; total: number } | null>(
    null,
  );

  useEffect(() => {
    onMetronomeChange?.(metronome);
  }, [metronome, onMetronomeChange]);

  useEffect(() => {
    onBeatStripChange?.({
      beatIndex: beatCursor.beatIndex,
      beatProgress: beatCursor.beatProgress,
      countIn,
    });
  }, [beatCursor, countIn, onBeatStripChange]);

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
      if (s !== "playing") setCountIn(null);
      onStateChange?.(s);
    });
    const offCursor = controller.onCursor((p) => {
      // First cursor tick after count-in means the real score is
      // rolling; drop the count-in overlay so the beat strip switches
      // to real beat indices.
      setCountIn(null);
      const bpm = tempoOverride || score.tempo?.bpm || 100;
      const beatSec = 60 / bpm;
      const frac = (p.time / beatSec) % 1;
      setBeatCursor({ beatIndex: p.beatIndex, beatProgress: frac });
      onCursor?.(p);
    });
    const offEnd = controller.onEnd(() => onStop?.());
    const offCountIn = controller.onCountIn((t) => setCountIn(t));
    return () => {
      offState();
      offCursor();
      offEnd();
      offCountIn();
    };
  }, [controller, onCursor, onStop, onStateChange, score, tempoOverride]);

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
      toggleMetronome: () => setMetronome((v) => !v),
      getMetronome: () => metronome,
    }),
    [controller, metronome],
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

  const playButton = (
    <Button
      onClick={playing ? handlePause : handlePlay}
      variant={playing ? "accent" : "success"}
      pressable
    >
      {playing
        ? t("playback.pause")
        : paused
          ? t("playback.resume")
          : typeof startBar === "number" && startBar > 0
            ? t("playback.play_at", { bar: startBar + 1 })
            : t("playback.play")}
    </Button>
  );
  const stopButton = (
    <Button
      onClick={handleStop}
      disabled={playState === "idle"}
      variant="primary"
      pressable
    >
      {t("playback.stop")}
    </Button>
  );
  const clickSwitch = (
    <Switch
      checked={metronome}
      onChange={setMetronome}
      label={t("playback.click")}
    />
  );
  const beatStrip = (
    <BeatStrip
      beats={countIn ? countIn.total : score.meter.beats}
      beatIndex={countIn ? countIn.beat : beatCursor.beatIndex}
      beatProgress={countIn ? 0 : beatCursor.beatProgress}
      active={metronome}
      playing={playState === "playing"}
      countIn={!!countIn}
      label={t("playback.beat_strip_aria")}
    />
  );
  const loopSwitch = (
    <Switch
      checked={loopEnabled}
      disabled={typeof startBar !== "number"}
      onChange={setLoopEnabled}
      label={t("playback.loop")}
      title={
        typeof startBar === "number"
          ? t("playback.loop_title", { bar: startBar + 1 })
          : t("playback.loop_title_none")
      }
    />
  );
  const engineField = (
    <Field label={`${t("playback.engine")}:`}>
      <SelectMenu
        value={engineKind}
        onChange={(v) => setEngineKind(v as EngineKind)}
        options={[
          {
            value: "synth",
            label: t("playback.engine.synth"),
            description: t("playback.engine.synth_desc"),
          },
          {
            value: "sample",
            label: t("playback.engine.sample"),
            description: t("playback.engine.sample_desc"),
          },
          ...(midiAvailable
            ? [
                {
                  value: "midi",
                  label: t("playback.engine.midi"),
                  description: t("playback.engine.midi_desc"),
                },
              ]
            : []),
        ]}
      />
    </Field>
  );
  const sampleStatus =
    engineKind === "sample" ? (
      <span className="flex items-center gap-1.5 text-[11px] text-stone-500">
        {samplesLoading ? (
          <>
            <Spinner size={11} />
            {t("playback.samples_loading")}
          </>
        ) : samplesLoaded ? null : (
          t("playback.samples_missing")
        )}
      </span>
    ) : null;
  const portField =
    engineKind === "midi" ? (
      <Field label={`${t("playback.port")}:`}>
        <SelectMenu
          value={selectedOutput}
          onChange={setSelectedOutput}
          placeholder={t("playback.port_none")}
          options={
            midiOutputs.length === 0
              ? [
                  {
                    value: "",
                    label: t("playback.port_none"),
                    disabled: true,
                  },
                ]
              : midiOutputs.map((o) => ({
                  value: o.id,
                  label: o.name ?? o.id,
                }))
          }
        />
      </Field>
    ) : null;
  const tempoField = (
    <Field label={`${t("playback.tempo")}:`}>
      <NumberStepper
        min={40}
        max={300}
        value={tempoOverride || score.tempo?.bpm || 100}
        onChange={(v) => setTempoOverride(v)}
        suffix="bpm"
      />
    </Field>
  );

  return (
    <>
      {/* Desktop: one-row layout, unchanged */}
      <div
        className="
          hidden
          lg:static lg:flex lg:flex-wrap lg:items-center lg:gap-3 lg:overflow-visible
          lg:rounded-xl lg:border lg:border-stone-200 lg:bg-white lg:px-3 lg:py-2 lg:text-xs
        "
      >
        <div className="flex items-center gap-1">
          {playButton}
          {stopButton}
        </div>
        {engineField}
        {sampleStatus}
        {portField}
        {tempoField}
        {loopSwitch}
        {clickSwitch}
        <div className="w-36 shrink-0">{beatStrip}</div>
        <span className="ml-auto text-[10px] text-stone-400 tabular-nums">
          {t(`playstate.${playState}`)}
        </span>
        {error ? <Badge tone="danger">{error}</Badge> : null}
        {!midiAvailable && engineKind === "midi" ? (
          <span className="text-stone-500">
            {t("playback.midi_unavailable")}
          </span>
        ) : null}
      </div>

      {/* Mobile: single row of primary controls, no overflow; everything
          secondary lives in a pull-up sheet. */}
      <MobilePlaybackBar
        playButton={playButton}
        stopButton={stopButton}
        clickSwitch={clickSwitch}
        loopSwitch={loopSwitch}
        beatStrip={beatStrip}
        moreContent={
          <div className="flex flex-col gap-3 text-sm">
            <div className="flex flex-wrap items-center gap-3">
              {engineField}
              {portField}
              {tempoField}
            </div>
            <div className="flex flex-wrap items-center gap-3 text-[11px] text-stone-500">
              {sampleStatus}
              <span className="ml-auto tabular-nums text-stone-400">
                {t(`playstate.${playState}`)}
              </span>
            </div>
            {error ? <Badge tone="danger">{error}</Badge> : null}
            {!midiAvailable && engineKind === "midi" ? (
              <span className="text-stone-500">
                {t("playback.midi_unavailable")}
              </span>
            ) : null}
          </div>
        }
      />
    </>
  );
});
