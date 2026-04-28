import {
  defaultHeadFor,
  instrumentAliases,
} from "./instruments";
import type {
  Articulation,
  Bar,
  Beat,
  Diagnostic,
  Hit,
  Instrument,
  LaneBeat,
  ParseResult,
  Score,
  Section,
} from "./types";

const HEADER_RE = /^([a-zA-Z][\w-]*)\s*:\s*(.+)$/;
const SECTION_RE = /^\[([^\]]+)\]$/;
const BAR_RE = /^\|(.+)\|\s*(.*)$/;

export function parseDrumtab(source: string): ParseResult {
  const diagnostics: Diagnostic[] = [];
  const score: Score = {
    version: 1,
    title: "Untitled",
    artist: undefined,
    tempo: undefined,
    meter: { beats: 4, beatUnit: 4 },
    sections: [],
  };

  let currentSection: Section | null = null;
  const lines = source.replace(/\r\n?/g, "\n").split("\n");

  lines.forEach((rawLine, index) => {
    const line = stripComment(rawLine).trim();
    if (!line) return;
    const lineNumber = index + 1;

    const header = line.match(HEADER_RE);
    if (header && !currentSection) {
      applyHeader(score, header[1], header[2], lineNumber, diagnostics);
      return;
    }

    const section = line.match(SECTION_RE);
    if (section) {
      currentSection = { label: section[1].trim(), bars: [] };
      score.sections.push(currentSection);
      return;
    }

    const bar = line.match(BAR_RE);
    if (bar) {
      if (!currentSection) {
        currentSection = { label: "Main", bars: [] };
        score.sections.push(currentSection);
      }
      currentSection.bars.push(
        parseBar(bar[1].trim(), bar[2].trim(), score.meter.beats, lineNumber, diagnostics),
      );
      return;
    }

    diagnostics.push(error(lineNumber, `Unrecognized line: ${line}`));
  });

  if (score.sections.length === 0) {
    diagnostics.push(error(1, "Add at least one section like [A]."));
  }

  return { score, diagnostics };
}

function applyHeader(
  score: Score,
  key: string,
  value: string,
  lineNumber: number,
  diagnostics: Diagnostic[],
): void {
  const normalized = key.toLowerCase();
  if (normalized === "title") {
    score.title = value.trim();
    return;
  }
  if (normalized === "artist") {
    score.artist = value.trim();
    return;
  }
  if (normalized === "tempo") {
    const bpm = Number.parseInt(value, 10);
    if (Number.isFinite(bpm) && bpm > 0) {
      score.tempo = { bpm, note: "quarter" };
    } else {
      diagnostics.push(error(lineNumber, "Tempo must be a positive number."));
    }
    return;
  }
  if (normalized === "meter") {
    const meter = parseMeter(value);
    if (meter) {
      score.meter = meter;
    } else {
      diagnostics.push(error(lineNumber, "Meter must look like 4/4 or 2/4."));
    }
    return;
  }
  diagnostics.push(warn(lineNumber, `Unknown header '${key}' ignored.`));
}

function parseMeter(
  value: string,
): { beats: number; beatUnit: number } | null {
  const match = value.trim().match(/^(\d+)\s*\/\s*(\d+)$/);
  if (!match) return null;
  const beats = Number.parseInt(match[1], 10);
  const beatUnit = Number.parseInt(match[2], 10);
  if (!beats || !beatUnit) return null;
  return { beats, beatUnit };
}

function parseBar(
  body: string,
  suffix: string,
  expectedBeats: number,
  lineNumber: number,
  diagnostics: Diagnostic[],
): Bar {
  const repeatCount = parseRepeatCount(suffix);
  const bar: Bar = {
    beats: [],
    repeatCount,
    repeatPrevious: false,
    ending: parseEnding(suffix) ?? undefined,
    meter: undefined,
    source: body,
  };

  if (/^(repeat previous|%)$/i.test(body.trim())) {
    bar.repeatPrevious = true;
    return bar;
  }

  // Support inline per-bar meter override: "meter: 2/4 | hh: ..."
  let effectiveBody = body;
  const meterMatch = body.match(/^\s*meter\s*:\s*(\d+\s*\/\s*\d+)\s*\|?\s*(.*)$/i);
  if (meterMatch) {
    const m = parseMeter(meterMatch[1].replace(/\s/g, ""));
    if (m) {
      bar.meter = m;
      expectedBeats = m.beats;
    } else {
      diagnostics.push(warn(lineNumber, `Invalid inline meter '${meterMatch[1]}'.`));
    }
    effectiveBody = meterMatch[2].trim();
  }

  const laneMatches = [...effectiveBody.matchAll(/([a-zA-Z][\w-]*)\s*:/g)];
  if (laneMatches.length === 0) {
    diagnostics.push(
      error(lineNumber, "Bar must contain at least one lane, like hh: x x x x."),
    );
    return bar;
  }

  const lanes: Array<{ instrument: Instrument; beats: string[] }> = [];

  laneMatches.forEach((match, index) => {
    const alias = match[1].toLowerCase();
    if (alias === "meter") return; // skip inline meter directives
    const instrument = instrumentAliases[alias];
    const start = match.index! + match[0].length;
    const end =
      index + 1 < laneMatches.length ? laneMatches[index + 1].index! : effectiveBody.length;
    const raw = effectiveBody.slice(start, end).trim();

    if (!instrument) {
      diagnostics.push(error(lineNumber, `Unknown instrument '${alias}'.`));
      return;
    }

    lanes.push({ instrument, beats: splitBeats(raw) });
  });

  if (lanes.length === 0) {
    return bar;
  }

  const beatCount = Math.max(...lanes.map((lane) => lane.beats.length));
  if (beatCount !== expectedBeats) {
    diagnostics.push(
      warn(
        lineNumber,
        `Expected ${expectedBeats} beats per bar, got ${beatCount}.`,
      ),
    );
  }

  const beats: Beat[] = [];
  for (let beatIndex = 0; beatIndex < beatCount; beatIndex += 1) {
    beats.push(buildBeat(lanes, beatIndex, lineNumber, diagnostics));
  }

  bar.beats = beats;
  return bar;
}

function splitBeats(raw: string): string[] {
  if (!raw) return [];
  return raw
    .split(/\s*\/\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function buildBeat(
  lanes: Array<{ instrument: Instrument; beats: string[] }>,
  beatIndex: number,
  lineNumber: number,
  diagnostics: Diagnostic[],
): Beat {
  const beatTuplets = new Set<number>();
  const laneBeats: LaneBeat[] = [];

  lanes.forEach((lane) => {
    const beatBody = lane.beats[beatIndex] ?? "";
    const { tuplet: explicitTuplet, body } = extractTuplet(beatBody);
    if (explicitTuplet) beatTuplets.add(explicitTuplet);
    const tokens = tokenizeBeat(body);
    if (tokens.length === 0) return;

    const slots = tokens.map((token) =>
      parseToken(token, lane.instrument, lineNumber, diagnostics),
    );

    // Auto-detect triplet / tuplet divisions for standalone lanes. If the user
    // didn't write (3) but the token count is 3/6/5/7 we mark it as tuplet so
    // the renderer draws the bracket and lane keeps its own even spacing.
    const division = slots.length;
    const autoTuplet = detectTuplet(division, explicitTuplet);

    laneBeats.push({
      instrument: lane.instrument,
      division,
      tuplet: autoTuplet,
      slots,
    });
  });

  const tuplet = beatTuplets.size === 1 ? [...beatTuplets][0] : undefined;
  if (beatTuplets.size > 1) {
    diagnostics.push(
      warn(
        lineNumber,
        `Beat ${beatIndex + 1} has inconsistent tuplet markers across lanes; using none at beat level.`,
      ),
    );
  }

  return { lanes: laneBeats, tuplet };
}

function detectTuplet(division: number, explicit?: number): number | undefined {
  if (explicit) return explicit;
  // Even subdivisions (2/4/8/16) are not tuplets.
  if (division === 3 || division === 6 || division === 5 || division === 7) {
    return division === 6 ? 6 : division;
  }
  return undefined;
}

/** Extract a leading `(3)` / `(5)` etc. tuplet marker, returning the remaining body. */
function extractTuplet(raw: string): { tuplet?: number; body: string } {
  const match = raw.match(/^\s*\((\d+)\)\s*(.*)$/);
  if (!match) return { body: raw };
  const n = Number.parseInt(match[1], 10);
  if (!Number.isFinite(n) || n < 2 || n > 15) return { body: raw };
  return { tuplet: n, body: match[2] };
}

function tokenizeBeat(raw: string): string[] {
  if (!raw) return [];
  // Allow both whitespace-separated and packed forms ("xxxx" or "x x x x").
  if (/\s/.test(raw.trim())) {
    return raw.trim().split(/\s+/);
  }
  // Packed form: split by characters while keeping modifiers together.
  const tokens: string[] = [];
  let i = 0;
  while (i < raw.length) {
    const c = raw[i];
    if (c === "-" || c === ".") {
      tokens.push(c);
      i += 1;
      continue;
    }
    if (c === "(") {
      const close = raw.indexOf(")", i);
      if (close === -1) {
        tokens.push(raw.slice(i));
        break;
      }
      tokens.push(raw.slice(i, close + 1));
      i = close + 1;
      continue;
    }
    let j = i;
    if (">~f".includes(c)) j += 1;
    j += 1;
    tokens.push(raw.slice(i, j));
    i = j;
  }
  return tokens.filter(Boolean);
}

function parseToken(
  token: string,
  instrument: Instrument,
  lineNumber: number,
  diagnostics: Diagnostic[],
): Hit | null {
  if (!token || token === "-" || token === ".") return null;
  let value = token;
  const articulations: Articulation[] = [];
  let sticking: "R" | "L" | undefined;

  const stickingMatch = value.match(/\/(R|L)$/i);
  if (stickingMatch) {
    sticking = stickingMatch[1].toUpperCase() as "R" | "L";
    value = value.slice(0, -2);
  }

  while (/^[>~f]/i.test(value)) {
    const marker = value[0].toLowerCase();
    if (marker === ">") articulations.push("accent");
    if (marker === "~") articulations.push("roll");
    if (marker === "f") articulations.push("flam");
    value = value.slice(1);
  }
  if (/^\(.+\)$/.test(value)) {
    articulations.push("ghost");
    value = value.slice(1, -1);
  }
  if (/!$/.test(value)) {
    articulations.push("choke");
    value = value.slice(0, -1);
  }

  if (!value) {
    diagnostics.push(
      warn(lineNumber, `Token '${token}' has modifiers but no note head.`),
    );
    return null;
  }

  // Standalone sticking markers: `R` / `L` act as the note head itself.
  if (/^[rl]$/i.test(value)) {
    return {
      instrument,
      head: defaultHeadFor(instrument),
      articulations,
      sticking: value.toUpperCase() as "R" | "L",
    };
  }

  return {
    instrument,
    head: defaultHeadFor(instrument),
    articulations,
    sticking,
  };
}

function parseRepeatCount(suffix: string): number {
  const match =
    suffix.match(/x\s*(\d+)/i) || suffix.match(/(\d+)\s*x/i);
  return match ? Number.parseInt(match[1], 10) : 1;
}

function parseEnding(suffix: string): "1" | "2" | null {
  const match = suffix.match(/ending\s*([12])/i) || suffix.match(/\[([12])\]/);
  return match ? ((match[1] as "1" | "2")) : null;
}

function stripComment(line: string): string {
  return line.replace(/\s+#.*$/, "").replace(/^#.*/, "");
}

function error(line: number, message: string): Diagnostic {
  return { level: "error", line, message };
}

function warn(line: number, message: string): Diagnostic {
  return { level: "warning", line, message };
}
