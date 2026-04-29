# Changelog

All notable changes to this project are documented here.

Version numbers follow **CalVer** as `YYYY.MM.DD` with git tags prefixed `v`
(e.g. `v2026.04.29`). Multiple releases on the same day get a `.N` suffix
(`v2026.04.29.1`). Bumps happen whenever we publish to the live demo; a
release may include features, fixes, or both.

The format is loosely based on [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

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

[Unreleased]: https://github.com/W-Mai/Drumit/compare/v2026.04.29.1...HEAD
[2026.04.29.1]: https://github.com/W-Mai/Drumit/compare/v2026.04.29...v2026.04.29.1
[2026.04.29]: https://github.com/W-Mai/Drumit/releases/tag/v2026.04.29
