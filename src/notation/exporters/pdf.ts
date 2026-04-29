import type { Score } from "../types";
import { wrapSvgInStaticHtml, type RenderHtmlOptions } from "./html";

/**
 * "Export as PDF" by piggybacking on the browser's print pipeline. We
 * open a printable HTML representation (same layout as the static HTML
 * export, with print-specific tweaks) in a new tab and trigger the
 * browser's print dialog. The user picks "Save as PDF" from there.
 *
 * This keeps the feature dependency-free and trusts the OS's PDF
 * renderer to handle fonts, vector fidelity, and page breaks.
 */
export function printSvgAsPdf(
  svg: string,
  score: Score,
  options: RenderHtmlOptions = {},
): void {
  const baseHtml = wrapSvgInStaticHtml(svg, score, options);
  // Inject a small print stylesheet so the output matches A-series paper
  // and removes chrome like the Drumit footer link underline.
  const printable = baseHtml.replace(
    "</head>",
    `<style>
      @page { size: A4 portrait; margin: 12mm; }
      @media print {
        body { background: white; padding: 0; }
        .chart { box-shadow: none; }
        a { color: inherit; text-decoration: none; }
      }
    </style></head>`,
  );

  const popup = window.open("", "_blank", "noopener,noreferrer");
  if (!popup) {
    throw new Error(
      "Failed to open a print window. Allow popups for this site and try again.",
    );
  }
  popup.document.open();
  popup.document.write(printable);
  popup.document.close();
  // Wait for the browser to parse + lay out the SVG before invoking
  // print; otherwise the preview is empty on Safari.
  const win = popup;
  const start = () => {
    try {
      win.focus();
      win.print();
    } catch {
      // Ignore — user can still print manually via ⌘P.
    }
  };
  if (win.document.readyState === "complete") {
    setTimeout(start, 120);
  } else {
    win.addEventListener("load", () => setTimeout(start, 120), { once: true });
  }
}
