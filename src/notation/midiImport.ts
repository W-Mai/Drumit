import type { Score } from "./types";
import { parseDrumtab } from "./parser";
import { DRUMIT_META_PREFIX } from "./midiExport";

export interface ImportResult {
  score: Score;
  source: "embedded" | "inferred";
  warnings: string[];
}

export function importScoreFromMidi(bytes: Uint8Array): ImportResult {
  const r = new Reader(bytes);
  if (!r.matchAscii("MThd")) throw new Error("Not an SMF: missing MThd");
  const headerLen = r.readUint32BE();
  if (headerLen < 6) throw new Error("SMF header too short");
  r.skip(headerLen);
  const warnings: string[] = [];
  while (!r.eof()) {
    if (!r.matchAscii("MTrk")) {
      const len = r.readUint32BE();
      r.skip(len);
      continue;
    }
    const trackLen = r.readUint32BE();
    const trackEnd = r.pos + trackLen;
    let runningStatus = 0;
    while (r.pos < trackEnd) {
      r.readVLQ(); // delta ignored on the embedded-source path
      let status = r.peek();
      if (status < 0x80) status = runningStatus;
      else r.readByte();
      if (status === 0xff) {
        const metaType = r.readByte();
        const len = r.readVLQ();
        if (metaType === 0x01) {
          const text = r.readString(len);
          if (text.startsWith(DRUMIT_META_PREFIX)) {
            const source = text.slice(DRUMIT_META_PREFIX.length);
            const { score, diagnostics } = parseDrumtab(source);
            for (const d of diagnostics) {
              if (d.level === "warning") warnings.push(d.message);
            }
            return { score, source: "embedded", warnings };
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
        if (
          family === 0x80 ||
          family === 0x90 ||
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
  throw new Error(
    "MIDI import without drumit metadata is not yet supported",
  );
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
