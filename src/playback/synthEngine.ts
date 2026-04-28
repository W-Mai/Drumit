import type { PlaybackEvent } from "../notation/scheduler";
import type { Instrument } from "../notation/types";
import type { PlaybackEngine } from "./engine";

/**
 * Very small Web Audio synth producing drum-ish sounds. Every voice is a
 * couple of oscillators and/or a noise buffer with an amplitude envelope.
 * Good enough to audition charts without loading samples.
 */
export class SynthEngine implements PlaybackEngine {
  readonly kind = "synth" as const;
  readonly name = "Web Audio Synth";

  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private activeNodes: AudioNode[] = [];

  async ensureReady(): Promise<void> {
    if (!this.ctx) {
      const Ctor =
        (window as unknown as { AudioContext?: typeof AudioContext })
          .AudioContext ??
        (
          window as unknown as {
            webkitAudioContext?: typeof AudioContext;
          }
        ).webkitAudioContext;
      if (!Ctor) throw new Error("Web Audio not supported in this browser");
      this.ctx = new Ctor();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.9;
      this.masterGain.connect(this.ctx.destination);

      // Pre-render 1s of white noise for reuse.
      const sr = this.ctx.sampleRate;
      const buf = this.ctx.createBuffer(1, sr * 1, sr);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) {
        data[i] = Math.random() * 2 - 1;
      }
      this.noiseBuffer = buf;
    }
    if (this.ctx.state === "suspended") await this.ctx.resume();
  }

  scheduleEvent(event: PlaybackEvent, whenSeconds: number): void {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer) return;
    const t = this.ctx.currentTime + whenSeconds;
    const vel = event.velocity / 127;
    voice(event.hit.instrument, {
      ctx: this.ctx,
      master: this.masterGain,
      noiseBuffer: this.noiseBuffer,
      time: t,
      velocity: vel,
      onNode: (n) => this.activeNodes.push(n),
    });
  }

  stop(): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    for (const node of this.activeNodes) {
      try {
        (node as AudioScheduledSourceNode).stop?.(now);
      } catch {
        // already stopped
      }
      node.disconnect?.();
    }
    this.activeNodes = [];
  }

  dispose(): void {
    this.stop();
    this.ctx?.close();
    this.ctx = null;
    this.masterGain = null;
    this.noiseBuffer = null;
  }
}

interface VoiceCtx {
  ctx: AudioContext;
  master: GainNode;
  noiseBuffer: AudioBuffer;
  time: number;
  velocity: number;
  onNode: (n: AudioNode) => void;
}

function voice(instrument: Instrument, c: VoiceCtx) {
  switch (instrument) {
    case "kick":
      return kickVoice(c);
    case "snare":
      return snareVoice(c, 180, 0.18);
    case "hihatClosed":
      return hihatVoice(c, 0.05, 0.7);
    case "hihatHalfOpen":
      return hihatVoice(c, 0.15, 0.6);
    case "hihatOpen":
      return hihatVoice(c, 0.4, 0.55);
    case "hihatFoot":
      return hihatVoice(c, 0.04, 0.5);
    case "ride":
      return rideVoice(c, false);
    case "rideBell":
      return rideVoice(c, true);
    case "crashLeft":
    case "crashRight":
      return crashVoice(c);
    case "tomHigh":
      return tomVoice(c, 200);
    case "tomMid":
      return tomVoice(c, 150);
    case "floorTom":
      return tomVoice(c, 90);
  }
}

function kickVoice(c: VoiceCtx) {
  const osc = c.ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(140, c.time);
  osc.frequency.exponentialRampToValueAtTime(45, c.time + 0.08);
  const g = c.ctx.createGain();
  g.gain.setValueAtTime(0, c.time);
  g.gain.linearRampToValueAtTime(0.9 * c.velocity, c.time + 0.003);
  g.gain.exponentialRampToValueAtTime(0.001, c.time + 0.35);
  osc.connect(g).connect(c.master);
  osc.start(c.time);
  osc.stop(c.time + 0.4);
  c.onNode(osc);
}

function snareVoice(c: VoiceCtx, tone: number, decay: number) {
  const osc = c.ctx.createOscillator();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(tone, c.time);
  const oscGain = c.ctx.createGain();
  oscGain.gain.setValueAtTime(0.4 * c.velocity, c.time);
  oscGain.gain.exponentialRampToValueAtTime(0.001, c.time + decay * 0.5);
  osc.connect(oscGain).connect(c.master);
  osc.start(c.time);
  osc.stop(c.time + decay);

  const noise = c.ctx.createBufferSource();
  noise.buffer = c.noiseBuffer;
  const bp = c.ctx.createBiquadFilter();
  bp.type = "highpass";
  bp.frequency.value = 1200;
  const ng = c.ctx.createGain();
  ng.gain.setValueAtTime(0.8 * c.velocity, c.time);
  ng.gain.exponentialRampToValueAtTime(0.001, c.time + decay);
  noise.connect(bp).connect(ng).connect(c.master);
  noise.start(c.time);
  noise.stop(c.time + decay + 0.05);
  c.onNode(osc);
  c.onNode(noise);
}

function hihatVoice(c: VoiceCtx, decay: number, amp: number) {
  const noise = c.ctx.createBufferSource();
  noise.buffer = c.noiseBuffer;
  const hp = c.ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 6000;
  const g = c.ctx.createGain();
  g.gain.setValueAtTime(amp * c.velocity, c.time);
  g.gain.exponentialRampToValueAtTime(0.001, c.time + decay);
  noise.connect(hp).connect(g).connect(c.master);
  noise.start(c.time);
  noise.stop(c.time + decay + 0.05);
  c.onNode(noise);
}

function rideVoice(c: VoiceCtx, isBell: boolean) {
  const freqs = isBell ? [3300, 5200] : [2400, 3600];
  const decay = isBell ? 0.6 : 0.9;
  freqs.forEach((f) => {
    const osc = c.ctx.createOscillator();
    osc.type = "square";
    osc.frequency.value = f;
    const g = c.ctx.createGain();
    g.gain.setValueAtTime(0.18 * c.velocity, c.time);
    g.gain.exponentialRampToValueAtTime(0.001, c.time + decay);
    osc.connect(g).connect(c.master);
    osc.start(c.time);
    osc.stop(c.time + decay);
    c.onNode(osc);
  });
  const noise = c.ctx.createBufferSource();
  noise.buffer = c.noiseBuffer;
  const bp = c.ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 5000;
  const ng = c.ctx.createGain();
  ng.gain.setValueAtTime(0.3 * c.velocity, c.time);
  ng.gain.exponentialRampToValueAtTime(0.001, c.time + decay * 0.8);
  noise.connect(bp).connect(ng).connect(c.master);
  noise.start(c.time);
  noise.stop(c.time + decay);
  c.onNode(noise);
}

function crashVoice(c: VoiceCtx) {
  const decay = 1.3;
  const noise = c.ctx.createBufferSource();
  noise.buffer = c.noiseBuffer;
  const hp = c.ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 4000;
  const g = c.ctx.createGain();
  g.gain.setValueAtTime(0.85 * c.velocity, c.time);
  g.gain.exponentialRampToValueAtTime(0.001, c.time + decay);
  noise.connect(hp).connect(g).connect(c.master);
  noise.start(c.time);
  noise.stop(c.time + decay);
  c.onNode(noise);
}

function tomVoice(c: VoiceCtx, baseFreq: number) {
  const osc = c.ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(baseFreq, c.time);
  osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.7, c.time + 0.12);
  const g = c.ctx.createGain();
  g.gain.setValueAtTime(0, c.time);
  g.gain.linearRampToValueAtTime(0.75 * c.velocity, c.time + 0.004);
  g.gain.exponentialRampToValueAtTime(0.001, c.time + 0.3);
  osc.connect(g).connect(c.master);
  osc.start(c.time);
  osc.stop(c.time + 0.35);
  c.onNode(osc);
}
