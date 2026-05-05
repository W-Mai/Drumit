import type {
  Bar,
  Beat,
  Hit,
  Instrument,
  LaneBeat,
  Score,
  Section,
} from "./types";
import { parseDrumtab } from "./parser";
import { DRUMIT_META_PREFIX } from "./midiExport";
import { gmDrumMap } from "./midi";
import { defaultHeadFor } from "./instruments";

export interface ImportResult {
  score: Score;
  source: "embedded" | "inferred";
  warnings: string[];
}

interface NoteOn {
  tick: number;
  note: number;
  velocity: number;
}

export function importScoreFromMidi(bytes: Uint8Array): ImportResult {
  const r = new Reader(bytes);
  if (!r.matchAscii("MThd")) throw new Error("Not an SMF: missing MThd");
  const headerLen = r.readUint32BE();
  if (headerLen < 6) throw new Error("SMF header too short");
  r.skip(2); // format
  r.skip(2); // track count
  const ppq = r.readUint16BE();
  r.skip(headerLen - 6);

  const warnings: string[] = [];
  let tempoBpm: number | null = null;
  let multipleTempos = false;
  let meter: { beats: number; beatUnit: number } | null = null;
  let embeddedText: string | null = null;
  const noteOns: NoteOn[] = [];

  while (!r.eof()) {
    if (!r.matchAscii("MTrk")) {
      const len = r.readUint32BE();
      r.skip(len);
      continue;
    }
    const trackLen = r.readUint32BE();
    const trackEnd = r.pos + trackLen;
    let runningStatus = 0;
    let tick = 0;
    while (r.pos < trackEnd) {
      tick += r.readVLQ();
      let status = r.peek();
      if (status < 0x80) status = runningStatus;
      else r.readByte();
      if (status === 0xff) {
        const metaType = r.readByte();
        const len = r.readVLQ();
        if (metaType === 0x51 && len === 3) {
          const micros =
            (r.readByte() << 16) | (r.readByte() << 8) | r.readByte();
          const bpm = Math.round(60_000_000 / micros);
          if (tempoBpm === null) tempoBpm = bpm;
          else multipleTempos = true;
        } else if (metaType === 0x58 && len === 4) {
          const num = r.readByte();
          const denPow = r.readByte();
          r.skip(2);
          if (!meter) meter = { beats: num, beatUnit: 1 << denPow };
        } else if (metaType === 0x01) {
          const text = r.readString(len);
          if (text.startsWith(DRUMIT_META_PREFIX)) {
            embeddedText = text.slice(DRUMIT_META_PREFIX.length);
          }
        } else {
          r.skip(len);
        }
      } else if (status === 0xf0 || status === 0xf7) {
        const len = r.readVLQ();
        r.skip(len);
      } else {
        runningStatus = status;
        const family = status & 0xf0;
        if (family === 0x90) {
          const note = r.readByte();
          const velocity = r.readByte();
          if (velocity > 0) noteOns.push({ tick, note, velocity });
          // note-on velocity 0 = note off, ignore
        } else if (
          family === 0x80 ||
          family === 0xa0 ||
          family === 0xb0 ||
          family === 0xe0
        ) {
          r.skip(2);
        } else if (family === 0xc0 || family === 0xd0) {
          r.skip(1);
        }
      }
    }
    r.seek(trackEnd);
  }

  if (embeddedText !== null) {
    const { score, diagnostics } = parseDrumtab(embeddedText);
    for (const d of diagnostics) {
      if (d.level === "warning") warnings.push(d.message);
    }
    return { score, source: "embedded", warnings };
  }

  if (multipleTempos) {
    warnings.push("Multiple tempo changes found; only the first was used.");
  }

  const bpm = tempoBpm ?? 100;
  const m = meter ?? { beats: 4, beatUnit: 4 };
  const score = inferScoreFromNotes(noteOns, ppq, bpm, m, warnings);
  return { score, source: "inferred", warnings };
}

/* ------------------------------------------------------------------ */
/* Phase B: quantise-and-reconstruct from raw note events              */
/* ------------------------------------------------------------------ */

function inferScoreFromNotes(
  notes: NoteOn[],
  ppq: number,
  bpm: number,
  meter: { beats: number; beatUnit: number },
  warnings: string[],
): Score {
  const instrByNote = buildInstrumentLookup();
  const ticksPerBeat = ppq;
  const ticksPerBar = ticksPerBeat * meter.beats;

  interface ResolvedNote {
    tick: number;
    instrument: Instrument;
    velocity: number;
    snapped: boolean;
  }
  const resolved: ResolvedNote[] = [];
  let unmapped = 0;
  for (const n of notes) {
    const hit = instrByNote.get(n.note);
    if (hit) {
      resolved.push({
        tick: n.tick,
        instrument: hit,
        velocity: n.velocity,
        snapped: false,
      });
      continue;
    }
    const fallback = nearestInstrument(n.note, instrByNote);
    if (fallback) {
      resolved.push({
        tick: n.tick,
        instrument: fallback,
        velocity: n.velocity,
        snapped: true,
      });
      unmapped += 1;
    }
  }
  if (unmapped > 0) {
    warnings.push(
      `${unmapped} note(s) outside the GM drum map; mapped to nearest instrument.`,
    );
  }

  if (resolved.length === 0) {
    warnings.push("No notes found in the MIDI file.");
    return emptyScore("Imported", bpm, meter);
  }

  const lastTick = resolved[resolved.length - 1].tick;
  const barCount = Math.max(1, Math.ceil((lastTick + 1) / ticksPerBar));
  const bars: Bar[] = [];
  for (let barIdx = 0; barIdx < barCount; barIdx += 1) {
    const barStart = barIdx * ticksPerBar;
    const barEnd = barStart + ticksPerBar;
    const inBar = resolved.filter(
      (n) => n.tick >= barStart && n.tick < barEnd,
    );
    bars.push(buildBar(inBar, barStart, ticksPerBeat, meter.beats));
  }

  return {
    version: 1,
    title: "Imported",
    tempo: { bpm, note: "quarter" },
    meter,
    sections: [{ label: "", bars } satisfies Section],
  };
}

const CANDIDATE_DIVISIONS = [1, 2, 3, 4, 6, 8];

function buildBar(
  notes: Array<{
    tick: number;
    instrument: Instrument;
    velocity: number;
  }>,
  barStart: number,
  ticksPerBeat: number,
  beatsPerBar: number,
): Bar {
  const beats: Beat[] = [];
  for (let bi = 0; bi < beatsPerBar; bi += 1) {
    const beatStart = barStart + bi * ticksPerBeat;
    const beatEnd = beatStart + ticksPerBeat;
    const inBeat = notes.filter(
      (n) => n.tick >= beatStart && n.tick < beatEnd,
    );
    const division = pickDivisionForBeat(
      inBeat.map((n) => n.tick - beatStart),
      ticksPerBeat,
    );
    const slotSize = ticksPerBeat / division;

    const byInstrument = new Map<Instrument, Array<Hit | null>>();
    for (const n of inBeat) {
      const slotIdx = Math.min(
        division - 1,
        Math.max(0, Math.round((n.tick - beatStart) / slotSize)),
      );
      const lane = byInstrument.get(n.instrument) ?? newSlotArray(division);
      lane[slotIdx] = hitFor(n.instrument, n.velocity);
      byInstrument.set(n.instrument, lane);
    }

    const lanes: LaneBeat[] = [];
    for (const [instrument, slots] of byInstrument) {
      lanes.push({
        instrument,
        division,
        slots,
      } satisfies LaneBeat);
    }
    beats.push({ lanes } satisfies Beat);
  }
  return { beats } as Bar;
}

function pickDivisionForBeat(
  offsets: number[],
  ticksPerBeat: number,
): number {
  if (offsets.length <= 1) return 1;
  const unique = Array.from(new Set(offsets)).sort((a, b) => a - b);
  // Pick the smallest candidate that (a) quantises every unique offset
  // within 1/8 of a slot, and (b) lands them on distinct slots.
  for (const d of CANDIDATE_DIVISIONS) {
    const slot = ticksPerBeat / d;
    const tol = slot / 8;
    const slotsSeen = new Set<number>();
    let ok = true;
    for (const off of unique) {
      const slotIdx = Math.round(off / slot);
      const rem = off - slotIdx * slot;
      if (Math.abs(rem) > tol || slotsSeen.has(slotIdx)) {
        ok = false;
        break;
      }
      slotsSeen.add(slotIdx);
    }
    if (ok) return d;
  }
  return 8;
}

function newSlotArray(division: number): Array<Hit | null> {
  return Array.from({ length: division }, () => null);
}

function hitFor(instrument: Instrument, velocity: number): Hit {
  const articulations: Hit["articulations"] = [];
  if (velocity <= 50) articulations.push("ghost");
  else if (velocity >= 110) articulations.push("accent");
  return {
    instrument,
    head: defaultHeadFor(instrument),
    articulations,
  };
}

function buildInstrumentLookup(): Map<number, Instrument> {
  const m = new Map<number, Instrument>();
  for (const [inst, note] of Object.entries(gmDrumMap) as Array<
    [Instrument, number]
  >) {
    if (!m.has(note)) m.set(note, inst);
  }
  return m;
}

function nearestInstrument(
  note: number,
  lookup: Map<number, Instrument>,
): Instrument | null {
  let best: { note: number; inst: Instrument } | null = null;
  for (const [known, inst] of lookup) {
    if (best === null || Math.abs(known - note) < Math.abs(best.note - note)) {
      best = { note: known, inst };
    }
  }
  return best ? best.inst : null;
}

function emptyScore(
  title: string,
  bpm: number,
  meter: { beats: number; beatUnit: number },
): Score {
  return {
    version: 1,
    title,
    tempo: { bpm, note: "quarter" },
    meter,
    sections: [{ label: "", bars: [] } satisfies Section],
  };
}

class Reader {
  pos = 0;
  private view: DataView;
  private decoder = new TextDecoder("utf-8");
  constructor(private bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }
  eof(): boolean {
    return this.pos >= this.bytes.length;
  }
  peek(): number {
    return this.bytes[this.pos];
  }
  readByte(): number {
    return this.bytes[this.pos++];
  }
  readUint16BE(): number {
    const v = this.view.getUint16(this.pos, false);
    this.pos += 2;
    return v;
  }
  readUint32BE(): number {
    const v = this.view.getUint32(this.pos, false);
    this.pos += 4;
    return v;
  }
  skip(n: number): void {
    this.pos += n;
  }
  seek(pos: number): void {
    this.pos = pos;
  }
  matchAscii(tag: string): boolean {
    for (let i = 0; i < tag.length; i += 1) {
      if (this.bytes[this.pos + i] !== tag.charCodeAt(i)) return false;
    }
    this.pos += tag.length;
    return true;
  }
  readVLQ(): number {
    let value = 0;
    while (!this.eof()) {
      const byte = this.readByte();
      value = (value << 7) | (byte & 0x7f);
      if ((byte & 0x80) === 0) return value;
    }
    throw new Error("VLQ truncated");
  }
  readString(len: number): string {
    const slice = this.bytes.subarray(this.pos, this.pos + len);
    this.pos += len;
    return this.decoder.decode(slice);
  }
}


