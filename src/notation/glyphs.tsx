// Hand-drawn music symbols that aren't reliably covered by system
// fonts. Used in both Drumit and Staff views. Every glyph is centered
// on (cx, cy) and sized so `size` roughly matches the em-box the
// Unicode version would occupy.

interface GlyphProps {
  cx: number;
  cy: number;
  size: number;
  className?: string;
}

/**
 * Segno — italic S drawn as two cubic Béziers (top bowl turning left,
 * bottom bowl turning right), an angled slash crossing the glyph, and
 * two dots in the opposite quadrants. Path points are tuned on the
 * `size` scale to match Bravura's visual proportions.
 */
export function SegnoGlyph({
  cx,
  cy,
  size,
  className = "fill-stone-700",
}: GlyphProps) {
  // All coordinates below are expressed as fractions of `size` from
  // the center (cx, cy). Chart-height of the S = size.
  const sw = size * 0.14;
  // Two cubic Béziers chained; tweakpoints picked to echo the printed
  // symbol: fat strokes, tilted ~20°, terminals curling back.
  const p = (dx: number, dy: number) =>
    `${cx + size * dx} ${cy + size * dy}`;
  const sPath = [
    `M ${p(0.25, -0.45)}`,
    `C ${p(-0.05, -0.55)} ${p(-0.42, -0.3)} ${p(-0.15, -0.05)}`,
    `C ${p(0.12, 0.2)} ${p(0.42, 0.3)} ${p(0.15, 0.45)}`,
    `C ${p(-0.05, 0.52)} ${p(-0.25, 0.45)} ${p(-0.3, 0.3)}`,
  ].join(" ");
  const slash = size * 0.65;
  const dotR = size * 0.08;
  const dotOff = size * 0.42;
  return (
    <g className={className} data-glyph="segno">
      <path
        d={sPath}
        fill="none"
        stroke="currentColor"
        strokeWidth={sw}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line
        x1={cx - slash}
        y1={cy + slash}
        x2={cx + slash}
        y2={cy - slash}
        stroke="currentColor"
        strokeWidth={sw * 0.85}
        strokeLinecap="round"
      />
      <circle cx={cx - dotOff} cy={cy - dotOff * 0.4} r={dotR} />
      <circle cx={cx + dotOff} cy={cy + dotOff * 0.4} r={dotR} />
    </g>
  );
}

/**
 * Coda — a ring pierced by a horizontal and vertical cross that both
 * extend a bit past the ring. Looks like a telescope reticle.
 */
export function CodaGlyph({
  cx,
  cy,
  size,
  className = "fill-stone-700",
}: GlyphProps) {
  const ringR = size * 0.38;
  const strokeW = size * 0.11;
  const crossExtend = size * 0.52;
  return (
    <g className={className} data-glyph="coda">
      <ellipse
        cx={cx}
        cy={cy}
        rx={ringR}
        ry={ringR * 0.95}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeW}
      />
      <line
        x1={cx}
        y1={cy - crossExtend}
        x2={cx}
        y2={cy + crossExtend}
        stroke="currentColor"
        strokeWidth={strokeW}
        strokeLinecap="round"
      />
      <line
        x1={cx - crossExtend}
        y1={cy}
        x2={cx + crossExtend}
        y2={cy}
        stroke="currentColor"
        strokeWidth={strokeW}
        strokeLinecap="round"
      />
    </g>
  );
}
