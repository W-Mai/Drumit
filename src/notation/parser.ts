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
  LaneGroup,
  ParseResult,
  Score,
  Section,
} from "./types";

const HEADER_RE = /^([a-zA-Z][\w-]*)\s*:\s*(.+)$/;
const SECTION_RE = /^\[([^\]]+)\]$/;
/**
 * A bar line. Start barline may be `|` (normal) or `|:` (repeat-start).
 * End barline may be `|` (normal) or `:|` (repeat-end). After the closing
 * barline, an optional suffix carries `x3` / `[1]` / repeat-end counts.
 *
 * Anchored at end: `(:?\|)\s*(.*)$` matches the LAST `:|` / `|` in the line,
 * so inline `| meter: 2/4 | ...` still works and the closing `:|` isn't
 * accidentally swallowed by the body.
 */
const BAR_RE = /^(\|:?)([\s\S]*?)(:?\|)\s*([^|]*)$/;
/**
 * Navigation directives that stand alone on their own line and attach
 * to the most recently seen bar. Example: `@coda`, `@segno`, `@fine`,
 * `@to-coda`, `@dc`, `@dc al fine`, `@ds al coda`.
 */
const NAV_RE = /^@\s*(segno|coda|to-coda|fine|dc|ds)(?:\s+al\s+(fine|coda))?\s*$/i;

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

    const navMatch = line.match(NAV_RE);
    if (navMatch) {
      if (!currentSection || currentSection.bars.length === 0) {
        diagnostics.push(
          warn(lineNumber, `Navigation marker '${navMatch[0]}' needs a preceding bar.`),
        );
        return;
      }
      const kind = navMatch[1].toLowerCase();
      const target = navMatch[2]?.toLowerCase();
      const lastBar = currentSection.bars[currentSection.bars.length - 1];
      lastBar.navigation = buildNavigation(kind, target);
      return;
    }

    const bar = line.match(BAR_RE);
    if (bar) {
      if (!currentSection) {
        currentSection = { label: "Main", bars: [] };
        score.sections.push(currentSection);
      }
      const [, openMark, body, closeMark, suffix] = bar;
      currentSection.bars.push(
        parseBar(
          body.trim(),
          suffix.trim(),
          openMark === "|:",
          closeMark === ":|",
          score.meter.beats,
          lineNumber,
          diagnostics,
        ),
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
  repeatStart: boolean,
  repeatEndMark: boolean,
  expectedBeats: number,
  lineNumber: number,
  diagnostics: Diagnostic[],
): Bar {
  // `x3` in the suffix either means "repeat this single bar 3 times" (no
  // `:|` barline) or "play the repeat section a total of 3 times" (with
  // a `:|` closing bar). Same number, different field.
  const xCount = parseRepeatCount(suffix);
  const bar: Bar = {
    beats: [],
    repeatCount: repeatEndMark ? 1 : xCount,
    repeatPrevious: false,
    ending: parseEnding(suffix) ?? undefined,
    repeatStart: repeatStart || undefined,
    repeatEnd: repeatEndMark ? { times: Math.max(2, xCount) } : undefined,
    meter: undefined,
    source: body,
  };

  const repeatMatch = body.trim().match(/^(repeat previous|%(\.|-|,)?)$/i);
  if (repeatMatch) {
    bar.repeatPrevious = true;
    const suffixChar = repeatMatch[2];
    bar.repeatHint = suffixChar
      ? suffixChar === "."
        ? "dot"
        : suffixChar === "-"
          ? "dash"
          : "comma"
      : "plain";
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
    // Truly empty bar body (`|  |`) is a valid silent bar — seed it
    // with `expectedBeats` beats of silence so downstream layout and
    // playback iterate a proper meter-sized structure. Gibberish still
    // errors because the user obviously meant *something*.
    if (effectiveBody.trim() === "") {
      bar.beats = Array.from({ length: expectedBeats }, () => ({ lanes: [] }));
      return bar;
    }
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
  // A beat separator `/` must have whitespace on at least one side. The
  // bare `/` inside `o/R` is a sticking suffix, not a beat break.
  return raw
    .split(/(?:\s+\/\s*|\s*\/\s+)/)
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
    const groupBodies = splitGroupBodies(beatBody);
    if (groupBodies.length === 0) return;

    // Single group → keep the original flat shape for backwards compat.
    if (groupBodies.length === 1) {
      const { tuplet: explicitTuplet, body } = extractTuplet(groupBodies[0]);
      if (explicitTuplet) beatTuplets.add(explicitTuplet);
      const tokens = tokenizeBeat(body);
      if (tokens.length === 0) return;
      const slots = tokens.map((token) =>
        parseToken(token, lane.instrument, lineNumber, diagnostics),
      );
      const division = slots.length;
      const autoTuplet = detectTuplet(division, explicitTuplet);
      const dotted = maybeExpandDotted(slots);
      if (dotted) {
        if (dotted.overflow) {
          diagnostics.push(
            warn(
              lineNumber,
              `Dotted notes exceed one beat; durations normalised to fit.`,
            ),
          );
        }
        laneBeats.push({
          instrument: lane.instrument,
          division: dotted.groups[0].division,
          tuplet: dotted.groups[0].tuplet,
          slots: dotted.groups[0].slots,
          groups: dotted.groups,
        });
        return;
      }
      laneBeats.push({
        instrument: lane.instrument,
        division,
        tuplet: autoTuplet,
        slots,
      });
      return;
    }

    // Multiple groups → emit a lane with groups[] (equal ratio per outer group).
    const outerRatio = 1 / groupBodies.length;
    const groups = groupBodies
      .flatMap((body) => {
        const { tuplet: explicitTuplet, body: inner } = extractTuplet(body);
        if (explicitTuplet) beatTuplets.add(explicitTuplet);
        const tokens = tokenizeBeat(inner);
        if (tokens.length === 0) return [];
        const slots = tokens.map((token) =>
          parseToken(token, lane.instrument, lineNumber, diagnostics),
        );
        const division = slots.length;
        const expanded = maybeExpandDotted(slots);
        if (expanded) {
          if (expanded.overflow) {
            diagnostics.push(
              warn(
                lineNumber,
                `Dotted notes exceed the group's time; durations normalised to fit.`,
              ),
            );
          }
          return expanded.groups.map((g) => ({
            ...g,
            ratio: g.ratio * outerRatio,
          }));
        }
        return [
          {
            ratio: outerRatio,
            division,
            tuplet: detectTuplet(division, explicitTuplet),
            slots,
          },
        ];
      })
      .filter((g): g is NonNullable<typeof g> => g !== null);

    if (groups.length === 0) return;
    // Outer division/slots are derived from the first group so simple
    // consumers that don't understand groups still see sensible data.
    laneBeats.push({
      instrument: lane.instrument,
      division: groups[0].division,
      tuplet: groups[0].tuplet,
      slots: groups[0].slots,
      groups,
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

/**
 * Split a single beat body by `,` into per-group bodies. A group body is
 * trimmed and empty groups are preserved as single-rest groups so the user
 * can write `o,` to mean "first-half hit + rest second-half".
 */
function splitGroupBodies(raw: string): string[] {
  if (!raw.trim()) return [];
  if (!raw.includes(",")) return [raw.trim()];
  return raw.split(",").map((part) => {
    const trimmed = part.trim();
    return trimmed === "" ? "-" : trimmed;
  });
}

/** Extract a leading `(3)` / `(5)` etc. tuplet marker, returning the remaining body. */
function extractTuplet(raw: string): { tuplet?: number; body: string } {
  const match = raw.match(/^\s*\((\d+)\)\s*(.*)$/);
  if (!match) return { body: raw };
  const n = Number.parseInt(match[1], 10);
  if (!Number.isFinite(n) || n < 2 || n > 15) return { body: raw };
  return { tuplet: n, body: match[2] };
}

/**
 * Dotted slots use a fixed nominal duration (o. = dotted eighth =
 * 3/4 beat, o.. = 7/8). Undotted slots share whatever beat-time is
 * left, evenly. Overflow (too many dots) falls back to proportional
 * normalisation and flags `overflow`.
 */
export function maybeExpandDotted(
  slots: Array<Hit | null>,
):
  | { groups: LaneGroup[]; overflow: boolean }
  | null {
  const dots = slots.map((s) => s?.dots ?? 0);
  if (dots.every((d) => d === 0)) return null;
  const N = slots.length;
  const nominalDotted = dots.map((d) =>
    d === 0 ? 0 : 0.5 * (2 - Math.pow(0.5, d)),
  );
  const dottedSum = nominalDotted.reduce((a, b) => a + b, 0);
  const undottedCount = dots.filter((d) => d === 0).length;
  const remaining = 1 - dottedSum;
  const overflow = remaining <= 0;
  let ratios: number[];
  if (overflow) {
    const perUndotted = 1 / N;
    const scaleNominal = dots.map((d) =>
      d === 0 ? perUndotted : 0.5 * (2 - Math.pow(0.5, d)),
    );
    const total = scaleNominal.reduce((a, b) => a + b, 0);
    ratios = scaleNominal.map((v) => v / total);
  } else {
    const perUndotted = undottedCount > 0 ? remaining / undottedCount : 0;
    ratios = dots.map((d, i) => (d === 0 ? perUndotted : nominalDotted[i]));
  }
  const groups = slots.map((slot, idx) => ({
    ratio: ratios[idx],
    division: 1,
    slots: [slot],
  }));
  return { groups, overflow };
}

function tokenizeBeat(raw: string): string[] {
  if (!raw) return [];
  const attachDots = (tokens: string[]): string[] => {
    // Move `.` / `..` that immediately follow a hit token onto that token
    // (it's an augmentation dot, not a standalone slot).
    const out: string[] = [];
    for (const t of tokens) {
      if ((t === "." || t === "..") && out.length > 0) {
        const last = out[out.length - 1];
        if (last !== "-" && !/\.$/.test(last)) {
          out[out.length - 1] = last + t;
          continue;
        }
      }
      out.push(t);
    }
    return out;
  };

  // Whitespace-separated form is the simplest: one token per chunk.
  if (/\s/.test(raw.trim())) {
    return attachDots(raw.trim().split(/\s+/));
  }
  // Packed form: each token is `[modifiers] head [dots] [suffix]` where
  //   modifiers ∈ { >, ~, f } (may stack)
  //   head ∈ { o, x } or a parenthesized ghost `(...)`
  //   dots ∈ { ., .. }
  //   suffix ∈ { ! (choke), /R, /L (sticking) }
  const tokens: string[] = [];
  let i = 0;
  while (i < raw.length) {
    const c = raw[i];
    if (c === "-") {
      tokens.push(c);
      i += 1;
      continue;
    }
    if (c === ".") {
      // Attach to previous hit token when possible; otherwise treat as
      // a rest (legacy).
      const last = tokens[tokens.length - 1];
      if (last && last !== "-" && !/\.$/.test(last)) {
        tokens[tokens.length - 1] = last + ".";
      } else {
        tokens.push(".");
      }
      i += 1;
      continue;
    }
    let j = i;
    // Prefix modifiers
    while (j < raw.length && ">~f".includes(raw[j])) j += 1;
    // Head: either a parenthesized ghost or a single character
    if (raw[j] === "(") {
      const close = raw.indexOf(")", j);
      if (close === -1) {
        tokens.push(raw.slice(i));
        break;
      }
      j = close + 1;
    } else if (j < raw.length) {
      j += 1;
    }
    // Augmentation dots (up to 2).
    let dotCount = 0;
    while (j < raw.length && raw[j] === "." && dotCount < 2) {
      j += 1;
      dotCount += 1;
    }
    // Suffix: choke `!`
    if (raw[j] === "!") j += 1;
    // Suffix: sticking `/R` or `/L`
    if (raw[j] === "/" && /[rl]/i.test(raw[j + 1] ?? "")) j += 2;
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

  let dots = 0;
  while (value.endsWith(".") && dots < 2) {
    dots += 1;
    value = value.slice(0, -1);
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

  if (value === "0") {
    return {
      instrument,
      head: "rest",
      articulations,
      ...(dots > 0 ? { dots } : {}),
    };
  }

  // Standalone sticking markers: `R` / `L` act as the note head itself.
  if (/^[rl]$/i.test(value)) {
    return {
      instrument,
      head: defaultHeadFor(instrument),
      articulations,
      sticking: value.toUpperCase() as "R" | "L",
      ...(dots > 0 ? { dots } : {}),
    };
  }

  return {
    instrument,
    head: defaultHeadFor(instrument),
    articulations,
    sticking,
    ...(dots > 0 ? { dots } : {}),
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

function buildNavigation(
  kind: string,
  target?: string,
): import("./types").NavigationMarker | undefined {
  switch (kind) {
    case "segno":
      return { kind: "segno" };
    case "coda":
      return { kind: "coda" };
    case "to-coda":
      return { kind: "toCoda" };
    case "fine":
      return { kind: "fine" };
    case "dc":
      return {
        kind: "dc",
        target: target === "fine" || target === "coda" ? target : undefined,
      };
    case "ds":
      return {
        kind: "ds",
        target: target === "fine" || target === "coda" ? target : undefined,
      };
  }
  return undefined;
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
