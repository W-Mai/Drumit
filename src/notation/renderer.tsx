import { Fragment } from "react";
import type { LaidOutBar, LaidOutHit, LaidOutLayout, RowGroup } from "./layout";
import type { Hit } from "./types";
import { instrumentSizeScale } from "./instruments";
import { cn } from "../lib/utils";

function navigationLabel(nav: import("./types").NavigationMarker): string {
  switch (nav.kind) {
    case "segno":
      return "𝄋";
    case "coda":
      return "𝄌";
    case "toCoda":
      return "To Coda";
    case "fine":
      return "Fine";
    case "dc":
      return nav.target === "fine"
        ? "D.C. al Fine"
        : nav.target === "coda"
          ? "D.C. al Coda"
          : "D.C.";
    case "ds":
      return nav.target === "fine"
        ? "D.S. al Fine"
        : nav.target === "coda"
          ? "D.S. al Coda"
          : "D.S.";
  }
}

const PLAYHEAD_PALETTE: Record<
  "synth" | "sample" | "midi",
  { bar: string; beat: string }
> = {
  synth: {
    bar: "fill-emerald-100/70 stroke-emerald-500",
    beat: "fill-emerald-300/40",
  },
  sample: {
    bar: "fill-sky-100/70 stroke-sky-500",
    beat: "fill-sky-300/40",
  },
  midi: {
    bar: "fill-rose-100/70 stroke-rose-500",
    beat: "fill-rose-300/40",
  },
};

function rowGroupLabel(g: RowGroup): string {
  switch (g) {
    case "cymbals":
      return "Cymbal";
    case "toms":
      return "Tom";
    case "snare":
      return "Snare";
    case "kick":
      return "Kick";
  }
}

interface Props {
  layout: LaidOutLayout;
  showLabels: boolean;
  selectedBarIndex?: number | null;
  selectionEnd?: number | null;
  onSelectBar?: (index: number, shiftKey?: boolean) => void;
  playCursor?: { barIndex: number; beatIndex: number } | null;
  playheadEngine?: "synth" | "sample" | "midi";
  /**
   * Which pass of a repeated bar is currently playing, used to draw
   * a `×N/M` badge on the active playhead bar. Only meaningful when
   * `total > 1`; callers should not pass it in the expanded view
   * (every bar there is unique).
   */
  repeatPass?: { pass: number; total: number } | null;
}

export function DrumChart({
  layout,
  showLabels,
  selectedBarIndex,
  selectionEnd,
  onSelectBar,
  playCursor,
  playheadEngine = "synth",
  repeatPass,
}: Props) {
  const selectionLo =
    selectedBarIndex === null || selectedBarIndex === undefined
      ? null
      : Math.min(selectedBarIndex, selectionEnd ?? selectedBarIndex);
  const selectionHi =
    selectedBarIndex === null || selectedBarIndex === undefined
      ? null
      : Math.max(selectedBarIndex, selectionEnd ?? selectedBarIndex);
  return (
    <svg
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      className="h-auto w-full"
      role="img"
      aria-label="Drum chart"
    >
      <rect
        x={0}
        y={0}
        width={layout.width}
        height={layout.height}
        rx={16}
        className="fill-stone-50"
      />

      {/* Header band: title + metadata, divider underneath */}
      <g>
        <text
          x={24}
          y={22}
          className="fill-stone-900 text-[16px] font-bold"
        >
          {layout.title}
        </text>
        {layout.artist ? (
          <text
            x={24}
            y={38}
            className="fill-stone-500 text-[11px] italic"
          >
            {layout.artist}
          </text>
        ) : null}
        <text
          x={layout.width - 24}
          y={22}
          textAnchor="end"
          className="fill-stone-500 text-[11px] font-semibold tabular-nums"
        >
          {[layout.meter, layout.tempo].filter(Boolean).join("   ")}
        </text>
        <line
          x1={24}
          x2={layout.width - 24}
          y1={44}
          y2={44}
          className="stroke-stone-300"
          strokeWidth={1}
        />
      </g>

      {/* Section headers: pill-style label + thin underline */}
      {layout.sectionHeaders.map((header, i) => (
        <g key={`section-${i}`}>
          <rect
            x={20}
            y={header.y - 14}
            width={Math.max(44, header.label.length * 9 + 20)}
            height={20}
            rx={6}
            className="fill-stone-900"
          />
          <text
            x={30}
            y={header.y}
            className="fill-amber-100 text-[12px] font-extrabold tracking-wider"
          >
            {header.label.toUpperCase()}
          </text>
        </g>
      ))}

      {(() => {
        if (!playCursor) return null;
        const bar = layout.rows
          .flat()
          .find((b) => b.index - 1 === playCursor.barIndex);
        if (!bar) return null;
        const beat = bar.beats[playCursor.beatIndex];
        if (!beat) return null;
        const palette = PLAYHEAD_PALETTE[playheadEngine];
        const y = bar.y + 8;
        const height = bar.rowMaxHeight - 16;
        const REF_W = 10;
        const scaleX = (beat.width + 2) / REF_W;
        return (
          <rect
            x={0}
            y={0}
            width={REF_W}
            height={height}
            className={cn(
              "pointer-events-none transition-transform duration-[60ms] ease-linear",
              palette.beat,
            )}
            style={{
              transformOrigin: "0 0",
              transform: `translate(${beat.x - 1}px, ${y}px) scaleX(${scaleX})`,
            }}
            data-beat-rect="playhead-global"
          />
        );
      })()}

      {layout.rows.flatMap((row) =>
        row.map((bar, indexInRow) => {
          const globalIdx = bar.index - 1;
          const isPlayhead = playCursor?.barIndex === globalIdx;
          return (
            <BarView
              key={`bar-${bar.index}`}
              bar={bar}
              showLabels={showLabels}
              isRowStart={indexInRow === 0}
              selected={
                selectionLo !== null &&
                selectionHi !== null &&
                globalIdx >= selectionLo &&
                globalIdx <= selectionHi
              }
              isPlayhead={isPlayhead}
              playheadEngine={playheadEngine}
              repeatPass={isPlayhead ? repeatPass : null}
              onSelect={
                onSelectBar
                  ? (shiftKey) => onSelectBar(globalIdx, shiftKey)
                  : undefined
              }
            />
          );
        }),
      )}
    </svg>
  );
}

function BarView({
  bar,
  showLabels,
  isRowStart,
  selected,
  isPlayhead,
  playheadEngine = "synth",
  repeatPass,
  onSelect,
}: {
  bar: LaidOutBar;
  showLabels: boolean;
  isRowStart?: boolean;
  selected?: boolean;
  isPlayhead?: boolean;
  playheadEngine?: "synth" | "sample" | "midi";
  repeatPass?: { pass: number; total: number } | null;
  onSelect?: (shiftKey: boolean) => void;
}) {
  const { x, y, width, rowMaxHeight, rowGroups, rowY, beats } = bar;
  const height = rowMaxHeight;
  const firstRowY = rowY[rowGroups[0]] ?? y + 20;
  const lastRowY = rowY[rowGroups[rowGroups.length - 1]] ?? firstRowY;
  const barlineTop = firstRowY - 12;
  const barlineBottom = lastRowY + 24;
  const playhead = PLAYHEAD_PALETTE[playheadEngine];

  return (
    <g
      onClick={onSelect ? (e) => onSelect(e.shiftKey) : undefined}
      style={onSelect ? { cursor: "pointer" } : undefined}
      data-bar-index={bar.index - 1}
    >
      <rect
        x={x}
        y={y + 2}
        width={width}
        height={height - 4}
        rx={4}
        className={cn(
          "transition-[fill,stroke] duration-150 ease-out",
          isPlayhead
            ? playhead.bar
            : selected
              ? "fill-amber-200/60 stroke-amber-500"
              : "fill-transparent stroke-transparent hover:fill-stone-200/40",
        )}
        strokeWidth={isPlayhead || selected ? 1.5 : 0}
        data-bar-highlight="true"
      />



      {/* "×pass/total" badge on the active bar when it's a repeat that
          plays more than once. Placed on the right of the bar header
          band (same horizontal strip as the bar.index label on the
          left) so it doesn't overlap the note rows that start below. */}
      {isPlayhead && repeatPass && repeatPass.total > 1 ? (
        <g data-transient-badge="pass">
          <rect
            x={x + width - 30}
            y={y}
            width={30}
            height={14}
            rx={3}
            fill="#1c1917"
          />
          <text
            x={x + width - 15}
            y={y + 10}
            textAnchor="middle"
            fill="#fde68a"
            fontSize={9}
            fontWeight={700}
            className="tabular-nums"
          >
            ×{repeatPass.pass}/{repeatPass.total}
          </text>
        </g>
      ) : null}

      {/* Per-beat invisible overlays so embedded players can highlight the
          current beat by index. These are `data-beat-rect` rects the
          exporter can target; in the live app they're transparent. */}
      {beats.map((b, i) => (
        <rect
          key={`beat-overlay-${i}`}
          x={b.x - 1}
          y={barlineTop}
          width={b.width + 2}
          height={barlineBottom - barlineTop}
          className="fill-transparent"
          data-beat-rect="true"
          data-beat-index={i}
        />
      ))}

      <text
        x={x}
        y={y + 10}
        className="fill-stone-500 text-[10px] font-semibold"
      >
        {bar.index}
        {bar.repeatCount > 1 ? ` · ×${bar.repeatCount}` : ""}
      </text>

      {showLabels && isRowStart
        ? (() => {
            // Group labels share a y coordinate when layout packed multiple
            // row groups onto the same visual row (e.g. snare + kick when
            // they never collide). Collapse each y into a single label so
            // "Snare" and "Kick" don't overlap as "SKaicke".
            const byY = new Map<number, RowGroup[]>();
            for (const g of rowGroups) {
              const ry = rowY[g];
              if (ry === undefined) continue;
              const list = byY.get(ry);
              if (list) list.push(g);
              else byY.set(ry, [g]);
            }
            return [...byY.entries()].map(([ry, groups]) => (
              <text
                key={groups.join("+")}
                x={x - 6}
                y={ry + 4}
                textAnchor="end"
                className="fill-stone-400 text-[9px] font-semibold"
              >
                {groups.map(rowGroupLabel).join(" / ")}
              </text>
            ));
          })()
        : null}

      {/* Opening barline. `|:` draws a thick bar + a thin one + two dots. */}
      {bar.repeatStart ? (
        <>
          <line
            x1={x - 4}
            x2={x - 4}
            y1={barlineTop}
            y2={barlineBottom}
            className="stroke-stone-700"
            strokeWidth={3}
          />
          <line
            x1={x}
            x2={x}
            y1={barlineTop}
            y2={barlineBottom}
            className="stroke-stone-700"
            strokeWidth={1}
          />
          <circle
            cx={x + 5}
            cy={(barlineTop + barlineBottom) / 2 - 5}
            r={2}
            className="fill-stone-700"
          />
          <circle
            cx={x + 5}
            cy={(barlineTop + barlineBottom) / 2 + 5}
            r={2}
            className="fill-stone-700"
          />
        </>
      ) : (
        <line
          x1={x}
          x2={x}
          y1={barlineTop}
          y2={barlineBottom}
          className="stroke-stone-400"
          strokeWidth={1.2}
        />
      )}

      {/* Closing barline. `:|` mirrors `|:`. */}
      {bar.repeatEnd ? (
        <>
          <circle
            cx={x + width - 5}
            cy={(barlineTop + barlineBottom) / 2 - 5}
            r={2}
            className="fill-stone-700"
          />
          <circle
            cx={x + width - 5}
            cy={(barlineTop + barlineBottom) / 2 + 5}
            r={2}
            className="fill-stone-700"
          />
          <line
            x1={x + width}
            x2={x + width}
            y1={barlineTop}
            y2={barlineBottom}
            className="stroke-stone-700"
            strokeWidth={1}
          />
          <line
            x1={x + width + 4}
            x2={x + width + 4}
            y1={barlineTop}
            y2={barlineBottom}
            className="stroke-stone-700"
            strokeWidth={3}
          />
          {bar.repeatEnd.times > 2 ? (
            <text
              x={x + width - 4}
              y={barlineTop - 6}
              textAnchor="end"
              className="fill-stone-700 text-[10px] font-extrabold"
            >
              ×{bar.repeatEnd.times}
            </text>
          ) : null}
        </>
      ) : (
        <line
          x1={x + width}
          x2={x + width}
          y1={barlineTop}
          y2={barlineBottom}
          className="stroke-stone-400"
          strokeWidth={1.2}
        />
      )}

      {/* First / second ending bracket */}
      {bar.ending ? (
        <>
          <line
            x1={x}
            x2={x + width}
            y1={barlineTop - 14}
            y2={barlineTop - 14}
            className="stroke-stone-700"
            strokeWidth={1}
          />
          <line
            x1={x}
            x2={x}
            y1={barlineTop - 14}
            y2={barlineTop - 6}
            className="stroke-stone-700"
            strokeWidth={1}
          />
          <text
            x={x + 5}
            y={barlineTop - 6}
            className="fill-stone-700 text-[10px] font-extrabold"
          >
            {bar.ending}.
          </text>
        </>
      ) : null}

      {/* Navigation marker (Segno / Coda / To Coda / Fine / D.C. / D.S.) */}
      {bar.navigation ? (
        <text
          x={x + width / 2}
          y={barlineTop - 18}
          textAnchor="middle"
          className="fill-stone-700 text-[10px] font-bold italic"
        >
          {navigationLabel(bar.navigation)}
        </text>
      ) : null}

      {bar.repeatPrevious ? (
        <text
          x={x + width / 2}
          y={(firstRowY + lastRowY) / 2 + 14}
          textAnchor="middle"
          className="fill-stone-700 text-[40px] font-black"
        >
          ∕
        </text>
      ) : bar.hits.length === 0 ? (
        <text
          x={x + width / 2}
          y={(firstRowY + lastRowY) / 2 + 8}
          textAnchor="middle"
          className="fill-stone-400 text-[28px] font-semibold"
        >
          ∅
        </text>
      ) : (
        <>
          {beats.map((beat) => {
            // For each tuplet, find the deepest beam on the same rowGroup
            // and embed the number into it: the beam line splits around the
            // number and the glyph sits on the beam's baseline.
            const tupletByRow = new Map<
              string,
              { number: number; x: number }
            >();
            for (const t of beat.tuplets) {
              const existing = tupletByRow.get(t.rowGroup);
              // Prefer the first one per row (they're emitted bottom-up).
              if (!existing) tupletByRow.set(t.rowGroup, t);
            }

            // Per-row y range of all beams — the tuplet number is
            // vertically centered across all beams on that row (1, 2, 3 or
            // more stacked lines).
            const rowYRange = new Map<
              string,
              { minY: number; maxY: number }
            >();
            beat.beams.forEach((b) => {
              const cur = rowYRange.get(b.rowGroup);
              if (!cur) rowYRange.set(b.rowGroup, { minY: b.y, maxY: b.y });
              else {
                cur.minY = Math.min(cur.minY, b.y);
                cur.maxY = Math.max(cur.maxY, b.y);
              }
            });

            const GAP_HALF = 5.5; // px — half width of the notch around the number
            const rowsWithTuplet = new Set(tupletByRow.keys());

            return (
              <Fragment key={`beat-${bar.index}-${beat.index}`}>
                {beat.beams.map((b, i) => {
                  const t = tupletByRow.get(b.rowGroup);
                  const rowHasTuplet = rowsWithTuplet.has(b.rowGroup);
                  if (!rowHasTuplet || !t) {
                    return (
                      <line
                        key={`beam-${i}`}
                        x1={b.x1}
                        x2={b.x2}
                        y1={b.y}
                        y2={b.y}
                        className="stroke-stone-700"
                        strokeWidth={1}
                      />
                    );
                  }
                  // Notch around the number so every beam on this row
                  // clears the digit.
                  const left = Math.min(t.x - GAP_HALF, b.x2);
                  const right = Math.max(t.x + GAP_HALF, b.x1);
                  return (
                    <Fragment key={`beam-${i}`}>
                      {left > b.x1 ? (
                        <line
                          x1={b.x1}
                          x2={left}
                          y1={b.y}
                          y2={b.y}
                          className="stroke-stone-700"
                          strokeWidth={1}
                        />
                      ) : null}
                      {right < b.x2 ? (
                        <line
                          x1={right}
                          x2={b.x2}
                          y1={b.y}
                          y2={b.y}
                          className="stroke-stone-700"
                          strokeWidth={1}
                        />
                      ) : null}
                    </Fragment>
                  );
                })}
                {/* Draw each tuplet number once, vertically centered
                    across all beams on that row. */}
                {Array.from(tupletByRow.entries()).map(([rowGroup, t]) => {
                  const range = rowYRange.get(rowGroup);
                  if (!range) return null;
                  const centerY = (range.minY + range.maxY) / 2;
                  return (
                    <text
                      key={`tuplet-${rowGroup}`}
                      x={t.x}
                      y={centerY}
                      textAnchor="middle"
                      dominantBaseline="central"
                      className="fill-stone-700 text-[9px] font-extrabold"
                    >
                      {t.number}
                    </text>
                  );
                })}
                {/* Tuplets without any beam on their row get the fallback label. */}
                {beat.tuplets
                  .filter((t) => !rowYRange.has(t.rowGroup))
                  .map((t, li) => (
                    <text
                      key={`tuplet-fallback-${li}`}
                      x={t.x}
                      y={t.y}
                      textAnchor="middle"
                      className="fill-stone-700 text-[9px] font-extrabold"
                    >
                      {t.number}
                    </text>
                  ))}
              </Fragment>
            );
          })}

          {bar.hits.map((laid, i) => (
            <HitGlyph key={`hit-${i}`} laid={laid} />
          ))}
        </>
      )}
    </g>
  );
}

/**
 * Base hit-glyph size in px. Kept constant across the whole score so the
 * notation reads like a traditional drum chart — density differences show
 * up as variable bar widths, not variable note-head sizes.
 */
const HIT_BASE_SIZE = 4.5;

function HitGlyph({ laid }: { laid: LaidOutHit }) {
  const { hit, x, y } = laid;
  const scale = instrumentSizeScale[hit.instrument] ?? 1;
  const size = HIT_BASE_SIZE * scale;
  const isFlam = hit.articulations.includes("flam");
  const isGhost = hit.articulations.includes("ghost");
  const isRoll = hit.articulations.includes("roll");
  const isChoke = hit.articulations.includes("choke");
  const isAccent = hit.articulations.includes("accent");

  return (
    <g>
      {/* Flam grace note: a smaller head ~30% size to the upper-left of the
          main head, with a thin slash connecting them. Drawn first so the
          main head sits on top if they visually overlap. */}
      {isFlam ? (
        <>
          <HitHead
            hit={hit}
            x={x - size * 1.8}
            y={y - size * 1.1}
            size={size * 0.55}
          />
          <path
            d={`M ${x - size * 2.4} ${y + size * 0.4} L ${x - size * 0.8} ${y - size * 1.6}`}
            className="fill-none stroke-stone-700"
            strokeWidth={strokeForSize(size) * 0.75}
            strokeLinecap="round"
          />
        </>
      ) : null}

      {/* Ghost note: draw rounded-rectangle brackets as paths so they hug
          the head at a consistent baseline, regardless of font metrics. */}
      {isGhost ? (
        <>
          <path
            d={`M ${x - size * 1.8} ${y - size * 1.2} q ${-size * 0.6} ${size * 1.2} 0 ${size * 2.4}`}
            className="fill-none stroke-stone-600"
            strokeWidth={strokeForSize(size) * 0.8}
            strokeLinecap="round"
          />
          <path
            d={`M ${x + size * 1.8} ${y - size * 1.2} q ${size * 0.6} ${size * 1.2} 0 ${size * 2.4}`}
            className="fill-none stroke-stone-600"
            strokeWidth={strokeForSize(size) * 0.8}
            strokeLinecap="round"
          />
        </>
      ) : null}

      <HitHead hit={hit} x={x} y={y} size={size} />

      {/* Augmentation dots to the right of the head. */}
      {hit.dots && hit.dots > 0
        ? Array.from({ length: Math.min(2, hit.dots) }).map((_, i) => (
            <circle
              key={`aug-${i}`}
              cx={x + size + 3 + i * 4}
              cy={y}
              r={1.6}
              className="fill-stone-900"
            />
          ))
        : null}

      {/* Accent: wedge `>` above the head. */}
      {isAccent ? (
        <path
          d={`M ${x - 6} ${y - 14} L ${x + 6} ${y - 10} L ${x - 6} ${y - 6}`}
          className="fill-none stroke-stone-900"
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}

      {/* Roll: two parallel tremolo slashes above the head — standard
          drum-roll notation. If accented, shift up so the `>` sits below
          the slashes. */}
      {isRoll
        ? (() => {
            const baseY = isAccent ? y - 18 : y - 12;
            return (
              <g>
                <path
                  d={`M ${x - 4} ${baseY} L ${x + 4} ${baseY - 4}`}
                  className="fill-none stroke-stone-900"
                  strokeWidth={1.6}
                  strokeLinecap="round"
                />
                <path
                  d={`M ${x - 4} ${baseY - 4} L ${x + 4} ${baseY - 8}`}
                  className="fill-none stroke-stone-900"
                  strokeWidth={1.6}
                  strokeLinecap="round"
                />
              </g>
            );
          })()
        : null}

      {/* Choke / dampen: a small `+` above the head, standard cymbal
          choke notation. */}
      {isChoke ? (
        <g>
          <path
            d={`M ${x - 3.5} ${y - 13} L ${x + 3.5} ${y - 13}`}
            className="fill-none stroke-stone-900"
            strokeWidth={1.4}
            strokeLinecap="round"
          />
          <path
            d={`M ${x} ${y - 16.5} L ${x} ${y - 9.5}`}
            className="fill-none stroke-stone-900"
            strokeWidth={1.4}
            strokeLinecap="round"
          />
        </g>
      ) : null}

      {hit.sticking ? (
        <text
          x={x}
          y={y - 12}
          textAnchor="middle"
          className="fill-stone-500 text-[9px] font-bold"
        >
          {hit.sticking}
        </text>
      ) : null}
    </g>
  );
}

/**
 * Single source of truth for head stroke width — derived from the
 * glyph's own `size` so small / large heads stay visually balanced.
 * Clamped to [1.2, 1.9] so it never goes hairline or heavy.
 */
function strokeForSize(size: number): number {
  return Math.max(1.2, Math.min(1.9, size * 0.32));
}

function HitHead({
  hit,
  x,
  y,
  size,
}: {
  hit: Hit;
  x: number;
  y: number;
  size: number;
}) {
  const sw = strokeForSize(size);

  if (hit.head === "x") {
    return (
      <path
        d={`M ${x - size} ${y - size} L ${x + size} ${y + size} M ${x + size} ${y - size} L ${x - size} ${y + size}`}
        className="fill-none stroke-stone-900"
        strokeWidth={sw}
        strokeLinecap="round"
      />
    );
  }
  if (hit.head === "partial") {
    // Hand-drawn jianpu convention uses a ∂ glyph. Size it a touch under
    // the other heads' optical weight so it doesn't dominate a row.
    const fontSize = Math.max(9, size * 2.4);
    return (
      <text
        x={x}
        y={y + size * 0.9}
        textAnchor="middle"
        className="fill-stone-900 font-bold"
        style={{
          fontSize: `${fontSize}px`,
          fontFamily: "Georgia, serif",
          dominantBaseline: "alphabetic",
        }}
      >
        ∂
      </text>
    );
  }
  if (hit.head === "open") {
    return (
      <circle
        cx={x}
        cy={y}
        r={size}
        className="fill-stone-50 stroke-stone-900"
        strokeWidth={sw}
      />
    );
  }
  if (hit.head === "slash") {
    return (
      <line
        x1={x + size}
        y1={y - size}
        x2={x - size}
        y2={y + size}
        className="stroke-stone-900"
        strokeWidth={sw}
        strokeLinecap="round"
      />
    );
  }
  if (hit.head === "stickX") {
    // Vertical stem above, × head below — crash / splash convention:
    //   |
    //   ×
    const stemH = size * 1.8;
    return (
      <g>
        <line
          x1={x}
          y1={y - size - stemH}
          x2={x}
          y2={y - size + 1}
          className="stroke-stone-900"
          strokeWidth={sw}
          strokeLinecap="round"
        />
        <path
          d={`M ${x - size} ${y - size} L ${x + size} ${y + size} M ${x + size} ${y - size} L ${x - size} ${y + size}`}
          className="fill-none stroke-stone-900"
          strokeWidth={sw}
          strokeLinecap="round"
        />
      </g>
    );
  }
  return <circle cx={x} cy={y} r={size} className="fill-stone-900" />;
}
