# Drum samples

Files in this directory are loaded by Drumit's `SampleEngine` when
users pick the "Samples (WAV)" playback engine.

## Current set

Source: **Virtuosity Drums** — CC0 1.0 Universal (Public Domain)
https://github.com/sfzinstruments/virtuosity_drums

Performed by Austin McMahon at Virtuosity Musical Instruments, Boston
MA, recorded and packaged by Versilian Studios and Karoryfer Samples
for KVRDC'21. The `lofi` mix-down of that kit was used: one single
medium-velocity (vl3) round-robin per articulation, re-encoded to
OGG Opus 48 kHz mono 64 kbps (≈15 kB per file, ~190 kB total).

Since these are CC0, no attribution is legally required — but
acknowledgement is the right thing to do.

## File map

| Instrument      | File                |
|-----------------|---------------------|
| kick            | `kick.ogg`          |
| snare           | `snare.ogg`         |
| hi-hat closed   | `hihat-closed.ogg`  |
| hi-hat half-open| `hihat-halfopen.ogg`|
| hi-hat open     | `hihat-open.ogg`    |
| hi-hat foot     | `hihat-foot.ogg`    |
| ride            | `ride.ogg`          |
| ride bell       | `ride-bell.ogg`     |
| crash (left)    | `crash-left.ogg`    |
| crash (right)   | `crash-right.ogg`   |
| tom high        | `tom-high.ogg`      |
| tom mid         | `tom-mid.ogg`       |
| floor tom       | `floor-tom.ogg`     |

## Replacing samples

Drop your own `.ogg` (or `.wav` / `.mp3`) files with the matching
names into this folder. SampleEngine tolerates missing files; any
absent file makes just that instrument silent, the rest keep
playing.

## Regenerating

```
bun run samples:fetch
```

Requires `ffmpeg` with `libopus` on PATH. On macOS:

```
brew install ffmpeg
```
