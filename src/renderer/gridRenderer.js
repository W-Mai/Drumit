import { escapeHtml, hitGlyph, laneLabels, laneOrder } from "./symbols.js";

const compressedLaneOrder = Object.freeze(["cymbals", "drums"]);
const compressedLaneLabels = Object.freeze({
  cymbals: "Cymbals",
  drums: "Drums",
});

export function renderGrid(score, options = {}) {
  const expanded = options.expanded ?? false;
  const showLabels = options.showLabels ?? true;
  const lanes = expanded ? laneOrder : compressedLaneOrder;
  const barWidth = 210;
  const slotWidth = expanded ? 36 : 28;
  const laneHeight = expanded ? 28 : 34;
  const left = showLabels ? 86 : 20;
  const top = 58;
  const systemGap = 26;
  const barsPerRow = expanded ? 2 : 3;
  const sectionHeader = 30;
  let y = 26;
  const rows = [];

  score.sections.forEach((section) => {
    rows.push(`<text x="16" y="${y}" class="section-title">[${escapeHtml(section.label)}]</text>`);
    y += sectionHeader;

    section.bars.forEach((bar, barIndex) => {
      const col = barIndex % barsPerRow;
      const rowStart = Math.floor(barIndex / barsPerRow);
      const rowY = y + rowStart * (lanes.length * laneHeight + systemGap + 28);
      const x = 16 + col * (barWidth + 34);
      rows.push(renderGridBar(bar, barIndex + 1, x, rowY, { expanded, lanes, showLabels, left, slotWidth, laneHeight, barWidth }));
    });

    const rowCount = Math.ceil(section.bars.length / barsPerRow);
    y += rowCount * (lanes.length * laneHeight + systemGap + 28) + 10;
  });

  const width = Math.max(760, 16 + barsPerRow * (barWidth + 34));
  const height = Math.max(320, y + top);
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Compact drum grid">${rows.join("")}</svg>`;
}

function renderGridBar(bar, number, x, y, dims) {
  const { expanded, lanes, showLabels, left, slotWidth, laneHeight, barWidth } = dims;
  const content = [];
  const barHeight = lanes.length * laneHeight;
  content.push(`<g class="bar compact-bar">`);
  content.push(`<text x="${x}" y="${y - 12}" class="bar-number">${number}${bar.repeatCount > 1 ? ` x${bar.repeatCount}` : ""}</text>`);
  content.push(`<rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" rx="10" class="bar-box"/>`);

  lanes.forEach((lane, laneIndex) => {
    const laneY = y + laneIndex * laneHeight + laneHeight / 2;
    if (showLabels) {
      const label = expanded ? laneLabels[lane] : compressedLaneLabels[lane];
      content.push(`<text x="${x + 10}" y="${laneY + 4}" class="lane-label">${label}</text>`);
    }
    content.push(`<line x1="${x + left - 12}" y1="${laneY}" x2="${x + barWidth - 10}" y2="${laneY}" class="lane-line"/>`);
  });

  if (bar.repeat?.kind === "previous") {
    const cx = x + barWidth / 2;
    const cy = y + barHeight / 2;
    content.push(`<text x="${cx}" y="${cy}" class="repeat-mark">%</text>`);
    content.push(`</g>`);
    return content.join("");
  }

  const slots = Math.max(1, bar.cells.length);
  const firstSlotX = getFirstSlotX(x, left, barWidth, slotWidth, slots, expanded);
  for (let i = 0; i < slots; i += 1) {
    const slotX = firstSlotX + i * slotWidth;
    content.push(`<line x1="${slotX}" y1="${y + 6}" x2="${slotX}" y2="${y + barHeight - 6}" class="slot-line"/>`);
  }

  bar.cells.forEach((cell, slotIndex) => {
    const hitX = firstSlotX + slotIndex * slotWidth;
    cell.hits.forEach((hit) => {
      const laneIndex = getLaneIndex(hit.instrument, lanes, expanded);
      if (laneIndex < 0) return;
      const hitY = y + laneIndex * laneHeight + laneHeight / 2;
      content.push(hitGlyph(hit, hitX, hitY, { size: 5 }));
    });
  });

  content.push(`</g>`);
  return content.join("");
}

function getFirstSlotX(x, left, barWidth, slotWidth, slots, expanded) {
  if (expanded) return x + left;
  const drawingLeft = x + left;
  const drawingRight = x + barWidth - 18;
  const span = (slots - 1) * slotWidth;
  return drawingLeft + (drawingRight - drawingLeft - span) / 2;
}

function getLaneIndex(instrument, lanes, expanded) {
  if (expanded) return lanes.indexOf(instrument);
  return isCymbalInstrument(instrument) ? lanes.indexOf("cymbals") : lanes.indexOf("drums");
}

function isCymbalInstrument(instrument) {
  return instrument.includes("hihat") || instrument === "crash" || instrument === "ride";
}
