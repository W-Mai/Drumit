# Changelog

All notable changes to this project are documented here.

Version numbers follow **CalVer** as `YYYY.MM.DD` with git tags prefixed `v`
(e.g. `v2026.04.29`). Multiple releases on the same day get a `.N` suffix
(`v2026.04.29.1`). Bumps happen whenever we publish to the live demo; a
release may include features, fixes, or both.

The format is loosely based on [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

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

[Unreleased]: https://github.com/W-Mai/Drumit/compare/v2026.04.29.3...HEAD
[2026.04.29.3]: https://github.com/W-Mai/Drumit/compare/v2026.04.29.2...v2026.04.29.3
[2026.04.29.2]: https://github.com/W-Mai/Drumit/compare/v2026.04.29.1...v2026.04.29.2
[2026.04.29.1]: https://github.com/W-Mai/Drumit/compare/v2026.04.29...v2026.04.29.1
[2026.04.29]: https://github.com/W-Mai/Drumit/releases/tag/v2026.04.29
