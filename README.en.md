# Drumit

> Practice by day, learn charts by night — and dream up grooves in between.
> A drum-tab tool for people who'd rather not squint at a five-line staff.

English · [中文](./README.md)

[![Live demo](https://img.shields.io/badge/demo-W--Mai.github.io/Drumit-111?style=flat-square)](https://w-mai.github.io/Drumit/)
![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)
![React](https://img.shields.io/badge/React-19-61dafb?style=flat-square)
![TypeScript](https://img.shields.io/badge/TypeScript-6-3178c6?style=flat-square)
![Vite](https://img.shields.io/badge/Vite-8-b73bfe?style=flat-square)

## Why

The first wall in learning drums isn't speed — it's the chart.

Five lines on a staff, three kinds of noteheads, stems pointing both
ways — I'd spend ten minutes just *translating* before I could play a
single bar. The more complex the chart, the longer the translation, and
"practice" quietly became "reading comprehension."

Then my teacher Dong Bo gave us a hand-drawn chart that looked nothing
like a staff: cymbals on one row, drums on another, underlines beneath
the notes for subdivisions — one line for eighths, two for sixteenths.
Only ornaments got an extra mark; everything else was clean.
Pick it up and play.

Drumit turns that hand-drawn chart into a tool: the source is a plain
`.drumtab` file you can diff and PR; the rendered chart feels as
intuitive as the original sketch; and you can press Play.

## What it looks like

**Basic 8th-note groove · 动次打次**

![动次打次](./docs/samples/dong-ci-da-ci.svg)

**Mixed in-beat subdivisions + multi-voice**

![mixed subdivisions](./docs/samples/mixed-subdivisions.svg)

**Triplets and sextuplets**

![tuplets](./docs/samples/tuplets.svg)

**Repeats with 1st / 2nd endings**

![repeats](./docs/samples/repeats-endings.svg)

**Fill with every articulation in the book**

![fill](./docs/samples/fill-articulations.svg)

## Run it

```bash
bun install
bun run dev      # http://localhost:5173
bun run test
bun run build    # → dist/
bun run samples:generate   # re-render the svgs in this README
```

Requires [Bun](https://bun.sh) ≥ 1.3.

## `.drumtab` syntax

```drumtab
title: 动次打次
tempo: 100
meter: 4/4

[A]
| hh: oo / oo / oo / oo  bd: o- / -- / o- / --  sn: - / x- / - / x- |
```

| Construct | Meaning |
|---|---|
| `\| ... \|` | One bar |
| `hh: a / b / c / d` | A lane (hi-hat), beats separated by `/` |
| `oo` / `oooo` / `ooo` | Even in-beat subdivisions (8ths, 16ths, triplets) |
| `o , x x` | Mixed subdivisions inside a beat (8th + two 16ths) |
| `\|: ... :\| x3` | Repeat three times |
| `... \| [1]` / `... \| [2]` | First / second ending |
| `@segno` / `@dc al fine` | D.S. / D.C. / Coda / Fine markers |
| `>o` / `(o)` / `fo` / `~o` / `o!` | accent / ghost / flam / roll / choke |
| `o/R` / `o/L` | Sticking (right / left hand) |

Full grammar lives in `src/notation/parser.ts`; more worked examples in
`samples/*.drumtab`.

## What's in the box

- **Editor** — click a cell to place, digit keys to switch instruments,
  modifier keys for ghost / flam / accents; per-document undo / redo;
  Source mode for raw `.drumtab` editing
- **Renderer** — beams merged across voices, tuplet numbers embedded
  mid-beam, repeat dots, D.C. / D.S. / Fine / Coda markings
- **Playback** — built-in Web Audio synth or your MIDI device;
  look-ahead scheduler runs in a Worker so background tabs don't drift;
  metronome, loop, live cursor
- **Export** — SVG, PNG, PDF, static HTML, **playable HTML** (embedded
  Play button, works offline), `.drumtab`, `.mid`
- **Workspace** — multi-document sidebar, `.drumtab` import / export,
  localStorage-backed autosave
- **Works on phones** — layout responds down to 320px; the sidebar becomes a
  drawer and the transport sticks to the bottom. Editing is desktop-only.
- **Two views** — Drumit condensed chart (default) or a five-line staff
  rendering (hand-rolled SVG, zero deps); toggle at the top of the preview.

See [CHANGELOG.md](./CHANGELOG.md) for the full changelog.

## Tech

Bun + Vite + React 19 + TypeScript 6 + Tailwind v4 + Vitest.

## Acknowledgements

**Dong Bo** (董波) — every instinct I have about what a drum chart
should look like traces back to his whiteboard sketches. Cymbals up
top, drums below, underlines for subdivisions, circles and crosses for
instruments. Something that simple made a staff-notation dropout feel,
for the first time, that the chart was written *for him*. Everything
Drumit does is just plugging that whiteboard into electricity.

The bundled drum samples come from
[Virtuosity Drums](https://github.com/sfzinstruments/virtuosity_drums)
(CC0 1.0), performed by Austin McMahon at Virtuosity Musical Instruments
and packaged by Versilian Studios & Karoryfer Samples.

## License

[MIT](./LICENSE) © 2026 W-Mai
