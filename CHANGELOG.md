# Changelog

All notable changes to this project are documented here.

Version numbers follow **CalVer** as `YYYY.MM.DD` with git tags prefixed `v`
(e.g. `v2026.04.29`). Multiple releases on the same day get a `.N` suffix
(`v2026.04.29.1`). Bumps happen whenever we publish to the live demo; a
release may include features, fixes, or both.

The format is loosely based on [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

## [2026.05.01.2]

### Added

- **Dotted notes** — `o.` (dotted) / `o..` (double-dotted) in
  `.drumtab` sources. Works in the editor too: `.` hotkey or the
  Dots entry in a cell's right-click menu cycles 0 → 1 → 2 → 0 on
  the selected slot. Playback / staff / Drumit all reflect the
  right timing and augmentation dot glyph.
- **Dotted extension punches out other lanes' beams** in its range.
  When one lane is dotted, the other lane's 16th rest in the same
  territory no longer paints a competing under-line — the dot
  visually owns its extended span.

### Changed / Fixed

- **Lane alignment across a row of bars** — the row-group → visual-row
  mapping is now computed per row (not per bar), so neighbouring bars
  using different row groups no longer shift each other's lanes up
  and down.
- **Tighter Preview layout** — `BAR_GAP_X` → 0 so adjacent bars share
  barlines, `ROW_GAP` / `SECTION_GAP_BEFORE` / `SECTION_HEADER_HEIGHT`
  shrunk. Playhead highlight no longer flares over neighbouring
  barlines.
- **Stable playhead bar box** — the highlight now uses the row's
  maximum height (`rowMaxHeight`) instead of each bar's own, so the
  box no longer resizes as playback moves between bars with
  different row-group sets.
- **Richer rows keep their own primary bar** — a 16th / 32nd row now
  shows both its depth-1 base and depth-2 short beam, so hi-hat
  16ths display the full two-line stack even when another voice is
  folded onto the bottom row.
- **Identical-stack rows collapse to the bottom row** — when two
  voices share the exact same beam stack (e.g. kick 16ths + ride
  16ths), the upper row's under-lines fold away, leaving one clean
  stack on the lowest voice.
- **`%` repeat bar on a row of its own** — rows containing only
  repeat-previous / all-rest / empty bars now produce valid rowY
  and non-zero height, so the `∕` slash actually renders instead of
  silently disappearing at NaN coordinates.
- **Dotted values pick up their base beam count** — a dotted 8th
  (`o.`) now gets one beam instead of zero (the effective-subdivision
  heuristic used to leave it under the threshold).
- **Beam depth badge (×pass/total) fits into the bar gutter** —
  stops overlapping the first note row.

## [2026.05.01.1]

🎉 劳动节快乐！May Day release — go rehearse something noisy.

### Changed

- Perform-view chips use **long-press (450ms)** to open the pass
  picker instead of a tiny `▾` button that was hard to tap and kept
  getting clipped by the mini-map's overflow. Short taps still seek.
  A soft amber ring marks chips that have multiple passes worth
  picking.

### Fixed

- Pass popover now renders into the fullscreen element when Perform
  view is fullscreen — previously the modal painted under the
  fullscreen surface and was invisible.

## [2026.04.30.3]

### Fixed

- Perform-view chips and top readout now show the source bar number
  with the pass iteration underneath (`3` + `×2/3`), not the raw
  unrolled index. Matches how drummers actually refer to their place
  in the chart.

## [2026.04.30.2]

### Added

- **Perform view** — a fullscreen teleprompter-style rehearsal mode,
  opened from the 🎭 Perform button in the Preview panel header. The
  full expanded score lays out in one long horizontal row; during
  playback the chart scrolls leftward beat-by-beat so the current
  beat always lines up with an amber reticle at the left third of
  the stage (the "read-ahead" position). Tap anywhere on the stage
  to seek to that spot. A compressed mini-map at the top shows the
  whole timeline at a glance with a viewport rectangle, plus chips
  for every bar (section labels, `×pass/total` badges, `▾` pass
  pickers for repeated bars). The chart auto-scales to fill the stage
  while keeping at least 4 bars visible at once. On touch devices in
  portrait the whole panel CSS-rotates 90° so users with auto-rotate
  disabled still land in landscape; on Android Chrome it also
  requests the native orientation lock.

### Fixed

- Seeking from a stopped transport (e.g. tapping a Perform-view
  chip before hitting play) now pushes the cursor to the picked
  position immediately instead of waiting for the next play().

## [2026.04.30.1]

### Added

- **Expanded preview toggle** (Compact ↔ Expand button next to
  Drumit/Staff). The expanded view unrolls `|: :| xN`, 1st/2nd endings
  and D.C./D.S. jumps into a single linear section so you can see
  the full timeline at a glance. Read-only — switch back to Compact
  to edit.
- **Click-to-seek inside the expanded view** — clicking any expanded
  bar starts playback at that precise wall-clock position, including
  all the repeats and jumps that precede it.
- **Playback cursor on a unified timeline** — playhead and auto-scroll
  now track both the source bar (for compact view) and the expanded
  position (for expand view) through a single wall-clock coordinate.
  Fixes the expand-mode cursor that used to freeze on the original
  source bar.
- **"×pass/total" badge** on the active bar in compact view when a
  repeated bar is sounding (e.g. `×2/3` on the second iteration of a
  `|: … :| x3`).
- **Auto-scroll Preview** follows the playhead into view as it
  advances bar-by-bar.
- **Engine-specific playhead colours** — synth is emerald, samples
  sky-blue, MIDI rose-pink — matching the engine swatches in the
  PlaybackBar.
- **Bar-level clipboard** (`⌘C` / `⌘X` / `⌘V` / `⌫`) scoped to the
  Preview panel, with Shift+Arrow / Shift+click range selection. The
  editor panel keeps its own clipboard semantics.

### Fixed

- Toggling Compact/Expand while playing no longer yanks the playhead
  back to the selection. Seeking is now imperative — only a plain
  click on a bar (not shift-click, not toggling views) moves the
  playhead.
- `beatIndex` in the play cursor advances beat-by-beat even on sparse
  patterns (e.g. a lone bass drum on beat 1) instead of lingering on 0
  until the next hit fires. Side effect of the cursor timeline rewrite.
- Cursor no longer freezes on whatever bar happened to emit the last
  event when playing through silent sections.

## [2026.04.29.11]

### Added

- **`SampleEngine`** — third playback engine alongside Synth and MIDI.
  Plays real drum samples from `public/samples/*.ogg` via
  `AudioBufferSourceNode`. Selectable from the Engine dropdown in the
  PlaybackBar; shows `loading samples…` while fetching.
- **13 CC0 drum samples** from [Virtuosity Drums](https://github.com/sfzinstruments/virtuosity_drums)
  (CC0 1.0), 188.8 kB total as OGG Opus. Kicks in immediately when you
  pick the Samples engine — no download step, the files are bundled.
- `scripts/fetch-samples.ts` — regenerate the sample set. Pulls flac
  from the Virtuosity Drums repo, runs ffmpeg (silence trim + loudnorm
  + fade-out), writes `.ogg` into `public/samples/`. Users can also
  drop their own `.ogg` files with matching names to override.

### Notes

- Velocity layers deferred. MVP maps hit velocity to gain.
- The playable-HTML export still uses Synth (doesn't bundle samples).

## [2026.04.29.10]

### Added

- **Clear bar** action in the Drumit editor — a `⌫ Clear` button next
  to Insert / Delete in the BarHeader strips every lane from the bar,
  leaving meter-sized empty beats behind. Useful for starting over on
  a pattern without having to delete-then-insert.
- **Section editing** in Drumit mode. PadEditor now has a Section
  strip above the bar header with Rename / Split / Delete actions.
  Splitting creates a new section starting at the next bar; deleting
  merges its bars into the previous section. Splitting after the last
  bar seeds the fresh section with one empty bar so it's immediately
  clickable, and the cursor auto-jumps into it.

### Changed

- Staff view draws a **whole rest** for any bar with no notes in
  either voice (instead of 4 quarter rests). Applies to cleared bars
  and to `|  |` bars loaded from source.
- Drumit view draws a **∅** glyph in bars with no hits so cleared /
  silent bars read as intentional (not as forgotten pattern).

### Fixed

- Staff view vertical padding increased so tuplet brackets above the
  staff and sticking labels below no longer get clipped by the viewBox
  or overlap the title row. Verified across all 7 bundled samples.
- Converting a `%` repeat-previous bar back to Pattern now seeds the
  correct beat count for non-4/4 meters (was hard-coded to 4).
- `setBarRepeatPrevious` preserves the bar's notes when switching to
  `%`, so `Pattern → % → Pattern` round-trips the content.
- Parser accepts a truly-empty bar body (`|  |`) as a valid empty bar
  (seeded with N silent beats) instead of erroring.

## [2026.04.29.9]

### Changed

- **Accents are now audibly louder and brighter.** Velocity spread
  widened from 40 / 96 / 120 to **40 / 80 / 120** — the old 24-velocity
  accent jump worked out to only ~1.8 dB, essentially imperceptible.
  The new spread gives accents ≈ +3.5 dB over a normal hit and ghosts
  ≈ −6 dB below.
- SynthEngine layers a short bright noise transient (~40 ms bandpass at
  ~4.5 kHz) on every hit with velocity ≥ 110, so accents come through
  as a distinct "slap" rather than just a slightly louder tap.

## [2026.04.29.8]

Staff view polish — this pass tightens a handful of visual details
against Weinberg 1994 PAS conventions.

### Added

- **`%` repeat-previous-bar** renders the dedicated single-measure
  repeat glyph (`𝄎`) instead of all-rests.

### Changed

- **Rests** now use the SMuFL Unicode glyphs (`𝄽 𝄾 𝄿 𝅀`) for canonical
  shapes instead of the hand-rolled zig-zag / stick-and-flag drawings.
- **Percussion clef** thickened from stroke-2.5 to stroke-4 butt caps
  with a tighter gap.
- **Ghost-note parentheses** shrunk so they hug the notehead.
- **Beam vertical spacing** tightened from 0.4 → 0.35 staff space.
- **Exports** now strip the `data-beat-rect` / `data-bar-highlight`
  interaction overlays so no spurious per-beat grey dividers appear in
  SVG / PNG / static HTML exports. Playable HTML keeps them (its
  embedded script drives live highlights).

### Fixed

- SVG exports no longer emit `<rect …>` without its closing tag (React
  SSR's paired form was only half-stripped, producing XML parse
  errors when opened as `.svg`).

## [2026.04.29.7]

### Fixed

- **Staff view compound-beat rendering** — multi-voice bars like
  `cr / hh / bd / sn / ft` with in-beat `,` groups no longer produce
  diagonal beams or mismatched durations.
  - Bars are now split into **upper (cymbal)** and **lower (drum)**
    voices; each voice has its own stems, beams, rests, and tuplets
  - Beams are horizontal by construction — every stem in a beam pins
    to the same tip Y
  - Secondary beams appear on 16th / 32nd sub-spans inside a primary
    run so mixed 8th / 16th rhythms read correctly
  - Chunkier filled-teardrop flag shapes replace the old S-curve
    strokes for isolated short notes

### Known limitations (deferred)

- `%` "repeat previous bar" renders as all-rests on staff view; the
  dedicated repeat-last glyph (like Drumit view's `%`) isn't drawn yet
- Half-beat rest filling inside a beat isn't attempted — only full
  empty beats emit a quarter rest

## [2026.04.29.6]

### Changed

- Export menu now follows the visible view — exporting while Staff mode
  is on produces a staff SVG / PNG / PDF / HTML, and the filenames gain
  a `-staff` suffix so they don't collide with Drumit-view exports.
  `.drumtab` and `.mid` stay suffix-free because they represent the
  AST, not a rendering.

## [2026.04.29.5]

### Added

- **Staff view is interactive** — click any bar to seek the transport;
  playback now paints the current bar emerald and the current beat with
  a lighter emerald stripe, matching the Drumit view.
- `data-bar-index` / `data-beat-rect[data-beat-index]` markers on the
  staff SVG so future embedded players can drive highlights the same way
  Drumit does.

## [2026.04.29.4]

Staff view phase 2 — the full-detail pass.

### Added

- **Repeat barlines** on staff: `|:` start + `:|` end glyphs with thick +
  thin lines and the two mid-staff dots, plus `×N` multiplier above the
  right-edge glyph for N > 2.
- **1st / 2nd ending brackets** above their bars (`[1.]` / `[2.]`).
- **Navigation markers** — D.C. / D.S. (with optional `al Fine` /
  `al Coda`), `To Coda`, `Fine`, plus the real Segno (𝄋) and Coda (𝄌)
  glyphs as text labels above the bar.
- **Articulations** on notes:
  - Accent — wedge `>` above stem-up / below stem-down
  - Ghost — rounded parentheses hugging the notehead
  - Flam — smaller grace notehead with slashed stem to the left
  - Roll — tremolo slashes across the stem
  - Choke — `+` above cymbal notes
- **Sticking** — R / L labels printed below notes with `/R` / `/L`
  suffixes.

### Changed

- `StaffNote` grew `articulations[]` and optional `sticking` fields;
  `StaffBar` grew `endBarline`, `repeatStart`, `repeatTimes`, `ending`,
  `navigationLabel`. All derived from the same AST — no parser changes.

## [2026.04.29.3]

First pass at standard notation.

### Added

- **Staff view (MVP)** — Preview panel gets a `Drumit / Staff` toggle
  that switches the chart into a five-line percussion-clef rendering.
  All geometry is hand-rolled under `src/notation/staff/` (no Vexflow,
  zero bundle growth); drum positions follow the Weinberg 1994 PAS
  standard. Covers:
  - Five-line staff with percussion clef and bold time signature
  - Drum map for the full kit (kick / snare / hi-hat / ride / crash
    family / toms) with the appropriate notehead shapes
  - Ledger lines above and below the staff for out-of-range voices
  - Stem direction driven by the chord's cymbal content (up) vs drum
    content (down); whole notes carry no stem
  - Duration-aware flags (8th / 16th / 32nd)
  - Beams across consecutive ≤8th notes within the same beat, with
    depth matching the shortest flag count
  - Quarter rests on beats with no hits; rest glyph set covers whole /
    half / quarter / 8th / 16th / 32nd
  - Triplet / sextuplet brackets with the count digit inline
  - Barlines at each StaffBar's right edge
  - Automatic system wrapping when the available width runs out; clef
    repeats on every system, time signature only on the first
- `useMediaQuery` path for the new toggle is persisted in workspace v4
  (`ui.viewMode`). Existing v2 / v3 snapshots upgrade in place.

### Explicitly not in this MVP

Repeat barlines, 1st / 2nd endings, D.C. / D.S. / Fine / Coda text,
articulation glyphs, playback cursor, editing on the staff, and staff
exports (PNG / PDF / HTML) are deferred — staff view is strictly
read-only for now.

## [2026.04.29.2]

Responsive layout pass + About panel + narrative refresh.

### Added

- **Mobile responsive layout** — the whole app is usable down to 320px wide.
  - Sidebar moves to a full-height drawer opened from a header hamburger on `<lg`;
    selecting / importing / loading a sample auto-closes it.
  - PlaybackBar sticks to the bottom of the viewport on `<lg`, horizontally
    scrollable for overflowing controls, with iOS safe-area padding.
  - Editor panel is desktop-only (`lg:`) — its touch story is out of scope for now;
    the 1700-line PadEditor isn't viable at 390px.
  - AboutModal becomes a bottom sheet on `<sm`; ExportMenu popover too via the
    new `FloatingMenu.mobileSheet` prop.
  - HoverClickPopover skips hover timers on touch devices (`pointer: coarse`),
    and outside-dismiss now listens on `pointerdown` to fire on both mouse and
    touch.
  - Header subtitle and the `benign.host` pill collapse on narrow viewports.
  - App shell uses `h-dvh` to dodge iOS Safari URL-bar jitter.
- **About panel** (header `i` button, Esc/backdrop to close) — tagline, first-person
  "Why", acknowledgement to 董波老师, build info (version + git hash + branch +
  dirty flag + ISO timestamp), and links to repo / CHANGELOG / LICENSE.
- **Header links** — GitHub mark and a `benign.host` pill sit next to the About
  button.
- **`useMediaQuery` / `useIsDesktop` / `useIsTouchDevice` hooks** built on
  `useSyncExternalStore`, covered by 6 behavioural tests under jsdom +
  `@testing-library/react`.
- Compile-time build metadata injected via `vite.config.ts` (`__BUILD_INFO__`)
  and surfaced through `src/lib/buildInfo.ts`.

### Changed

- README (Chinese, default) rewritten in first-person drummer-speak; English
  README kept in lockstep. New tagline: "白天练，夜里扒，做梦都在找鼓点打。"

## [2026.04.29.1]

Same-day follow-up focusing on exports + chart hygiene.

### Added

- **Export menu in the Preview panel** — hover/click popover with seven
  formats: SVG, PNG, PDF, static HTML, playable HTML, `.drumtab`, MIDI
- **Playable HTML** embeds the full Drumit runtime (parser + scheduler +
  Web Audio synth, esbuild-bundled to ~6.6 kB gzipped). Features in the
  exported page:
  - Play / Pause / Stop
  - BPM slider (40–260, real-time)
  - Metronome click toggle
  - Loop-current-bar toggle
  - Click any bar to seek; playhead and current-beat highlighting
    stay in sync through the embedded `PlaybackController`
- `bun run samples:generate` + `bun run player:bundle` scripts
- Bundled samples extracted to `/samples/*.drumtab` at the repo root,
  loaded via `import.meta.glob`. Load-example moved into DocumentList.

### Changed

- `showLabels` now renders instrument names once per row (not per bar)
  with full words (Cymbal / Tom / Snare / Kick); row-groups sharing a
  y-coordinate (e.g. Snare + Kick) merge into a combined label.
- Browser exporters read the live DOM SVG instead of re-running
  `react-dom/server`; production bundle shrunk from 506 kB → 319 kB.
- PDF export switched from `window.open + document.write` (popup-blocked
  on Safari, blank-preview on Chrome) to a hidden iframe + Blob URL.

### Fixed

- Transient selection / playhead classes (`fill-amber-200/60`,
  `fill-emerald-100/70`, `fill-emerald-300/40`) are neutralised to
  `fill-transparent` in exports so unspecified-fill SVG elements no
  longer render as solid black blocks.
- `react` and `react-dom` are declared as runtime dependencies (they
  were only implicitly present in `node_modules`, which broke CI).

## [2026.04.29]

First public release — the app is feature-complete enough to read, edit, play
back, and export simple rock/fusion charts.

### Notation & format

- `.drumtab` plain-text format with parser + lossless serializer round-trip
- Headers (`title`, `tempo`, `meter`) and per-bar meter override
- Sections, bar indexing, beat grids
- In-beat `,` groups for mixed subdivisions (e.g. `o , x x`)
- Auto-detected triplets / sextuplets from slot counts
- Repeat barlines (`|:` `:| xN`), 1st/2nd endings (`[1]` `[2]`)
- Navigation markers — `@segno`, `@coda`, `@fine`, `@dc`, `@ds (al fine/coda)`
- Sticking (`/R`, `/L`) and articulations — accent `>`, ghost `(x)`,
  flam `f`, roll `~`, choke `!`

### Rendering

- Adaptive multi-row chart: cymbals, toms, snare, kick rows expand and
  merge automatically based on voice conflicts per bar
- Beam merging across voices sharing the same shape on the same beat
- Tuplet bracket numbers embedded mid-beam with a centered notch
- Per-drum head sizing (kick/bass accent, toms scale ladder, hi-hat +30%)
- Distinct head glyphs — solid, ×, open, partial (`∂`), slash, stickX
- Articulation polish — flam grace head + slash, rounded ghost brackets,
  tremolo roll slashes, choke `+`
- Repeat dots, 1st/2nd ending brackets, D.C./D.S./Fine/Coda text
- Clickable bars in the preview, live playback cursor

### Playback

- Web Audio **synth engine** — oscillator + noise for kick/snare/hat/cymbal,
  offline, no samples bundled
- **Web MIDI engine** — channel 10 drums, GM mapping
- Look-ahead scheduler running in a Web Worker so hidden tabs don't throttle
- Transport state machine: Play / Pause / Stop with subscriptions
- Metronome click, tempo override, loop-to-bar
- Seamless swap of engine / score / metronome / tempo / loop mid-playback
- Full expansion of repeat barlines, endings, and D.C./D.S. jumps

### Editor

- Visual pad-grid editor — cursor, auto-advance, per-beat subdivision split
- Keyboard shortcuts —
  - `1–9, 0` place instruments (hi-hat/snare/kick/…)
  - `>` `g` `f` `r` `!` articulations
  - `Shift+R` / `Shift+L` sticking
  - `⌥1/2/3/4/6/8` beat subdivision
  - `⌘←/→` previous / next bar
  - `⌘Z` / `⇧⌘Z` per-document undo/redo (50-step history)
- Source mode with live `.drumtab` diagnostics
- Hover/click shortcut cheat-sheet popover (no permanent panel)

### Workspace

- Multi-document workspace with import / export (`.drumtab`)
- `.mid` export — SMF Type 0, PPQ 480, channel 10, tempo + time signature
  meta-events
- localStorage-backed workspace (v3), round-trips UI state (sidebar /
  editor collapsed) on top of documents

### Layout

- Single-screen desktop layout (no page scroll)
- Collapsible sidebar + collapsible editor; collapsed editor = read-only
  mode with Preview filling the screen
- Discoverable collapse controls — pin button, title chevron, clickable
  splitter strips between panels

### Tooling

- Bun + Vite + React 19 + TypeScript 6 + Tailwind v4
- Vitest unit-test suite — parser, layout, serializer, renderer,
  scheduler, controller, storage, undo/redo, MIDI export (200+ tests)
- ESLint + Prettier; strict React 19 hook rules

[Unreleased]: https://github.com/W-Mai/Drumit/compare/v2026.04.29.11...HEAD
[2026.04.29.11]: https://github.com/W-Mai/Drumit/compare/v2026.04.29.10...v2026.04.29.11
[2026.04.29.10]: https://github.com/W-Mai/Drumit/compare/v2026.04.29.9...v2026.04.29.10
[2026.04.29.9]: https://github.com/W-Mai/Drumit/compare/v2026.04.29.8...v2026.04.29.9
[2026.04.29.8]: https://github.com/W-Mai/Drumit/compare/v2026.04.29.7...v2026.04.29.8
[2026.04.29.7]: https://github.com/W-Mai/Drumit/compare/v2026.04.29.6...v2026.04.29.7
[2026.04.29.6]: https://github.com/W-Mai/Drumit/compare/v2026.04.29.5...v2026.04.29.6
[2026.04.29.5]: https://github.com/W-Mai/Drumit/compare/v2026.04.29.4...v2026.04.29.5
[2026.04.29.4]: https://github.com/W-Mai/Drumit/compare/v2026.04.29.3...v2026.04.29.4
[2026.04.29.3]: https://github.com/W-Mai/Drumit/compare/v2026.04.29.2...v2026.04.29.3
[2026.04.29.2]: https://github.com/W-Mai/Drumit/compare/v2026.04.29.1...v2026.04.29.2
[2026.04.29.1]: https://github.com/W-Mai/Drumit/compare/v2026.04.29...v2026.04.29.1
[2026.04.29]: https://github.com/W-Mai/Drumit/releases/tag/v2026.04.29
