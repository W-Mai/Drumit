import type { Instrument } from "../notation/types";

/**
 * Simple monochrome SVG logos for every instrument. They sit in a 24×24
 * viewBox so the caller can scale freely via Tailwind (e.g. `size-5`).
 */
export function InstrumentIcon({
  instrument,
  className,
}: {
  instrument: Instrument;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {renderShape(instrument)}
    </svg>
  );
}

function renderShape(instrument: Instrument): React.ReactNode {
  switch (instrument) {
    case "kick":
      // Big solid circle, pedal stem at right
      return (
        <>
          <circle cx={10} cy={13} r={7} fill="currentColor" />
          <line x1={17} y1={13} x2={22} y2={17} />
        </>
      );
    case "snare":
      // Shell with × head
      return (
        <>
          <rect x={4} y={9} width={16} height={8} rx={2} />
          <line x1={4} y1={11} x2={20} y2={11} />
          <line x1={4} y1={15} x2={20} y2={15} />
          <line x1={8} y1={6} x2={16} y2={6} />
          <line x1={9} y1={4} x2={15} y2={4} />
        </>
      );
    case "hihatClosed":
      // Two tight cymbals + stem
      return (
        <>
          <ellipse cx={12} cy={8} rx={8} ry={1.8} fill="currentColor" />
          <ellipse cx={12} cy={11} rx={8} ry={1.8} />
          <line x1={12} y1={11} x2={12} y2={20} />
          <line x1={9} y1={20} x2={15} y2={20} />
        </>
      );
    case "hihatOpen":
      // Two cymbals with gap
      return (
        <>
          <ellipse cx={12} cy={7} rx={8} ry={1.8} />
          <ellipse cx={12} cy={13} rx={8} ry={1.8} />
          <line x1={12} y1={13} x2={12} y2={20} />
          <line x1={9} y1={20} x2={15} y2={20} />
        </>
      );
    case "hihatHalfOpen":
      // Two cymbals, small gap, filled top
      return (
        <>
          <ellipse cx={12} cy={8} rx={8} ry={1.8} fill="currentColor" />
          <ellipse cx={12} cy={12} rx={8} ry={1.8} />
          <line x1={12} y1={12} x2={12} y2={20} />
          <line x1={9} y1={20} x2={15} y2={20} />
        </>
      );
    case "hihatFoot":
      // Pedal + small cymbal
      return (
        <>
          <ellipse cx={12} cy={8} rx={7} ry={1.6} />
          <ellipse cx={12} cy={11} rx={7} ry={1.6} fill="currentColor" />
          <line x1={12} y1={11} x2={12} y2={18} />
          <rect x={5} y={18} width={14} height={3} rx={1} fill="currentColor" />
        </>
      );
    case "ride":
      // Large cymbal with bell dot
      return (
        <>
          <ellipse cx={12} cy={10} rx={10} ry={2} />
          <circle cx={12} cy={10} r={1.4} fill="currentColor" />
          <line x1={12} y1={10} x2={12} y2={20} />
          <line x1={9} y1={20} x2={15} y2={20} />
        </>
      );
    case "rideBell":
      // Dome + stem (bell prominent)
      return (
        <>
          <path d="M 5 11 Q 12 2 19 11" fill="currentColor" opacity={0.35} />
          <path d="M 5 11 Q 12 2 19 11" />
          <circle cx={12} cy={8} r={2} fill="currentColor" />
          <line x1={12} y1={11} x2={12} y2={20} />
          <line x1={9} y1={20} x2={15} y2={20} />
        </>
      );
    case "crashLeft":
      // Angled cymbal (tilted left), stem up
      return (
        <>
          <line x1={12} y1={8} x2={12} y2={3} />
          <path d="M 3 13 L 20 8" strokeWidth={2.5} fill="none" />
          <line x1={12} y1={13} x2={12} y2={21} />
        </>
      );
    case "crashRight":
      // Angled cymbal tilted right
      return (
        <>
          <line x1={12} y1={8} x2={12} y2={3} />
          <path d="M 4 8 L 21 13" strokeWidth={2.5} fill="none" />
          <line x1={12} y1={13} x2={12} y2={21} />
        </>
      );
    case "tomHigh":
      // Small drum
      return (
        <>
          <rect x={7} y={9} width={10} height={7} rx={1} />
          <line x1={7} y1={11} x2={17} y2={11} />
          <line x1={7} y1={14} x2={17} y2={14} />
          <circle cx={12} cy={12.5} r={2} fill="currentColor" />
        </>
      );
    case "tomMid":
      // Medium drum
      return (
        <>
          <rect x={5} y={8} width={14} height={9} rx={1.5} />
          <line x1={5} y1={11} x2={19} y2={11} />
          <line x1={5} y1={15} x2={19} y2={15} />
          <circle cx={12} cy={13} r={2.5} fill="currentColor" />
        </>
      );
    case "floorTom":
      // Tall standing drum with legs
      return (
        <>
          <rect x={5} y={5} width={14} height={13} rx={1.5} />
          <line x1={5} y1={9} x2={19} y2={9} />
          <line x1={5} y1={14} x2={19} y2={14} />
          <line x1={7} y1={18} x2={7} y2={22} />
          <line x1={17} y1={18} x2={17} y2={22} />
        </>
      );
  }
}
