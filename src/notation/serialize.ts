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
      const nav = serializeNavigation(bar);
      if (nav) lines.push(nav);
    });
  });

  return lines.join("\n") + "\n";
}

export function serializeBar(bar: Bar): string {
  const openMark = bar.repeatStart ? "|:" : "|";
  const closeMark = bar.repeatEnd ? ":|" : "|";
  const suffix = barSuffix(bar);

  if (bar.repeatPrevious) {
    return `${openMark} ${repeatSymbol(bar.repeatHint)} ${closeMark}${suffix}`;
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
  return `${openMark} ${body} ${closeMark}${suffix}`;
}

function barSuffix(bar: Bar): string {
  const parts: string[] = [];
  if (bar.repeatEnd && bar.repeatEnd.times > 2) {
    parts.push(` x${bar.repeatEnd.times}`);
  } else if (!bar.repeatEnd && bar.repeatCount > 1) {
    parts.push(` x${bar.repeatCount}`);
  }
  if (bar.ending) parts.push(` [${bar.ending}]`);
  return parts.join("");
}

function serializeNavigation(bar: Bar): string | null {
  const n = bar.navigation;
  if (!n) return null;
  switch (n.kind) {
    case "segno":
      return "@segno";
    case "coda":
      return "@coda";
    case "toCoda":
      return "@to-coda";
    case "fine":
      return "@fine";
    case "dc":
      return n.target ? `@dc al ${n.target}` : "@dc";
    case "ds":
      return n.target ? `@ds al ${n.target}` : "@ds";
  }
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

  if (lane.groups && lane.groups.length > 1) {
    // Dot-expanded lanes (every sub-group has division=1 + single slot,
    // and ratios are *not* equal) round-trip back to a flat slot list
    // so `o. -` / `o.. -` survive. Equal-ratio single-slot groups come
    // from the explicit `,` split API and stay grouped.
    const allSingle = lane.groups.every(
      (g) => g.division === 1 && g.slots.length === 1,
    );
    const equalRatios =
      allSingle &&
      lane.groups.every(
        (g) =>
          Math.abs(g.ratio - 1 / lane.groups!.length) < 1e-6,
      );
    if (allSingle && !equalRatios) {
      const flat = lane.groups.flatMap((g) => g.slots);
      return serializeGroup({
        ratio: 1,
        division: flat.length,
        tuplet: undefined,
        slots: flat,
      });
    }
    return lane.groups.map(serializeGroup).join(" , ");
  }
  return serializeGroup({
    ratio: 1,
    division: lane.division,
    tuplet: lane.tuplet,
    slots: lane.slots,
  });
}

function serializeGroup(group: import("./types").LaneGroup): string {
  const tokens = group.slots.map(slotToken).join(
    group.division > 4 || group.tuplet ? " " : "",
  );
  const prefix =
    group.tuplet && group.tuplet !== group.division
      ? `(${group.tuplet})`
      : "";
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
  if (hit.dots && hit.dots > 0) base += ".".repeat(Math.min(2, hit.dots));
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
