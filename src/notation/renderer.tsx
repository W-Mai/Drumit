import { Fragment } from "react";
import type { LaidOutBar, LaidOutHit, LaidOutLayout, RowGroup } from "./layout";
import type { Hit } from "./types";
import { instrumentSizeScale } from "./instruments";

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

function rowGroupLabel(g: RowGroup): string {
  switch (g) {
    case "cymbals":
      return "Cym";
    case "toms":
      return "Tom";
    case "snare":
      return "Sn";
    case "kick":
      return "BD";
  }
}

interface Props {
  layout: LaidOutLayout;
  showLabels: boolean;
  selectedBarIndex?: number | null;
  onSelectBar?: (index: number) => void;
  /** Current playhead position — highlights the active bar (and beat within it). */
  playCursor?: { barIndex: number; beatIndex: number } | null;
}

export function DrumChart({
  layout,
  showLabels,
  selectedBarIndex,
  onSelectBar,
  playCursor,
}: Props) {
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

      {layout.rows.flatMap((row) =>
        row.map((bar) => {
          const globalIdx = bar.index - 1;
          const isPlayhead = playCursor?.barIndex === globalIdx;
          return (
            <BarView
              key={`bar-${bar.index}`}
              bar={bar}
              showLabels={showLabels}
              selected={selectedBarIndex === globalIdx}
              isPlayhead={isPlayhead}
              playBeatIndex={isPlayhead ? playCursor?.beatIndex : undefined}
              onSelect={onSelectBar ? () => onSelectBar(globalIdx) : undefined}
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
  selected,
  isPlayhead,
  playBeatIndex,
  onSelect,
}: {
  bar: LaidOutBar;
  showLabels: boolean;
  selected?: boolean;
  isPlayhead?: boolean;
  playBeatIndex?: number;
  onSelect?: () => void;
}) {
  const { x, y, width, height, rowGroups, rowY, beats } = bar;
  const firstRowY = rowY[rowGroups[0]] ?? y + 20;
  const lastRowY = rowY[rowGroups[rowGroups.length - 1]] ?? firstRowY;
  const barlineTop = firstRowY - 12;
  const barlineBottom = lastRowY + 24;

  return (
    <g
      onClick={onSelect}
      style={onSelect ? { cursor: "pointer" } : undefined}
    >
      {/* Click target + selection highlight */}
      <rect
        x={x - 8}
        y={y + 2}
        width={width + 16}
        height={height - 4}
        rx={8}
        className={
          isPlayhead
            ? "fill-emerald-100/70 stroke-emerald-500"
            : selected
              ? "fill-amber-200/60 stroke-amber-500"
              : "fill-transparent stroke-transparent hover:fill-stone-200/40"
        }
        strokeWidth={isPlayhead || selected ? 1.5 : 0}
      />

      {/* Current-beat vertical playhead line (only when this bar is the playhead). */}
      {isPlayhead && typeof playBeatIndex === "number" && beats[playBeatIndex] ? (
        <rect
          x={beats[playBeatIndex].x - 1}
          y={barlineTop}
          width={beats[playBeatIndex].width + 2}
          height={barlineBottom - barlineTop}
          className="fill-emerald-300/40"
        />
      ) : null}

      <text
        x={x}
        y={y + 10}
        className="fill-stone-500 text-[10px] font-semibold"
      >
        {bar.index}
        {bar.repeatCount > 1 ? ` · ×${bar.repeatCount}` : ""}
      </text>

      {showLabels
        ? rowGroups.map((g) => (
            <text
              key={g}
              x={x - 6}
              y={(rowY[g] ?? firstRowY) + 4}
              textAnchor="end"
              className="fill-stone-400 text-[9px] font-semibold"
            >
              {rowGroupLabel(g)}
            </text>
          ))
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
  return (
    <g>
      {hit.articulations.includes("ghost") ? (
        <>
          <text
            x={x - size * 1.8}
            y={y + size * 0.8}
            className="fill-stone-700 text-[11px] font-black"
            textAnchor="middle"
          >
            (
          </text>
          <text
            x={x + size * 1.2}
            y={y + size * 0.8}
            className="fill-stone-700 text-[11px] font-black"
            textAnchor="middle"
          >
            )
          </text>
        </>
      ) : null}

      <HitHead hit={hit} x={x} y={y} size={size} />

      {hit.articulations.includes("accent") ? (
        <path
          d={`M ${x - 6} ${y - 14} L ${x + 6} ${y - 10} L ${x - 6} ${y - 6}`}
          className="fill-none stroke-stone-900"
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}

      {hit.articulations.includes("roll") ? (
        <path
          d={`M ${x - 8} ${y + 12} q 4 -4 8 0 t 8 0`}
          className="fill-none stroke-stone-900"
          strokeWidth={1.4}
          strokeLinecap="round"
        />
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
  if (hit.head === "x") {
    return (
      <path
        d={`M ${x - size} ${y - size} L ${x + size} ${y + size} M ${x + size} ${y - size} L ${x - size} ${y + size}`}
        className="fill-none stroke-stone-900"
        strokeWidth={1.8}
        strokeLinecap="round"
      />
    );
  }
  if (hit.head === "partial") {
    // ∂ glyph sized roughly 2.2× the base `size` so the shape matches a ×
    // head of the same size in optical weight.
    const fontSize = Math.max(9, size * 2.6);
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
        strokeWidth={1.6}
      />
    );
  }
  if (hit.head === "slash") {
    const sw = Math.max(1.2, Math.min(2, size * 0.35));
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
    const sw = Math.max(1, Math.min(1.8, size * 0.28));
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
