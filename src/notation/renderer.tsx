import { Fragment } from "react";
import type { LaidOutBar, LaidOutHit, LaidOutLayout } from "./layout";
import type { Hit } from "./types";
import { instrumentSizeScale } from "./instruments";

interface Props {
  layout: LaidOutLayout;
  showLabels: boolean;
  selectedBarIndex?: number | null;
  onSelectBar?: (index: number) => void;
}

export function DrumChart({
  layout,
  showLabels,
  selectedBarIndex,
  onSelectBar,
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

      <text x={18} y={20} className="fill-stone-900 text-[14px] font-bold">
        {layout.title}
      </text>
      <text
        x={layout.width - 18}
        y={20}
        textAnchor="end"
        className="fill-stone-500 text-[11px]"
      >
        {[layout.meter, layout.tempo].filter(Boolean).join("   ")}
      </text>

      {layout.sectionHeaders.map((header, i) => (
        <text
          key={`section-${i}`}
          x={18}
          y={header.y}
          className="fill-stone-900 text-[13px] font-extrabold tracking-wide"
        >
          [{header.label}]
        </text>
      ))}

      {layout.rows.flatMap((row) =>
        row.map((bar) => (
          <BarView
            key={`bar-${bar.index}`}
            bar={bar}
            showLabels={showLabels}
            selected={selectedBarIndex === bar.index - 1}
            onSelect={onSelectBar ? () => onSelectBar(bar.index - 1) : undefined}
          />
        )),
      )}
    </svg>
  );
}

function BarView({
  bar,
  showLabels,
  selected,
  onSelect,
}: {
  bar: LaidOutBar;
  showLabels: boolean;
  selected?: boolean;
  onSelect?: () => void;
}) {
  const { x, y, width, cymbalY, drumY, beats } = bar;

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
        height={drumY - y + 28}
        rx={8}
        className={
          selected
            ? "fill-amber-200/60 stroke-amber-500"
            : "fill-transparent stroke-transparent hover:fill-stone-200/40"
        }
        strokeWidth={selected ? 1.5 : 0}
      />

      <text
        x={x}
        y={y + 10}
        className="fill-stone-500 text-[10px] font-semibold"
      >
        {bar.index}
        {bar.repeatCount > 1 ? ` · ×${bar.repeatCount}` : ""}
      </text>

      {showLabels ? (
        <>
          <text
            x={x - 6}
            y={cymbalY + 4}
            textAnchor="end"
            className="fill-stone-400 text-[10px] font-semibold"
          >
            Cym
          </text>
          <text
            x={x - 6}
            y={drumY + 4}
            textAnchor="end"
            className="fill-stone-400 text-[10px] font-semibold"
          >
            Drum
          </text>
        </>
      ) : null}

      <line
        x1={x}
        x2={x}
        y1={cymbalY - 8}
        y2={drumY + 24}
        className="stroke-stone-400"
        strokeWidth={1.2}
      />
      <line
        x1={x + width}
        x2={x + width}
        y1={cymbalY - 8}
        y2={drumY + 24}
        className="stroke-stone-400"
        strokeWidth={1.2}
      />

      {bar.repeatPrevious ? (
        <text
          x={x + width / 2}
          y={y + 46}
          textAnchor="middle"
          className="fill-stone-700 text-[40px] font-black"
        >
          ∕
        </text>
      ) : (
        <>
          {beats.map((beat) =>
            beat.lanes.map((lane, laneIdx) => (
              <Fragment key={`lane-${bar.index}-${beat.index}-${laneIdx}`}>
                {lane.beamSegments.map((segment, i) =>
                  Array.from({ length: lane.beamDepth }, (__, depthIdx) => (
                    <line
                      key={`beam-${i}-${depthIdx}`}
                      x1={segment.x1}
                      x2={segment.x2}
                      y1={lane.beamY + depthIdx * 3}
                      y2={lane.beamY + depthIdx * 3}
                      className="stroke-stone-700"
                      strokeWidth={1}
                    />
                  )),
                )}
                {lane.tuplet ? (
                  <text
                    x={
                      (lane.tickXs[0] + lane.tickXs[lane.tickXs.length - 1]) / 2
                    }
                    y={lane.beamY + lane.beamDepth * 3 + 10}
                    textAnchor="middle"
                    className="fill-stone-700 text-[9px] font-extrabold"
                  >
                    {lane.tuplet}
                  </text>
                ) : null}
              </Fragment>
            )),
          )}

          {bar.hits.map((laid, i) => (
            <HitGlyph key={`hit-${i}`} laid={laid} />
          ))}
        </>
      )}
    </g>
  );
}

function HitGlyph({ laid }: { laid: LaidOutHit }) {
  const { hit, x, y } = laid;
  const size = 5.5 * (instrumentSizeScale[hit.instrument] ?? 1);
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
    return (
      <text
        x={x}
        y={y + size}
        textAnchor="middle"
        className="fill-stone-900 font-bold"
        style={{ fontSize: "15px", fontFamily: "Georgia, serif" }}
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
    // "\" stroke: from upper-right to lower-left.
    return (
      <line
        x1={x + size}
        y1={y - size}
        x2={x - size}
        y2={y + size}
        className="stroke-stone-900"
        strokeWidth={2}
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
          strokeWidth={1.6}
          strokeLinecap="round"
        />
        <path
          d={`M ${x - size} ${y - size} L ${x + size} ${y + size} M ${x + size} ${y - size} L ${x - size} ${y + size}`}
          className="fill-none stroke-stone-900"
          strokeWidth={1.8}
          strokeLinecap="round"
        />
      </g>
    );
  }
  return <circle cx={x} cy={y} r={size} className="fill-stone-900" />;
}
