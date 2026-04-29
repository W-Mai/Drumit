import type { Score } from "../types";
import { wrapSvgInStaticHtml, type RenderHtmlOptions } from "./html";

/**
 * "Export as PDF" by piggybacking on the browser's print pipeline. We
 * generate a printable HTML (same layout as the static HTML export,
 * with print-specific tweaks) and load it into a hidden iframe so the
 * browser parses and lays it out for real. We then invoke print() on
 * the iframe — the user picks "Save as PDF" from the native dialog.
 *
 * Using an iframe (as opposed to window.open + document.write) avoids
 * popup blockers, preserves same-origin so fonts/images work, and keeps
 * the experience in-tab.
 */
export function printSvgAsPdf(
  svg: string,
  score: Score,
  options: RenderHtmlOptions = {},
): void {
  const baseHtml = wrapSvgInStaticHtml(svg, score, options);
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

  const blob = new Blob([printable], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.style.opacity = "0";
  iframe.style.pointerEvents = "none";
  iframe.src = url;

  function cleanup() {
    URL.revokeObjectURL(url);
    setTimeout(() => iframe.remove(), 0);
  }

  iframe.addEventListener(
    "load",
    () => {
      const win = iframe.contentWindow;
      if (!win) {
        cleanup();
        return;
      }
      // Give the browser a beat to lay out the embedded SVG before
      // printing — otherwise Safari sometimes prints a blank page.
      setTimeout(() => {
        try {
          win.focus();
          win.print();
        } finally {
          // Revoke after the print dialog returns. Using a longer delay
          // because on some browsers revoking too soon kills the print
          // preview's resources.
          setTimeout(cleanup, 1000);
        }
      }, 150);
    },
    { once: true },
  );

  document.body.appendChild(iframe);
}
