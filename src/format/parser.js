const HEADER_RE = /^([a-zA-Z][\w-]*)\s*:\s*(.+)$/;
const SECTION_RE = /^\[([^\]]+)\]$/;
const BAR_RE = /^\|(.+)\|\s*(.*)$/;

const INSTRUMENT_ALIASES = new Map([
  ["bd", "kick"],
  ["kick", "kick"],
  ["bass", "kick"],
  ["sn", "snare"],
  ["snare", "snare"],
  ["hh", "hihatClosed"],
  ["hho", "hihatOpen"],
  ["hhh", "hihatHalfOpen"],
  ["ride", "ride"],
  ["rd", "ride"],
  ["crash", "crash"],
  ["cr", "crash"],
  ["tom1", "tomHigh"],
  ["t1", "tomHigh"],
  ["tom2", "tomMid"],
  ["t2", "tomMid"],
  ["ft", "floorTom"],
  ["floor", "floorTom"],
]);

export const laneAliases = Object.freeze(Object.fromEntries(INSTRUMENT_ALIASES));

export function parseDrumtab(source) {
  const diagnostics = [];
  const score = {
    version: 1,
    title: "Untitled Drum Chart",
    artist: "",
    tempo: null,
    meter: { beats: 4, beatUnit: 4 },
    sections: [],
  };

  let currentSection = null;
  const lines = source.replace(/\r\n?/g, "\n").split("\n");

  lines.forEach((rawLine, index) => {
    const lineNumber = index + 1;
    const line = stripComment(rawLine).trim();
    if (!line) return;

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
      currentSection.bars.push(parseBar(bar[1].trim(), bar[2].trim(), lineNumber, diagnostics));
      return;
    }

    diagnostics.push(error(lineNumber, `Unrecognized line: ${line}`));
  });

  if (score.sections.length === 0) {
    diagnostics.push(error(1, "Add at least one section, for example [A]."));
  }

  return { score, diagnostics };
}

function applyHeader(score, key, value, lineNumber, diagnostics) {
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

function parseMeter(value) {
  const match = value.trim().match(/^(\d+)\s*\/\s*(\d+)$/);
  if (!match) return null;
  const beats = Number.parseInt(match[1], 10);
  const beatUnit = Number.parseInt(match[2], 10);
  if (!beats || !beatUnit) return null;
  return { beats, beatUnit };
}

function parseBar(body, suffix, lineNumber, diagnostics) {
  const repeatCount = parseRepeatCount(suffix);
  const bar = {
    repeat: null,
    repeatCount,
    ending: parseEnding(suffix),
    lanes: [],
    cells: [],
    annotations: [],
    source: body,
  };

  if (/^(repeat previous|%)$/i.test(body.trim())) {
    bar.repeat = { kind: "previous", count: repeatCount };
    return bar;
  }

  const laneMatches = [...body.matchAll(/([a-zA-Z][\w-]*)\s*:/g)];
  if (laneMatches.length === 0) {
    diagnostics.push(error(lineNumber, "Bar must contain at least one instrument lane, like hh:x x x x."));
    return bar;
  }

  laneMatches.forEach((match, index) => {
    const alias = match[1].toLowerCase();
    const instrument = INSTRUMENT_ALIASES.get(alias);
    const start = match.index + match[0].length;
    const end = index + 1 < laneMatches.length ? laneMatches[index + 1].index : body.length;
    const rawTokens = body.slice(start, end).trim();
    const tokens = rawTokens ? rawTokens.split(/\s+/) : [];

    if (!instrument) {
      diagnostics.push(error(lineNumber, `Unknown instrument '${alias}'.`));
      return;
    }

    bar.lanes.push({ alias, instrument, tokens });
  });

  const maxSlots = Math.max(0, ...bar.lanes.map((lane) => lane.tokens.length));
  bar.lanes.forEach((lane) => {
    if (lane.tokens.length !== maxSlots) {
      diagnostics.push(warn(lineNumber, `${lane.alias} has ${lane.tokens.length} slots; expected ${maxSlots}. Missing slots are treated as rests.`));
    }
  });

  bar.cells = Array.from({ length: maxSlots }, (_, slotIndex) => ({
    slot: String(slotIndex + 1),
    hits: bar.lanes.flatMap((lane) => parseToken(lane.tokens[slotIndex] ?? "-", lane.instrument, lineNumber, diagnostics)),
  }));

  return bar;
}

function parseToken(token, instrument, lineNumber, diagnostics) {
  if (!token || token === "-" || token === ".") return [];
  const articulations = [];
  let value = token;
  let sticking = null;

  const stickingMatch = value.match(/\/(R|L)$/i);
  if (stickingMatch) {
    sticking = stickingMatch[1].toUpperCase();
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

  if (!/[xo]/i.test(value)) {
    diagnostics.push(warn(lineNumber, `Token '${token}' is treated as a hit but uses an uncommon head.`));
  }

  return [{ instrument, head: /x/i.test(value) ? "x" : "o", articulations, sticking }];
}

function parseRepeatCount(suffix) {
  const match = suffix.match(/x\s*(\d+)/i) || suffix.match(/(\d+)\s*x/i);
  return match ? Number.parseInt(match[1], 10) : 1;
}

function parseEnding(suffix) {
  const match = suffix.match(/ending\s*([12])/i) || suffix.match(/\[([12])\]/);
  return match ? match[1] : null;
}

function stripComment(line) {
  return line.replace(/\s+#.*$/, "");
}

function error(line, message) {
  return { level: "error", line, message };
}

function warn(line, message) {
  return { level: "warning", line, message };
}
