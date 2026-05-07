/*
 * Slim header-only parser for the build index. Only handles the meta keys
 * Drumit recognises; bar bodies are skipped. Behaviour MUST match
 * src/notation/parser.ts in the Drumit main repo for the keys it covers.
 */
const HEADER_RE = /^([a-zA-Z][\w-]*)\s*:\s*(.+)$/;
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

export interface ParsedMeta {
  title?: string;
  artist?: string;
  tempo?: number;
  meter?: string;
  slug?: string;
  composer?: string[];
  arranger?: string;
  transcriber?: string;
  album?: string;
  sourceUrl?: string;
  license?: string;
  difficulty?: number;
  style?: string[];
  techniques?: string[];
  changelog?: string;
}

function splitMulti(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function parseScoreMeta(source: string): ParsedMeta {
  const meta: ParsedMeta = {};
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  for (const rawLine of lines) {
    const line = stripComment(rawLine).trim();
    if (!line) continue;
    // Stop at first section marker: meta only lives in the file header.
    if (/^\[[^\]]+\]$/.test(line)) break;
    const m = line.match(HEADER_RE);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const value = m[2].trim();
    switch (key) {
      case "title":
        meta.title = value;
        break;
      case "artist":
        meta.artist = value;
        break;
      case "tempo": {
        const n = Number.parseInt(value, 10);
        if (Number.isFinite(n) && n > 0) meta.tempo = n;
        break;
      }
      case "meter":
        meta.meter = value.replace(/\s+/g, "");
        break;
      case "slug":
        if (SLUG_RE.test(value)) meta.slug = value;
        break;
      case "composer": {
        const parts = splitMulti(value);
        if (parts.length > 0)
          meta.composer = [...(meta.composer ?? []), ...parts];
        break;
      }
      case "arranger":
        meta.arranger = value;
        break;
      case "transcriber":
        meta.transcriber = value;
        break;
      case "album":
        meta.album = value;
        break;
      case "source":
        meta.sourceUrl = value;
        break;
      case "license":
        meta.license = value;
        break;
      case "difficulty": {
        const n = Number.parseInt(value, 10);
        if (Number.isFinite(n) && n >= 1 && n <= 5) meta.difficulty = n;
        break;
      }
      case "style": {
        const parts = splitMulti(value);
        if (parts.length > 0) meta.style = [...(meta.style ?? []), ...parts];
        break;
      }
      case "techniques": {
        const parts = splitMulti(value);
        if (parts.length > 0)
          meta.techniques = [...(meta.techniques ?? []), ...parts];
        break;
      }
      case "changelog":
        meta.changelog = value;
        break;
      default:
        // Unknown header: ignored quietly (the canonical parser warns;
        // for index-building we don't need that signal).
        break;
    }
  }
  return meta;
}

function stripComment(line: string): string {
  return line.replace(/\s+#.*$/, "").replace(/^#.*/, "");
}
