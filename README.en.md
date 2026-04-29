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

I'm not a pro drummer. Five-line staves make my eyes glaze over — too
many lines to count, too many glyphs to decode. But I still want to
learn charts and practice.

Drumit's approach: cymbals on one row, drums on another; expand to
extra rows only when voices actually collide; drop the stems. The
source file is a plain-text `.drumtab` — diff-able, copy-pasteable,
PR-able.

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

See [CHANGELOG.md](./CHANGELOG.md) for the full changelog.

## Tech

Bun + Vite + React 19 + TypeScript 6 + Tailwind v4 + Vitest.

## Acknowledgements

Thanks to **Dong Bo** (董波). The two-row compressed notation Drumit uses
— cymbals above, drums below, no stems, one beat split into however many
cells it needs — is exactly what I picked up from him at the Xiaomi
music club. His charts were simple, direct, and easy to read; pick one
up and you could play it. This project is basically an attempt to port
that hand-written feel onto a screen.

## License

[MIT](./LICENSE) © 2026 W-Mai
