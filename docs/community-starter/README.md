# Drumit Score Bank — Starter Template

A minimal git repository layout for hosting `.drumtab` scores that the
[Drumit](https://github.com/W-Mai/Drumit) web app can browse via its
**Community** feature.

## Files

- `scores/*.drumtab` — your scores. Header keys recognised by Drumit:
  `title`, `artist`, `tempo`, `meter`, `slug`, `composer`, `arranger`,
  `transcriber`, `album`, `source`, `license`, `difficulty`, `style`,
  `techniques`, `changelog`.
- `index.json` — generated. Lists every score with its meta. Drumit reads
  this first to build the browse view.
- `scripts/buildIndex.ts` — Bun script that scans `scores/` and rewrites
  `index.json`.
- `.github/workflows/build-index.yml` — CI that re-runs the script on every
  push to `main` and commits any changes back.

## Setup

1. Click **Use this template** (or copy these files into a fresh repo).
2. Drop your `.drumtab` files into `scores/`. One slug per file.
3. Push to `main`. The CI workflow rebuilds `index.json` and commits it.
4. In Drumit, open **Community → + Add**, enter your `owner/repo`, and your
   scores show up.

## Local index rebuild

```sh
bun install
bun scripts/buildIndex.ts
```

## Slug rules

Slugs must match `^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$`. The build script
fails if two scores share a slug.

## Permissions

The CI workflow needs `contents: write` so it can push the regenerated
`index.json` back to `main`. Default GitHub Actions token has this when
the workflow declares it.
