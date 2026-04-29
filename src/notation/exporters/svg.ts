import type { Score } from "../types";
import { layoutScore } from "../layout";

/**
 * Tailwind utilities used by `DrumChart`, flattened into plain CSS so the
 * serialized SVG/HTML renders correctly anywhere — not just inside the
 * running Tailwind stylesheet. Keep in sync with the class names that
 * actually appear in `renderer.tsx`.
 */
export const INLINE_CSS = `
  text { font-family: 'Helvetica Neue', Arial, sans-serif; }
  .fill-stone-50 { fill: #fafaf9; }
  .fill-stone-400 { fill: #a8a29e; }
  .fill-stone-500 { fill: #78716c; }
  .fill-stone-700 { fill: #44403c; }
  .fill-stone-900 { fill: #1c1917; }
  .fill-amber-100 { fill: #fef3c7; }
  .fill-emerald-300\\/40 { fill: #6ee7b780; }
  .fill-none { fill: none; }
  .fill-transparent { fill: transparent; }
  .stroke-stone-300 { stroke: #d6d3d1; }
  .stroke-stone-400 { stroke: #a8a29e; }
  .stroke-stone-600 { stroke: #57534e; }
  .stroke-stone-700 { stroke: #44403c; }
  .stroke-stone-900 { stroke: #1c1917; }
  .stroke-transparent { stroke: transparent; }
  .font-bold { font-weight: 700; }
  .font-black { font-weight: 900; }
  .font-extrabold { font-weight: 800; }
  .font-semibold { font-weight: 600; }
  .font-medium { font-weight: 500; }
  .italic { font-style: italic; }
  .tabular-nums { font-variant-numeric: tabular-nums; }
  .tracking-wider { letter-spacing: 0.05em; }
`;

/* Tailwind encodes numeric font sizes inside the class name
 * (`text-[9px]`). Those values don't map to a shared CSS class, so we
 * also inline them onto the element's `style` attribute. */
const TEXT_SIZE_RE = /text-\[(\d+(?:\.\d+)?)(px|rem|em)\]/;

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Turn a raw `renderToStaticMarkup` SVG string into a standalone,
 * portable `.svg` file — adds the XML namespace, an optional `<title>`
 * for a11y, the inlined Tailwind-equivalent stylesheet, and font-size
 * fallbacks.
 */
export function postProcessSvg(raw: string, title?: string): string {
  const titleEl = title ? `<title>${escapeXml(title)}</title>` : "";
  const styled = raw.replace(
    /<svg([^>]*)>/,
    (_m, attrs) =>
      `<svg${attrs} xmlns="http://www.w3.org/2000/svg">${titleEl}<style>${INLINE_CSS}</style>`,
  );
  return styled.replace(/class="([^"]*)"/g, (_m, cls: string) => {
    const match = TEXT_SIZE_RE.exec(cls);
    if (!match) return `class="${cls}"`;
    const [, size, unit] = match;
    return `class="${cls}" style="font-size:${size}${unit}"`;
  });
}

export interface RenderSvgOptions {
  width?: number;
  showLabels?: boolean;
  title?: string;
}

/**
 * Render a Score to a standalone SVG string ready to drop into a file,
 * a data URL, or an HTML embed.
 *
 * Uses `react-dom/server` under the hood so it works in Node / scripts /
 * unit tests. For the browser, there's a lighter-weight helper below
 * (`renderScoreToSvgFromDom`) that extracts an already-rendered SVG and
 * avoids pulling the server renderer into the client bundle.
 */
export async function renderScoreToSvg(
  score: Score,
  options: RenderSvgOptions = {},
): Promise<string> {
  // Lazily import the server renderer so callers who only use the DOM
  // path (the browser app) don't pay the bundle cost.
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { createElement } = await import("react");
  const { DrumChart } = await import("../renderer");
  const layout = layoutScore(score, {
    showLabels: options.showLabels ?? false,
    expanded: false,
    width: options.width ?? 980,
  });
  const raw = renderToStaticMarkup(
    createElement(DrumChart, {
      layout,
      showLabels: options.showLabels ?? false,
    }),
  );
  return postProcessSvg(raw, options.title ?? score.title);
}

/**
 * Synchronous DOM-based variant used in the browser: the app already has
 * the chart SVG mounted for the live preview, so we can just clone its
 * outerHTML and post-process it. Zero react-dom/server cost.
 */
export function renderScoreToSvgFromDom(
  svgEl: SVGSVGElement,
  title?: string,
): string {
  return postProcessSvg(svgEl.outerHTML, title);
}
