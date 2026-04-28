import { canonicalAlias } from "./instruments";
import type {
  Bar,
  Beat,
  Hit,
  LaneBeat,
  RepeatHint,
  Score,
} from "./types";

export function serializeScore(score: Score): string {
  const lines: string[] = [];

  lines.push(`title: ${score.title}`);
  if (score.artist) lines.push(`artist: ${score.artist}`);
  if (score.tempo) lines.push(`tempo: ${score.tempo.bpm}`);
  lines.push(`meter: ${score.meter.beats}/${score.meter.beatUnit}`);
  lines.push("");

  score.sections.forEach((section, sectionIndex) => {
    if (sectionIndex > 0) lines.push("");
    lines.push(`[${section.label}]`);
    section.bars.forEach((bar) => {
      lines.push(serializeBar(bar));
    });
  });

  return lines.join("\n") + "\n";
}

export function serializeBar(bar: Bar): string {
  const suffix = barSuffix(bar);

  if (bar.repeatPrevious) {
    return `| ${repeatSymbol(bar.repeatHint)} |${suffix}`;
  }

  let body = "";

  if (bar.meter) {
    body = `meter: ${bar.meter.beats}/${bar.meter.beatUnit} | `;
  }

  const lanes = collectLaneOrder(bar);
  const laneStrings = lanes.map((instrument) => {
    const beats = bar.beats.map((beat) => serializeBeatLane(beat, instrument));
    return `${canonicalAlias[instrument]}: ${beats.join(" / ")}`;
  });

  body += laneStrings.join("  ");
  return `| ${body} |${suffix}`;
}

function barSuffix(bar: Bar): string {
  const parts: string[] = [];
  if (bar.repeatCount > 1) parts.push(` x${bar.repeatCount}`);
  if (bar.ending) parts.push(` [${bar.ending}]`);
  return parts.join("");
}

function repeatSymbol(hint?: RepeatHint): string {
  switch (hint) {
    case "dot":
      return "%.";
    case "dash":
      return "%-";
    case "comma":
      return "%,";
    default:
      return "%";
  }
}

/** Preserve the order of instruments as they first appear in the bar. */
function collectLaneOrder(bar: Bar): import("./types").Instrument[] {
  const seen = new Set<string>();
  const order: import("./types").Instrument[] = [];
  bar.beats.forEach((beat) => {
    beat.lanes.forEach((lane) => {
      if (!seen.has(lane.instrument)) {
        seen.add(lane.instrument);
        order.push(lane.instrument);
      }
    });
  });
  return order;
}

function serializeBeatLane(
  beat: Beat,
  instrument: import("./types").Instrument,
): string {
  const lane = beat.lanes.find((l) => l.instrument === instrument);
  if (!lane) return "-";
  const tokens = lane.slots.map(slotToken).join(
    lane.division > 4 || lane.tuplet ? " " : "",
  );
  const prefix =
    lane.tuplet && lane.tuplet !== lane.division ? `(${lane.tuplet})` : "";
  return prefix + tokens;
}

function slotToken(hit: Hit | null): string {
  if (!hit) return "-";
  let base = headToken(hit);
  for (const art of hit.articulations) {
    if (art === "accent") base = ">" + base;
    else if (art === "roll") base = "~" + base;
    else if (art === "flam") base = "f" + base;
    else if (art === "ghost") base = `(${base})`;
    else if (art === "choke") base += "!";
  }
  if (hit.sticking) base += "/" + hit.sticking;
  return base;
}

function headToken(hit: Hit): string {
  // We normally round-trip source `o` or `x` tokens depending on head class.
  // The exact visual head is derived from the instrument at render time, so
  // for serialization we just emit `o` for most heads and `x` for strike-y
  // heads so the parser re-infers them correctly.
  switch (hit.head) {
    case "x":
      return "x";
    default:
      return "o";
  }
}

// Unused export kept so re-exports elsewhere can use LaneBeat from here.
export type { LaneBeat };
