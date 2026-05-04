// SMuFL glyph paths dumped from Bravura.otf (OFL).
// Regenerate with: `bun scripts/dump-smufl-glyphs.ts /tmp/Bravura.otf`.
// Paths are in font-units (em=2048), Y already flipped for SVG.

// Path coordinates are in Bravura font units (upm=1000); vb is in the
// same space so scale = size / vb.h renders at the requested height.
export const SEGNO_ASPECT = 0.69;
export const CODA_ASPECT = 0.91;
export const REPEAT_ASPECT = 1.01;

const SEGNO_PATH =
  "M 135 -665 C 141 -665 148 -663 151 -652 L 153 -645 C 160 -618 175 -559 226 -559 C 267 -559 295 -583 295 -626 C 295 -641 292 -657 287 -673 C 271 -719 204 -736 153 -736 C 83 -736 4 -650 4 -551 C 4 -527 9 -502 20 -477 C 52 -404 197 -315 205 -312 C 209 -310 211 -308 211 -304 C 211 -300 209 -295 205 -288 C 198 -274 54 -15 54 -15 C 52 -11 51 -6 51 -2 C 51 14 63 27 79 27 C 89 27 99 21 104 12 C 104 12 259 -268 262 -274 C 262 -273 270 -279 274 -279 C 289 -276 489 -217 489 -122 C 489 -83 465 -57 431 -52 L 428 -51 C 407 -51 390 -65 390 -96 L 390 -107 C 390 -145 365 -173 337 -173 C 333 -173 329 -172 325 -171 C 288 -162 254 -146 254 -106 C 254 -45 316 8 375 8 C 388 8 402 6 417 1 C 497 -26 550 -91 550 -174 C 550 -183 549 -193 548 -203 C 533 -313 375 -402 363 -408 C 351 -415 346 -419 346 -424 C 346 -426 347 -428 348 -430 C 353 -438 508 -717 508 -717 C 511 -722 512 -726 512 -731 C 512 -747 499 -759 484 -759 C 474 -759 464 -754 459 -745 C 459 -745 300 -458 294 -449 C 291 -444 289 -441 285 -441 C 282 -441 279 -442 275 -444 C 266 -447 115 -505 89 -550 C 83 -561 75 -582 75 -603 C 75 -630 87 -658 129 -665 M 415 -466 C 415 -435 441 -409 472 -409 C 504 -409 529 -435 529 -466 C 529 -498 504 -523 472 -523 C 441 -523 415 -498 415 -466 M 140 -264 C 140 -295 115 -321 83 -321 C 52 -321 26 -295 26 -264 C 26 -232 52 -207 83 -207 C 115 -207 140 -232 140 -264";
const SEGNO_VB = { x: 4, y: -759, w: 546, h: 786 };

const CODA_PATH =
  "M 937 -400 L 818 -400 C 808 -588 668 -739 506 -752 L 506 -881 C 506 -894 495 -898 482 -898 C 469 -898 458 -894 458 -881 L 458 -752 C 296 -739 157 -589 146 -400 L 14 -400 C 0 -400 -4 -389 -4 -376 C -4 -363 0 -352 14 -352 L 146 -352 C 157 -165 296 -13 458 0 L 458 140 C 458 154 469 158 482 158 C 495 158 506 154 506 140 L 506 0 C 668 -13 808 -165 818 -352 L 937 -352 C 951 -352 955 -363 955 -376 C 955 -389 951 -400 937 -400 M 653 -400 L 506 -400 L 506 -696 C 646 -684 653 -562 653 -400 M 458 -696 L 458 -400 L 316 -400 C 316 -562 316 -684 458 -696 M 316 -352 L 458 -352 L 458 -48 C 329 -63 317 -198 316 -352 M 506 -48 L 506 -352 L 653 -352 C 650 -199 631 -63 506 -48";
const CODA_VB = { x: -4, y: -898, w: 959, h: 1056 };

const REPEAT_PATH =
  "M 527 -264 C 530 -268 532 -271 532 -274 C 532 -277 530 -279 526 -279 L 420 -279 C 414 -279 409 -273 402 -264 L 3 236 C 1 238 0 241 0 243 C 0 247 3 250 8 250 L 107 250 C 116 250 123 242 128 236 M 62 -200 C 28 -200 0 -172 0 -137 C 0 -103 28 -75 62 -75 C 97 -75 125 -103 125 -137 C 125 -172 97 -200 62 -200 M 469 49 C 435 49 407 77 407 112 C 407 146 435 174 469 174 C 504 174 532 146 532 112 C 532 77 504 49 469 49";
const REPEAT_VB = { x: 0, y: -279, w: 532, h: 529 };

interface GlyphProps {
  /** Horizontal center of the rendered glyph in SVG coordinates. */
  cx: number;
  /** Baseline Y — aligns with sibling <text y={baselineY}> elements. */
  baselineY: number;
  /** Visual height (px) at which the glyph should render. */
  size: number;
  className?: string;
}

function Glyph({
  cx,
  baselineY,
  size,
  className,
  path,
  vb,
  dataGlyph,
}: GlyphProps & {
  path: string;
  vb: { x: number; y: number; w: number; h: number };
  dataGlyph: string;
}) {
  const scale = size / vb.h;
  // Font-units already y-flipped: font baseline is y=0 in path space.
  // Center the glyph's bbox horizontally on cx, anchor its baseline
  // (y=0) to baselineY, so text + glyph share a single baseline.
  const gx = cx - (vb.x + vb.w / 2) * scale;
  const gy = baselineY;
  return (
    <g
      className={className}
      data-glyph={dataGlyph}
      transform={`translate(${gx.toFixed(2)} ${gy.toFixed(2)}) scale(${scale.toFixed(4)})`}
    >
      <path d={path} fill="currentColor" />
    </g>
  );
}

export function SegnoGlyph(props: GlyphProps) {
  return (
    <Glyph
      {...props}
      className={props.className ?? "fill-stone-700"}
      path={SEGNO_PATH}
      vb={SEGNO_VB}
      dataGlyph="segno"
    />
  );
}

export function CodaGlyph(props: GlyphProps) {
  return (
    <Glyph
      {...props}
      className={props.className ?? "fill-stone-700"}
      path={CODA_PATH}
      vb={CODA_VB}
      dataGlyph="coda"
    />
  );
}

export function MeasureRepeatGlyph(props: GlyphProps) {
  return (
    <Glyph
      {...props}
      className={props.className ?? "fill-stone-900"}
      path={REPEAT_PATH}
      vb={REPEAT_VB}
      dataGlyph="repeat-measure"
    />
  );
}
