import { renderScoreToSvg, type RenderSvgOptions } from "./svg";
import type { Score } from "../types";

export interface RenderPngOptions extends RenderSvgOptions {
  /** Device-pixel multiplier. 2 yields retina-crisp output. */
  scale?: number;
  /** Override the canvas background colour. Default transparent. */
  background?: string;
}

/**
 * Rasterize a Score to a PNG Blob. Runs entirely in the browser via
 *   SVG → data URL → Image → canvas.drawImage → canvas.toBlob.
 * The SVG is serialized with `renderScoreToSvg` so all styling is self-
 * contained (no Tailwind runtime required on the rendering Image).
 */
export async function renderScoreToPng(
  score: Score,
  options: RenderPngOptions = {},
): Promise<Blob> {
  const scale = options.scale ?? 2;
  const svg = renderScoreToSvg(score, options);

  const { width, height } = readSvgDimensions(svg);

  const img = await loadSvgAsImage(svg);

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas context unavailable");

  if (options.background) {
    ctx.fillStyle = options.background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("canvas.toBlob returned null")),
      "image/png",
    );
  });
}

function readSvgDimensions(svg: string): { width: number; height: number } {
  // Pull width/height from the viewBox since the SVG uses it exclusively
  // (the renderer omits explicit width/height attrs and relies on the
  // aspect-preserving viewBox).
  const match = svg.match(/viewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/);
  if (!match) return { width: 900, height: 300 };
  return { width: parseFloat(match[1]), height: parseFloat(match[2]) };
}

function loadSvgAsImage(svg: string): Promise<HTMLImageElement> {
  // Using a data URL keeps the image same-origin and sidesteps CORS rules
  // on canvas tainting that object URLs sometimes trip on.
  const encoded = encodeURIComponent(svg).replace(/'/g, "%27");
  const dataUrl = `data:image/svg+xml;charset=utf-8,${encoded}`;
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("failed to decode SVG as image"));
    img.src = dataUrl;
  });
}
