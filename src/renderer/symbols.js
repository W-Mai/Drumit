export const laneOrder = Object.freeze([
  "crash",
  "ride",
  "hihatOpen",
  "hihatHalfOpen",
  "hihatClosed",
  "tomHigh",
  "tomMid",
  "snare",
  "floorTom",
  "kick",
]);

export const laneLabels = Object.freeze({
  crash: "Crash",
  ride: "Ride",
  hihatOpen: "HH Open",
  hihatHalfOpen: "HH Half",
  hihatClosed: "Hi-Hat",
  tomHigh: "Tom 1",
  tomMid: "Tom 2",
  snare: "Snare",
  floorTom: "Floor",
  kick: "Kick",
});

export const staffY = Object.freeze({
  crash: -18,
  ride: -10,
  hihatOpen: -6,
  hihatHalfOpen: -4,
  hihatClosed: -2,
  tomHigh: 8,
  tomMid: 16,
  snare: 24,
  floorTom: 34,
  kick: 48,
});

export function hitGlyph(hit, x, y, options = {}) {
  const size = options.size ?? 6;
  const parts = [];
  const has = (name) => hit.articulations?.includes(name);

  if (has("ghost")) {
    parts.push(`<text x="${x - size * 1.6}" y="${y + size * 0.75}" class="ghost-paren">(</text>`);
    parts.push(`<text x="${x + size * 1.1}" y="${y + size * 0.75}" class="ghost-paren">)</text>`);
  }

  if (hit.head === "x" || hit.instrument.includes("hihat") || hit.instrument === "crash" || hit.instrument === "ride") {
    parts.push(`<path d="M ${x - size} ${y - size} L ${x + size} ${y + size} M ${x + size} ${y - size} L ${x - size} ${y + size}" class="hit-x"/>`);
  } else {
    parts.push(`<circle cx="${x}" cy="${y}" r="${size}" class="hit-o"/>`);
  }

  if (has("accent")) {
    parts.push(`<path d="M ${x - 7} ${y - 14} L ${x + 7} ${y - 10} L ${x - 7} ${y - 6}" class="accent"/>`);
  }
  if (has("roll")) {
    parts.push(`<path d="M ${x - 9} ${y + 12} q 4 -5 8 0 t 8 0" class="roll"/>`);
  }
  if (has("flam")) {
    parts.push(`<circle cx="${x - 12}" cy="${y - 12}" r="${Math.max(2, size * 0.45)}" class="grace"/>`);
  }
  if (has("choke")) {
    parts.push(`<text x="${x + 8}" y="${y - 8}" class="choke">!</text>`);
  }
  if (hit.sticking) {
    parts.push(`<text x="${x}" y="${y - 18}" class="sticking">${escapeHtml(hit.sticking)}</text>`);
  }

  return parts.join("");
}

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
