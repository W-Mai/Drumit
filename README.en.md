# Drumit

> A condensed drum-tab editor.
> Built for **reading while playing**, not for engraving scores.

English · [中文](./README.md)

[![Live demo](https://img.shields.io/badge/demo-W--Mai.github.io/Drumit-111?style=flat-square)](https://w-mai.github.io/Drumit/)
![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)
![React](https://img.shields.io/badge/React-19-61dafb?style=flat-square)
![TypeScript](https://img.shields.io/badge/TypeScript-6-3178c6?style=flat-square)
![Vite](https://img.shields.io/badge/Vite-8-b73bfe?style=flat-square)

## Why

MuseScore and Guitar Pro render drum charts on a five-line staff with
stems, flags, and ledger lines — great for publishing, overkill for a
practice sheet. Drumit renders a two-row layout (cymbals up top, drums
on the bottom), expands to extra rows only when voices collide, and
drops the stems entirely. The result looks like the paper a gigging
drummer would scribble the night before.

The source format is a plain-text `.drumtab` file — diff-able,
copy-pasteable, and round-trippable through the editor.

## Samples

**Basic 8th-note rock beat (动次打次):**

![动次打次](./docs/samples/dong-ci-da-ci.svg)

**Mixed in-beat subdivisions, multi-voice:**

![Mixed subdivisions](./docs/samples/mixed-subdivisions.svg)

**Triplets and sextuplets:**

![Tuplets](./docs/samples/tuplets.svg)

**Repeats with 1st / 2nd endings:**

![Repeats and endings](./docs/samples/repeats-endings.svg)

**Fill with syncopation, flam, ghost, accent:**

![Fill](./docs/samples/fill-articulations.svg)

## Quick start

```bash
bun install
bun run dev      # http://localhost:5173
bun run test
bun run build    # → dist/
bun run samples:generate   # re-render the README svgs
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
| `hh: a / b / c / d` | A lane (hi-hat) with four beats |
| `oo` `oooo` `ooo` | In-beat subdivisions (8ths, 16ths, triplets) |
| `o , x x` | Mixed subdivisions inside a beat (8th + two 16ths) |
| `\|: ... :\| x3` | Repeat three times |
| `... \| [1]` / `... \| [2]` | First / second ending |
| `@segno` `@dc al fine` | Navigation markers |
| `>o` `(o)` `fo` `~o` `o!` | accent / ghost / flam / roll / choke |
| `o/R` `o/L` | Sticking suffix |

Full grammar lives in `src/notation/parser.ts`; worked examples live in
`src/notation/samples/`.

## What's in the box

- **Editor** — click-to-edit bar grid, numeric hotkeys for instruments,
  modifier keys for articulations, per-document undo/redo, Source mode
  for raw `.drumtab` editing
- **Renderer** — beam merging across voices, embedded tuplet numbers,
  repeat dots, D.C. / D.S. / Fine / Coda markings
- **Playback** — Web Audio synth engine and Web MIDI engine
  (look-ahead scheduler in a Worker so background tabs don't drift),
  metronome click, loop-to-bar, live cursor
- **Export** — round-trip `.drumtab` text and Standard MIDI File
  (Type 0, channel 10)
- **Workspace** — multi-document sidebar, `.drumtab` import/export,
  localStorage-backed persistence

The full changelog is in [CHANGELOG.md](./CHANGELOG.md).

## Tech

Bun + Vite + React 19 + TypeScript 6 + Tailwind v4 + Vitest.

## License

[MIT](./LICENSE) © 2026 W-Mai
