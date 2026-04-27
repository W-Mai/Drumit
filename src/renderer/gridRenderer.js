import { escapeHtml, hitGlyph, laneLabels, laneOrder } from "./symbols.js";

export function renderGrid(score) {
  const barWidth = 210;
  const slotWidth = 36;
  const laneHeight = 28;
  const left = 86;
  const top = 58;
  const systemGap = 26;
  const barsPerRow = 2;
  const sectionHeader = 30;
  let y = 26;
  const rows = [];

  score.sections.forEach((section) => {
    rows.push(`<text x="16" y="${y}" class="section-title">[${escapeHtml(section.label)}]</text>`);
    y += sectionHeader;

    section.bars.forEach((bar, barIndex) => {
      const col = barIndex % barsPerRow;
      const rowStart = Math.floor(barIndex / barsPerRow);
      const rowY = y + rowStart * (laneOrder.length * laneHeight + systemGap + 28);
      const x = 16 + col * (barWidth + 34);
      rows.push(renderGridBar(bar, barIndex + 1, x, rowY, { left, top, slotWidth, laneHeight, barWidth }));
    });

    const rowCount = Math.ceil(section.bars.length / barsPerRow);
    y += rowCount * (laneOrder.length * laneHeight + systemGap + 28) + 10;
  });

  const width = Math.max(760, 16 + barsPerRow * (barWidth + 34));
  const height = Math.max(320, y + top);
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Compact drum grid">${rows.join("")}</svg>`;
}

function renderGridBar(bar, number, x, y, dims) {
  const { left, slotWidth, laneHeight, barWidth } = dims;
  const content = [];
  content.push(`<g class="bar compact-bar">`);
  content.push(`<text x="${x}" y="${y - 12}" class="bar-number">${number}${bar.repeatCount > 1 ? ` x${bar.repeatCount}` : ""}</text>`);
  content.push(`<rect x="${x}" y="${y}" width="${barWidth}" height="${laneOrder.length * laneHeight}" rx="10" class="bar-box"/>`);

  laneOrder.forEach((instrument, laneIndex) => {
    const laneY = y + laneIndex * laneHeight + laneHeight / 2;
    content.push(`<text x="${x + 10}" y="${laneY + 4}" class="lane-label">${laneLabels[instrument]}</text>`);
    content.push(`<line x1="${x + left - 12}" y1="${laneY}" x2="${x + barWidth - 10}" y2="${laneY}" class="lane-line"/>`);
  });

  if (bar.repeat?.kind === "previous") {
    const cx = x + barWidth / 2;
    const cy = y + (laneOrder.length * laneHeight) / 2;
    content.push(`<text x="${cx}" y="${cy}" class="repeat-mark">%</text>`);
    content.push(`</g>`);
    return content.join("");
  }

  const slots = Math.max(1, bar.cells.length);
  for (let i = 0; i < slots; i += 1) {
    const slotX = x + left + i * slotWidth;
    content.push(`<line x1="${slotX}" y1="${y + 6}" x2="${slotX}" y2="${y + laneOrder.length * laneHeight - 6}" class="slot-line"/>`);
  }

  bar.cells.forEach((cell, slotIndex) => {
    const hitX = x + left + slotIndex * slotWidth;
    cell.hits.forEach((hit) => {
      const laneIndex = laneOrder.indexOf(hit.instrument);
      if (laneIndex < 0) return;
      const hitY = y + laneIndex * laneHeight + laneHeight / 2;
      content.push(hitGlyph(hit, hitX, hitY, { size: 5 }));
    });
  });

  content.push(`</g>`);
  return content.join("");
}
