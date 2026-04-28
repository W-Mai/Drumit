import { useEffect, useMemo, useState } from "react";
import type { Score } from "../notation/types";
import { PlaybackController } from "../playback/controller";
import type { PlaybackEngine } from "../playback/engine";
import { SynthEngine } from "../playback/synthEngine";
import { MidiEngine } from "../playback/midiEngine";
import { cn } from "../lib/utils";

type EngineKind = "synth" | "midi";

interface Props {
  score: Score;
  startBar?: number;
  onCursor?: (pos: { barIndex: number; beatIndex: number }) => void;
  onStop?: () => void;
}

export function PlaybackBar({ score, startBar, onCursor, onStop }: Props) {
  const [engineKind, setEngineKind] = useState<EngineKind>("synth");
  const [tempoOverride, setTempoOverride] = useState<number>(0);
  const [metronome, setMetronome] = useState(false);
  const [midiOutputs, setMidiOutputs] = useState<MIDIOutput[]>([]);
  const [selectedOutput, setSelectedOutput] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);

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

  const engine = useMemo<PlaybackEngine>(() => {
    return engineKind === "midi" ? new MidiEngine() : new SynthEngine();
  }, [engineKind]);

  const controller = useMemo(() => {
    return new PlaybackController({
      engine,
      score,
      metronome,
      tempoOverride,
      startBar,
      onCursor: (p) => onCursor?.(p),
      onEnd: () => setPlaying(false),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, score, metronome, tempoOverride, startBar]);

  // Dispose previous controller when it changes.
  useEffect(() => {
    return () => {
      controller.dispose();
    };
  }, [controller]);

  const handlePlay = async () => {
    setError(null);
    if (!controller) return;
    try {
      if (engineKind === "midi" && engine) {
        const m = engine as MidiEngine;
        await m.ensureReady();
        if (selectedOutput) m.selectOutputById(selectedOutput);
      }
      await controller.play();
      setPlaying(true);
    } catch (err) {
      setError((err as Error).message);
      setPlaying(false);
    }
  };

  const handleStop = () => {
    controller?.stop();
    setPlaying(false);
    onStop?.();
  };

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={playing ? handleStop : handlePlay}
          className={cn(
            "rounded-full px-3 py-1 font-bold transition",
            playing
              ? "bg-red-500 text-white hover:bg-red-600"
              : "bg-emerald-500 text-white hover:bg-emerald-600",
          )}
        >
          {playing ? "■ Stop" : "▶ Play"}
        </button>
      </div>

      <label className="flex items-center gap-1 text-stone-600">
        Engine:
        <select
          value={engineKind}
          onChange={(e) => setEngineKind(e.target.value as EngineKind)}
          className="rounded border border-stone-200 bg-white px-2 py-0.5 font-bold"
        >
          <option value="synth">Synth (internal)</option>
          {midiAvailable ? <option value="midi">Web MIDI</option> : null}
        </select>
      </label>

      {engineKind === "midi" ? (
        <label className="flex items-center gap-1 text-stone-600">
          Port:
          <select
            value={selectedOutput}
            onChange={(e) => setSelectedOutput(e.target.value)}
            className="rounded border border-stone-200 bg-white px-2 py-0.5 font-bold"
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
          </select>
        </label>
      ) : null}

      <label className="flex items-center gap-1 text-stone-600">
        Tempo:
        <input
          type="number"
          min={40}
          max={300}
          value={tempoOverride || score.tempo?.bpm || 100}
          onChange={(e) => setTempoOverride(Number.parseInt(e.target.value, 10) || 0)}
          className="w-16 rounded border border-stone-200 bg-white px-2 py-0.5 text-right font-bold"
        />
        bpm
      </label>

      <label className="flex items-center gap-1 text-stone-600">
        <input
          type="checkbox"
          checked={metronome}
          onChange={(e) => setMetronome(e.target.checked)}
        />
        Click
      </label>

      {error ? (
        <span className="rounded bg-red-50 px-2 py-0.5 font-bold text-red-700">
          {error}
        </span>
      ) : null}

      {!midiAvailable && engineKind === "midi" ? (
        <span className="text-stone-500">
          Web MIDI unavailable — try Chrome / Edge
        </span>
      ) : null}
    </div>
  );
}
