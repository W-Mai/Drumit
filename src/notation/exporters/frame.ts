import QRCode from "qrcode";

export interface FrameOptions {
  /** Title shown in the footer, falls back to "Drumit chart". */
  title?: string;
  /** URL encoded into the QR code. */
  qrUrl: string;
  /** Version string shown in the footer. */
  version: string;
  /** Subtitle / secondary text in the footer (e.g. artist). */
  subtitle?: string;
  /** Pixel margin around the chart. Defaults to 24. */
  bleed?: number;
  /** Height of the footer strip. Defaults to 56. */
  footerHeight?: number;
}

/**
 * Wrap a self-contained SVG string in a larger SVG that adds a margin
 * ("bleed") around it and a footer bar carrying the chart title, a QR
 * code pointing at `qrUrl`, and the Drumit version. Returns the new
 * SVG markup as a string.
 */
export async function frameSvgForExport(
  svg: string,
  options: FrameOptions,
): Promise<string> {
  const bleed = options.bleed ?? 24;
  const footerHeight = options.footerHeight ?? 56;
  const inner = readSvgViewBox(svg);
  const innerW = inner.width;
  const innerH = inner.height;

  const outerW = innerW + bleed * 2;
  const outerH = innerH + bleed * 2 + footerHeight;

  const qrSize = footerHeight - 12; // square, a little shorter than the strip
  const qrSvg = await QRCode.toString(options.qrUrl, {
    type: "svg",
    margin: 0,
    width: qrSize,
    color: { dark: "#1c1917", light: "#ffffff" },
  });
  // QRCode.toString returns a full <svg…>…</svg>. Strip the outer tags
  // and re-emit as a nested <g transform="translate(x,y)">.
  const qrInner = qrSvg.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");

  // Strip the incoming SVG's outer <svg …> tags so we can nest its
  // contents in our frame. Keep the original viewBox-sized coord system
  // by wrapping it in a <g transform="translate(bleed, bleed)">.
  const innerBody = svg
    .replace(/^[\s\S]*?<svg[^>]*>/, "")
    .replace(/<\/svg>\s*$/, "");

  const footerY = bleed + innerH + 8; // 8 px gap between chart and footer
  const qrX = outerW - bleed - qrSize;
  const qrY = footerY + 6;

  const title = escapeXml(options.title ?? "Drumit chart");
  const subtitle = options.subtitle ? escapeXml(options.subtitle) : "";
  const footerText = `v${escapeXml(options.version)}`;
  const urlText = escapeXml(options.qrUrl);

  // Visual tokens matching the app's stone / amber palette.
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${outerW} ${outerH}" class="h-auto w-full">
<rect x="0" y="0" width="${outerW}" height="${outerH}" fill="#fafaf9"/>
<g transform="translate(${bleed}, ${bleed})">${innerBody}</g>
<g transform="translate(${bleed}, ${footerY})">
  <line x1="0" y1="0" x2="${innerW}" y2="0" stroke="#e7e5e4" stroke-width="1"/>
  <text x="0" y="20" font-family="ui-sans-serif, system-ui, sans-serif" font-size="12" font-weight="600" fill="#1c1917">${title}</text>
  ${subtitle ? `<text x="0" y="36" font-family="ui-sans-serif, system-ui, sans-serif" font-size="10" fill="#78716c">${subtitle}</text>` : ""}
  <text x="0" y="${footerHeight - 8}" font-family="ui-monospace, monospace" font-size="9" fill="#a8a29e">${urlText} · ${footerText}</text>
</g>
<g transform="translate(${qrX}, ${qrY})">${qrInner}</g>
</svg>`;
}

function readSvgViewBox(svg: string): { width: number; height: number } {
  const m = svg.match(/viewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/);
  if (m) return { width: parseFloat(m[1]), height: parseFloat(m[2]) };
  return { width: 900, height: 300 };
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
