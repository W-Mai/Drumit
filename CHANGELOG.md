# Changelog

All notable changes to this project are documented here.

Version numbers follow **CalVer** as `YYYY.MM.DD`, with git tags prefixed `v`
(e.g. `v2026.04.29`). Bumps happen whenever we publish to the live demo; a
CalVer release may include features, fixes, or both.

The format is loosely based on [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

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

[Unreleased]: https://github.com/W-Mai/Drumit/compare/v2026.04.29...HEAD
[2026.04.29]: https://github.com/W-Mai/Drumit/releases/tag/v2026.04.29
