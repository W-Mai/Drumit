import { parseDrumtab } from "../notation/parser";
import { renderScoreToSvg } from "../notation/exporters/svg";

const STORAGE_KEY = "drumit.thumbCache.v1";
const MAX_BYTES = 2_000_000;

interface CacheEntry {
  hash: string;
  width: number;
  svg: string;
}

type CacheMap = Record<string, CacheEntry>;

function hash(s: string): string {
  // djb2 — non-cryptographic, collision-ok for our invalidation use.
  let h = 5381;
  for (let i = 0; i < s.length; i += 1) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return h.toString(36);
}

const memory: CacheMap = loadFromStorage();

function loadFromStorage(): CacheMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as CacheMap;
    return parsed ?? {};
  } catch {
    return {};
  }
}

let writeTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleWrite() {
  if (typeof window === "undefined") return;
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    try {
      let serialized = JSON.stringify(memory);
      // LRU-ish eviction: drop oldest-inserted keys until we fit.
      while (serialized.length > MAX_BYTES) {
        const keys = Object.keys(memory);
        if (keys.length === 0) break;
        delete memory[keys[0]];
        serialized = JSON.stringify(memory);
      }
      window.localStorage.setItem(STORAGE_KEY, serialized);
    } catch {
      // storage full or disabled: fall back to memory-only
    }
  }, 200);
}

export function getThumbnail(
  docId: string,
  source: string,
  width: number,
): string | null {
  const entry = memory[docId];
  if (!entry) return null;
  if (entry.hash !== hash(source) || entry.width !== width) return null;
  return entry.svg;
}

export async function generateThumbnail(
  docId: string,
  source: string,
  width: number,
): Promise<string | null> {
  const { score, diagnostics } = parseDrumtab(source);
  if (diagnostics.some((d) => d.level === "error")) return null;
  try {
    const svg = await renderScoreToSvg(score, { width, showLabels: false });
    memory[docId] = { hash: hash(source), width, svg };
    // Keep recently-touched keys at the end of insertion order for the
    // LRU eviction above: delete then re-insert.
    const entry = memory[docId];
    delete memory[docId];
    memory[docId] = entry;
    scheduleWrite();
    return svg;
  } catch {
    return null;
  }
}

export function dropThumbnail(docId: string) {
  if (docId in memory) {
    delete memory[docId];
    scheduleWrite();
  }
}
