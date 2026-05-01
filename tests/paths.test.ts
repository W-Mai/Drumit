// End-to-end pipeline tests: parse → edit → serialize → render → export.
// Each test walks a long path that mirrors how a user actually uses the
// app, so regressions that span module boundaries show up here even
// when per-module coverage stays green.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { parseDrumtab } from "../src/notation/parser";
import { serializeScore } from "../src/notation/serialize";
import { layoutScore } from "../src/notation/layout";
import { DrumChart } from "../src/notation/renderer";
import { StaffView } from "../src/notation/staff/renderer";
import { schedule } from "../src/notation/scheduler";
import { exportScoreToMidi } from "../src/notation/midiExport";
import { expandScore } from "../src/notation/expand";
import {
  toggleSlot,
  cycleDots,
  toggleArticulation,
  insertBarAfter,
  deleteBar,
  setBarRepeatPrevious,
  toggleBarRepeatStart,
  toggleBarRepeatEnd,
  splitBeatIntoGroups,
  extractBars,
  pasteBarsBefore,
} from "../src/notation/edit";
import { samples } from "../src/notation/samples";

describe("path: parse → edit → serialize → re-parse → layout → render", () => {
  it("a full user session roundtrips through every layer without loss", () => {
    // 1. Parse a starter bar.
    const src = `title: Session Tune\ntempo: 100\nmeter: 4/4\n[A]\n| hh: x / x / x / x  bd: o / - / o / -  sn: - / o / - / o |`;
    const p1 = parseDrumtab(src);
    expect(p1.diagnostics.filter((d) => d.level === "error")).toHaveLength(0);

    // 2. Chain ≥8 edit ops. Each mutation returns a fresh score.
    let s = p1.score;
    s = toggleSlot(s, 0, 0, "kick", 0); // remove the down-beat kick
    s = toggleSlot(s, 0, 0, "kick", 0); // re-add it
    s = cycleDots(s, 0, 1, "snare", 0); // dot the snare on beat 1
    s = toggleArticulation(s, 0, 3, "snare", 0, "accent");
    s = insertBarAfter(s, 0); // bar 2 is a copy of bar 1
    s = setBarRepeatPrevious(s, 1, "plain"); // turn bar 2 into `%`
    s = toggleBarRepeatStart(s, 0);
    s = toggleBarRepeatEnd(s, 1, 3);

    // 3. Serialize. The text round-trips idempotently.
    const out1 = serializeScore(s);
    const p2 = parseDrumtab(out1);
    expect(p2.diagnostics.filter((d) => d.level === "error")).toHaveLength(0);
    const out2 = serializeScore(p2.score);
    expect(out2).toBe(out1);

    // 4. Layout both drum-chart and staff views.
    const layout = layoutScore(p2.score, {
      showLabels: false,
      expanded: false,
      width: 900,
    });
    expect(layout.rows.length).toBeGreaterThan(0);

    const svgDrum = renderToStaticMarkup(
      createElement(DrumChart, { layout, showLabels: false }),
    );
    const svgStaff = renderToStaticMarkup(
      createElement(StaffView, { score: p2.score }),
    );
    expect(svgDrum.startsWith("<svg")).toBe(true);
    expect(svgStaff.startsWith("<svg")).toBe(true);

    // 5. The dotted snare we added shows up as a circle in the staff
    //    (augmentation dot glyph).
    expect(svgStaff).toMatch(/<circle/);
  });
});

describe("path: parse → expand → schedule (playback correctness)", () => {
  it("repeat/ending expansion is consistent with scheduled time positions", () => {
    const src = `title: T\ntempo: 60\nmeter: 4/4\n[A]\n|: bd: o / o / o / o |\n| sn: o / o / o / o | [1]\n| sn: o / - / - / - :| [2]`;
    const { score } = parseDrumtab(src);

    // Expand view coords.
    const expanded = expandScore(score);
    const expandedBarCount = expanded.sections.reduce(
      (n, s) => n + s.bars.length,
      0,
    );
    expect(expandedBarCount).toBe(4); // open+ending1, open+ending2

    // Scheduler produces events whose time matches that timeline.
    const { events, totalDuration } = schedule(score);
    expect(totalDuration).toBeCloseTo(16, 2); // 4 bars × 4 beats × 1 s
    // First event sits at t=0; the last event's time is less than
    // totalDuration.
    expect(events[0].time).toBe(0);
    expect(events[events.length - 1].time).toBeLessThan(totalDuration);
  });
});

describe("path: parse → schedule → MIDI export → probe", () => {
  it("every scheduled hit appears as a note-on in the MIDI stream", () => {
    const src = `title: T\ntempo: 120\nmeter: 4/4\n[A]\n| hh: x / x / x / x  bd: o / - / o / -  sn: - / o / - / o |`;
    const { score } = parseDrumtab(src);
    const scheduledEvents = schedule(score).events;
    const bytes = exportScoreToMidi(score);

    // Count 0x99 bytes (note-on on channel 10). Should be >= number of
    // scheduled hits (some instruments may share note numbers; at
    // minimum we have one per event).
    let noteOns = 0;
    for (const b of bytes) if (b === 0x99) noteOns += 1;
    expect(noteOns).toBeGreaterThanOrEqual(scheduledEvents.length);
  });

  it("tempoOverride in schedule and midi export agree on wall-clock", () => {
    const { score } = parseDrumtab(
      `title: T\ntempo: 60\nmeter: 4/4\n[A]\n| bd: o / o / o / o |`,
    );
    const normal = schedule(score).totalDuration;
    const fast = schedule(score, { tempoOverride: 120 }).totalDuration;
    expect(fast).toBeCloseTo(normal / 2, 3);

    // MIDI header tempo bytes differ too; just assert both files are
    // well-formed (header tested elsewhere).
    const bNormal = exportScoreToMidi(score);
    const bFast = exportScoreToMidi(score, { tempoOverride: 120 });
    expect(bNormal.length).toBeGreaterThan(40);
    expect(bFast.length).toBeGreaterThan(40);
    // Fast file encodes a different tempo value, so the raw bytes
    // must diverge.
    expect(Array.from(bNormal)).not.toEqual(Array.from(bFast));
  });
});

describe("path: edit session → snapshot stability", () => {
  // A stateful path: build up a score through many small edits, stash
  // serialized snapshots, and verify each replay matches. Mirrors undo
  // history + reload semantics.
  it("10 random-ish edits produce a stable snapshot chain", () => {
    const { score } = parseDrumtab(
      `title: T\nmeter: 4/4\n[A]\n| bd: - / - / - / - |`,
    );
    const chain: string[] = [serializeScore(score)];
    let s = score;
    for (let i = 0; i < 10; i += 1) {
      const beat = i % 4;
      s = toggleSlot(s, 0, beat, i % 2 === 0 ? "kick" : "snare", 0);
      chain.push(serializeScore(s));
    }
    // Each snapshot round-trips to itself.
    for (const snap of chain) {
      const roundTripped = serializeScore(parseDrumtab(snap).score);
      expect(roundTripped).toBe(snap);
    }
    // Playing back from any snapshot restores its score 1:1.
    const midStep = parseDrumtab(chain[5]).score;
    expect(serializeScore(midStep)).toBe(chain[5]);
  });

  it("clipboard round: extract → delete → paste elsewhere preserves content", () => {
    const { score } = parseDrumtab(
      `title: T\nmeter: 4/4\n[A]\n| bd: o / - / o / - |\n| sn: - / o / - / o |\n| bd: o / o / - / - |`,
    );
    const clipped = extractBars(score, 1, 1); // pull bar 2 (snare)
    expect(clipped).toHaveLength(1);
    const { score: afterPaste } = {
      score: pasteBarsBefore(score, 0, clipped),
    };
    // Now the first bar should be the former bar 2 (snare), original
    // bars 1-3 shifted down.
    const firstBarSource = serializeScore(afterPaste).split("\n").find((l) =>
      l.startsWith("| "),
    );
    expect(firstBarSource).toContain("sn:");
  });
});

describe("path: every sample → full pipeline", () => {
  // Don't just parse: take each sample, run it through schedule,
  // midi export, drum & staff render, and validate none of them fall
  // over.
  for (const sample of samples) {
    it(`${sample.id}: parse → schedule → midi → drum → staff all succeed`, () => {
      const { score, diagnostics } = parseDrumtab(sample.source);
      expect(diagnostics.filter((d) => d.level === "error")).toHaveLength(0);

      const { events, totalDuration } = schedule(score);
      expect(totalDuration).toBeGreaterThan(0);
      expect(events.length).toBeGreaterThan(0);

      const midi = exportScoreToMidi(score);
      expect(midi.length).toBeGreaterThan(100);

      const layout = layoutScore(score, {
        showLabels: false,
        expanded: false,
        width: 980,
      });
      const drum = renderToStaticMarkup(
        createElement(DrumChart, { layout, showLabels: false }),
      );
      expect(drum.startsWith("<svg")).toBe(true);

      const staff = renderToStaticMarkup(
        createElement(StaffView, { score }),
      );
      expect(staff.startsWith("<svg")).toBe(true);

      // Expanded view for samples with repeats produces at least as
      // many bars as the source.
      const expanded = expandScore(score);
      const expandedBars = expanded.sections.reduce(
        (n, s) => n + s.bars.length,
        0,
      );
      const sourceBars = score.sections.reduce(
        (n, s) => n + s.bars.length,
        0,
      );
      expect(expandedBars).toBeGreaterThanOrEqual(sourceBars);
    });
  }
});

describe("path: split beat → fill groups → serialize → re-parse preserves structure", () => {
  it("custom `,` split survives serialize + re-parse", () => {
    const { score } = parseDrumtab(
      `title: T\nmeter: 4/4\n[A]\n| bd: o / o / o / o |`,
    );
    let s = splitBeatIntoGroups(score, 0, 0, "kick", 3);
    s = toggleSlot(s, 0, 0, "kick", 0, 0); // toggle off first group's slot
    s = toggleSlot(s, 0, 0, "kick", 0, 1);
    s = toggleSlot(s, 0, 0, "kick", 0, 2);
    const out = serializeScore(s);
    const { score: s2 } = parseDrumtab(out);
    const lane = s2.sections[0].bars[0].beats[0].lanes.find(
      (l) => l.instrument === "kick",
    );
    expect(lane?.groups).toHaveLength(3);
  });
});

describe("path: delete then undo (via history re-parse) restores exactly", () => {
  it("deleteBar + parse(previous source) gives back the deleted bar", () => {
    const { score } = parseDrumtab(
      `title: T\nmeter: 4/4\n[A]\n| bd: o / - / - / - |\n| sn: - / o / - / - |\n| bd: - / - / o / - |`,
    );
    const beforeDelete = serializeScore(score);
    const afterDelete = deleteBar(score, 1);
    expect(
      afterDelete.sections.reduce((n, s) => n + s.bars.length, 0),
    ).toBe(2);
    // "Undo" by re-parsing the earlier snapshot.
    const restored = parseDrumtab(beforeDelete).score;
    expect(
      restored.sections.reduce((n, s) => n + s.bars.length, 0),
    ).toBe(3);
    expect(serializeScore(restored)).toBe(beforeDelete);
  });
});

describe("path: controller state mutations chain consistently", () => {
  // A long stateful path on the playback controller. At each step we
  // probe cursorAt() to confirm the internal schedule matches the
  // most recent score / tempo / loop configuration.
  it("setScore → setTempo → setLoop → setStartTime — each respects the previous", async () => {
    const { PlaybackController } = await import("../src/playback/controller");

    const smallScore = parseDrumtab(
      `title: T\ntempo: 60\nmeter: 4/4\n[A]\n| bd: o / o / o / o |`,
    ).score;
    const biggerScore = parseDrumtab(
      `title: T\ntempo: 60\nmeter: 4/4\n[A]\n|: bd: o / o / o / o :| x3`,
    ).score;

    const engine = {
      name: "fake",
      kind: "synth" as const,
      async ensureReady() {},
      scheduleEvent() {},
      stop() {},
    };
    const ctrl = new PlaybackController({ engine, score: smallScore });

    // State 1: small score, 60 bpm, no loop.
    expect(ctrl.cursorAt(0).barIndex).toBe(0);
    expect(ctrl.cursorAt(4).barIndex).toBe(0); // clamped past-end

    // State 2: bigger score (same tempo).
    ctrl.setScore(biggerScore);
    // Now t=5 lands in bar 0 (repeat pass 2) → expandedBarIndex=1.
    expect(ctrl.cursorAt(5).expandedBarIndex).toBe(1);
    expect(ctrl.cursorAt(9).expandedBarIndex).toBe(2);

    // State 3: double tempo → bar 1 (expanded) now starts at t=2.
    ctrl.setTempo(120);
    expect(ctrl.cursorAt(2).expandedBarIndex).toBe(1);
    expect(ctrl.cursorAt(4).expandedBarIndex).toBe(2);

    // State 4: setLoop. Doesn't affect cursorAt (that's by absolute
    // time), but confirms it doesn't throw.
    ctrl.setLoop({ startBar: 0, endBar: 0 });
    expect(ctrl.cursorAt(0).expandedBarIndex).toBe(0);

    // State 5: metronome on/off
    ctrl.setMetronome(true);
    ctrl.setMetronome(false);
    expect(ctrl.cursorAt(0).barIndex).toBe(0);
  });
});

describe("path: load sample → edit → save → reload round", () => {
  it("picks a sample, modifies it, serializes and re-parses cleanly", () => {
    const sample = samples[0];
    const { score: s1 } = parseDrumtab(sample.source);
    // Add an accent on the first hit we find.
    let found = false;
    let s2 = s1;
    for (let bi = 0; !found && bi < 1; bi += 1) {
      const bar = s2.sections[0].bars[bi];
      if (!bar) break;
      for (let beatIdx = 0; !found && beatIdx < bar.beats.length; beatIdx += 1) {
        for (const lane of bar.beats[beatIdx].lanes) {
          const slot = lane.slots.findIndex((s) => s !== null);
          if (slot >= 0) {
            s2 = toggleArticulation(
              s2,
              bi,
              beatIdx,
              lane.instrument,
              slot,
              "accent",
            );
            found = true;
            break;
          }
        }
      }
    }
    expect(found).toBe(true);

    const out = serializeScore(s2);
    const { score: s3, diagnostics } = parseDrumtab(out);
    expect(diagnostics.filter((d) => d.level === "error")).toHaveLength(0);
    // Roundtrip stable.
    expect(serializeScore(s3)).toBe(out);
  });
});
