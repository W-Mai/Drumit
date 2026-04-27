import type { Diagnostic, Score } from "./types";

export function validateScore(score: Score): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  if (!score.title.trim()) {
    diagnostics.push({
      level: "error",
      line: 1,
      message: "Title is required.",
    });
  }
  if (!score.meter.beats || !score.meter.beatUnit) {
    diagnostics.push({
      level: "error",
      line: 1,
      message: "Meter is required.",
    });
  }
  if (!score.sections.length) {
    diagnostics.push({
      level: "error",
      line: 1,
      message: "At least one section is required.",
    });
  }
  return diagnostics;
}
