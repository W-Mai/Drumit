import { useState } from "react";
import type { Score } from "../notation/types";
import {
  renderScoreToSvgFromDom,
  svgStringToPng,
  wrapSvgInStaticHtml,
  wrapSvgInDynamicHtml,
  printSvgAsPdf,
  triggerDownload,
  filenameStem,
} from "../notation/exporters";
import { exportScoreToMidi } from "../notation/midiExport";
import { serializeScore } from "../notation/serialize";
import { HoverClickPopover } from "./HoverClickPopover";
import { cn } from "../lib/utils";

interface Props {
  score: Score;
  /** Return the currently rendered chart SVG element, or null if there is none. */
  getSvgElement: () => SVGSVGElement | null;
  /** Which view is currently visible. When provided, it's appended to the
   *  export filename (e.g. `chart-staff.svg`) so the two views don't
   *  overwrite each other on disk. */
  viewLabel?: string;
}

type Status = "idle" | "pending" | "error";

function exportError(
  message = "No chart to export — fix parse errors first.",
): Error {
  return new Error(message);
}

/**
 * Dropdown of export actions attached to the Preview panel header.
 * Shares the same hover/click popover UX as the `?` cheat-sheet, so
 * experienced users can hover, and new users can click.
 *
 * All exporters read the already-rendered SVG from the DOM (via
 * `getSvgElement`) rather than re-rendering with `react-dom/server`, so
 * no server runtime is pulled into the client bundle.
 */
export function ExportMenu({ score, getSvgElement, viewLabel }: Props) {
  const [status, setStatus] = useState<Status>("idle");

  function filenameFor(ext: string, includeView = true): string {
    const stem = filenameStem(score.title ?? "chart");
    const suffix = includeView && viewLabel ? `-${viewLabel}` : "";
    return `${stem}${suffix}.${ext}`;
  }

  function getSvg(opts: { keepInteraction?: boolean } = {}): string {
    const el = getSvgElement();
    if (!el) throw exportError();
    return renderScoreToSvgFromDom(el, score.title, {
      stripInteraction: !opts.keepInteraction,
    });
  }

  async function run(action: () => Promise<void> | void) {
    setStatus("pending");
    try {
      await action();
      setStatus("idle");
    } catch (err) {
      console.error(err);
      setStatus("error");
      setTimeout(() => setStatus("idle"), 2000);
    }
  }

  const items: Array<{
    label: string;
    hint: string;
    onClick: () => void | Promise<void>;
  }> = [
    {
      label: "SVG",
      hint: "Vector, crisp at any zoom",
      onClick: () => {
        const svg = getSvg();
        triggerDownload(
          new Blob([svg], { type: "image/svg+xml;charset=utf-8" }),
          filenameFor("svg"),
        );
      },
    },
    {
      label: "PNG",
      hint: "Bitmap, prints cleanly",
      onClick: async () => {
        const svg = getSvg();
        const blob = await svgStringToPng(svg, { background: "#fafaf9" });
        triggerDownload(blob, filenameFor("png"));
      },
    },
    {
      label: "PDF",
      hint: "Opens a print dialog (save as PDF)",
      onClick: () => {
        const svg = getSvg();
        printSvgAsPdf(svg, score);
      },
    },
    {
      label: "HTML (static)",
      hint: "Single file, no interactivity",
      onClick: () => {
        const svg = getSvg();
        const html = wrapSvgInStaticHtml(svg, score);
        triggerDownload(
          new Blob([html], { type: "text/html;charset=utf-8" }),
          filenameFor("html"),
        );
      },
    },
    {
      label: "HTML (playable)",
      hint: "Single file with inline Play button",
      onClick: () => {
        const svg = getSvg({ keepInteraction: true });
        const source = serializeScore(score);
        const html = wrapSvgInDynamicHtml(svg, score, { source });
        triggerDownload(
          new Blob([html], { type: "text/html;charset=utf-8" }),
          filenameFor("html"),
        );
      },
    },
    {
      label: ".drumtab",
      hint: "Round-trippable plain text",
      onClick: () => {
        const source = serializeScore(score);
        triggerDownload(
          new Blob([source], { type: "text/plain;charset=utf-8" }),
          filenameFor("drumtab", false),
        );
      },
    },
    {
      label: ".mid",
      hint: "Standard MIDI File (channel 10)",
      onClick: () => {
        const bytes = exportScoreToMidi(score);
        const buffer = new ArrayBuffer(bytes.byteLength);
        new Uint8Array(buffer).set(bytes);
        triggerDownload(
          new Blob([buffer], { type: "audio/midi" }),
          filenameFor("mid", false),
        );
      },
    },
  ];

  return (
    <HoverClickPopover
      placement="bottom"
      className="w-64 sm:w-64"
      mobileSheet
      trigger={({ open }) => (
        <span
          title="Export…"
          className={cn(
            "flex h-7 cursor-pointer items-center gap-1 rounded-full border border-stone-200 bg-white px-3 text-xs font-semibold text-stone-700 select-none hover:bg-stone-50",
            open && "border-amber-400 bg-amber-100 text-stone-900",
          )}
        >
          {status === "pending" ? "Exporting…" : status === "error" ? "Failed" : "↓ Export"}
        </span>
      )}
    >
      <div className="flex flex-col gap-0.5 p-1">
        {items.map((item) => (
          <button
            key={item.label}
            type="button"
            onClick={() => run(item.onClick)}
            className="flex flex-col gap-0.5 rounded-md px-2 py-1.5 text-left hover:bg-stone-100"
          >
            <span className="text-[12px] font-semibold text-stone-900">
              {item.label}
            </span>
            <span className="text-[10px] text-stone-500">{item.hint}</span>
          </button>
        ))}
      </div>
    </HoverClickPopover>
  );
}
