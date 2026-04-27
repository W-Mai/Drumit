import { escapeHtml, hitGlyph, staffY } from "./symbols.js";

export function renderStaff(score) {
  const width = 900;
  const marginX = 34;
  const systemHeight = 116;
  const barWidth = 190;
  const barsPerRow = 4;
  let y = 52;
  const parts = [];

  parts.push(`<text x="${marginX}" y="28" class="score-title">${escapeHtml(score.title)}</text>`);
  if (score.tempo) parts.push(`<text x="${width - 120}" y="28" class="meta">q = ${score.tempo.bpm}</text>`);

  score.sections.forEach((section) => {
    parts.push(`<text x="${marginX}" y="${y - 14}" class="section-title">[${escapeHtml(section.label)}]</text>`);
    section.bars.forEach((bar, index) => {
      const col = index % barsPerRow;
      const row = Math.floor(index / barsPerRow);
      const x = marginX + col * (barWidth + 16);
      const barY = y + row * systemHeight;
      parts.push(renderStaffBar(bar, index + 1, x, barY, barWidth));
    });
    y += Math.ceil(section.bars.length / barsPerRow) * systemHeight + 28;
  });

  const height = Math.max(260, y + 26);
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Standard drum staff preview">${parts.join("")}</svg>`;
}

function renderStaffBar(bar, number, x, y, width) {
  const parts = [];
  const staffTop = y;
  const lineGap = 10;
  parts.push(`<g class="bar staff-bar">`);
  parts.push(`<text x="${x + 4}" y="${staffTop - 8}" class="bar-number">${number}${bar.repeatCount > 1 ? ` x${bar.repeatCount}` : ""}</text>`);
  for (let i = 0; i < 5; i += 1) {
    const lineY = staffTop + i * lineGap;
    parts.push(`<line x1="${x}" y1="${lineY}" x2="${x + width}" y2="${lineY}" class="staff-line"/>`);
  }
  parts.push(`<line x1="${x}" y1="${staffTop}" x2="${x}" y2="${staffTop + 4 * lineGap}" class="barline"/>`);
  parts.push(`<line x1="${x + width}" y1="${staffTop}" x2="${x + width}" y2="${staffTop + 4 * lineGap}" class="barline"/>`);

  if (bar.repeat?.kind === "previous") {
    parts.push(`<text x="${x + width / 2}" y="${staffTop + 28}" class="repeat-mark">%</text>`);
    parts.push(`</g>`);
    return parts.join("");
  }

  const slots = Math.max(1, bar.cells.length);
  const slotStep = width / (slots + 1);
  bar.cells.forEach((cell, slotIndex) => {
    const hitX = x + slotStep * (slotIndex + 1);
    cell.hits.forEach((hit) => {
      const hitY = staffTop + (staffY[hit.instrument] ?? 24);
      parts.push(hitGlyph(hit, hitX, hitY, { size: 5 }));
      parts.push(`<line x1="${hitX + 7}" y1="${hitY}" x2="${hitX + 7}" y2="${hitY - 28}" class="stem"/>`);
    });
  });

  parts.push(`</g>`);
  return parts.join("");
}
