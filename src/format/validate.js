export const instruments = Object.freeze([
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

export const articulations = Object.freeze(["accent", "ghost", "flam", "roll", "rimshot", "choke"]);

export function validateScore(score) {
  const diagnostics = [];
  if (!score.title.trim()) diagnostics.push({ level: "error", line: 1, message: "Title is required." });
  if (!score.meter?.beats || !score.meter?.beatUnit) diagnostics.push({ level: "error", line: 1, message: "Meter is required." });
  if (!score.sections.length) diagnostics.push({ level: "error", line: 1, message: "At least one section is required." });

  score.sections.forEach((section) => {
    if (!section.bars.length) diagnostics.push({ level: "warning", line: 1, message: `Section ${section.label} has no bars.` });
    section.bars.forEach((bar) => {
      bar.cells.forEach((cell) => {
        cell.hits.forEach((hit) => {
          if (!instruments.includes(hit.instrument)) {
            diagnostics.push({ level: "error", line: 1, message: `Unknown instrument '${hit.instrument}'.` });
          }
        });
      });
    });
  });

  return diagnostics;
}
