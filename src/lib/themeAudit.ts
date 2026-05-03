/**
 * Theme audit — a self-embedded diagnostic that walks the live DOM and
 * reports elements whose actual computed background vs text color has a
 * WCAG contrast ratio below a threshold under the current theme.
 *
 * Activation: append `?theme-audit` to the URL (or call
 * `runThemeAudit()` from the browser devtools). Produces a fixed
 * bottom-right panel listing offenders plus a button that copies the
 * full report to the clipboard.
 *
 * Why this exists: Tailwind class audits only tell us which classes
 * are *declared*, not how they resolve after all theme overrides,
 * parent inheritance, and cascade. Users hit real rendering bugs like
 * "bg-amber-100 text-stone-900" that read fine in light mode but hit
 * 2:1 contrast under dark. Catching those manually by eye scales
 * poorly; this tool makes it a single-step check.
 */

type Offender = {
  element: HTMLElement;
  bg: string;
  fg: string;
  ratio: number;
  className: string;
};

const MIN_CONTRAST = 3; // WCAG AA for large text / UI chrome floor.

// fillStyle setter doesn't normalise oklch() across Chromium versions,
// so we actually draw a pixel in the requested color and read it back
// from the image buffer to get true sRGB.
let colorCanvas: HTMLCanvasElement | null = null;
function getColorCtx(): CanvasRenderingContext2D | null {
  if (typeof document === "undefined") return null;
  if (!colorCanvas) {
    colorCanvas = document.createElement("canvas");
    colorCanvas.width = 1;
    colorCanvas.height = 1;
  }
  return colorCanvas.getContext("2d", { willReadFrequently: true });
}

function parseColor(c: string): [number, number, number, number] | null {
  if (!c) return null;
  const rgba = c.match(
    /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?\s*\)$/,
  );
  if (rgba) {
    return [
      Number(rgba[1]),
      Number(rgba[2]),
      Number(rgba[3]),
      rgba[4] ? Number(rgba[4]) : 1,
    ];
  }
  const ctx = getColorCtx();
  if (!ctx) return null;
  try {
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = c;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2], d[3] / 255];
  } catch {
    return null;
  }
}

function luminance(r: number, g: number, b: number): number {
  // sRGB to relative luminance, WCAG formula.
  const norm = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * norm[0] + 0.7152 * norm[1] + 0.0722 * norm[2];
}

function contrast(a: string, b: string): number | null {
  const ca = parseColor(a);
  const cb = parseColor(b);
  if (!ca || !cb) return null;
  const la = luminance(ca[0], ca[1], ca[2]);
  const lb = luminance(cb[0], cb[1], cb[2]);
  const bright = Math.max(la, lb);
  const dark = Math.min(la, lb);
  return (bright + 0.05) / (dark + 0.05);
}

function effectiveBg(el: HTMLElement): string {
  // Walk up until we find a non-transparent background. "rgba(0, 0, 0, 0)"
  // and "transparent" both count as pass-through.
  let cur: HTMLElement | null = el;
  while (cur) {
    const bg = getComputedStyle(cur).backgroundColor;
    const parsed = parseColor(bg);
    if (parsed && parsed[3] > 0.02) return bg;
    cur = cur.parentElement;
  }
  return getComputedStyle(document.body).backgroundColor;
}

export function runThemeAudit(): Offender[] {
  const offenders: Offender[] = [];
  // Only scan elements that actually render text. Skip tiny icons.
  const candidates = document.querySelectorAll<HTMLElement>(
    "button, a, li, span, p, div, h1, h2, h3, h4, td, dt, dd, code, kbd",
  );
  for (const el of candidates) {
    // Has non-empty direct text content?
    const directText = Array.from(el.childNodes)
      .filter((n) => n.nodeType === 3)
      .map((n) => (n.textContent ?? "").trim())
      .join("")
      .length;
    if (!directText) continue;

    const rect = el.getBoundingClientRect();
    if (rect.width < 8 || rect.height < 8) continue;

    const cs = getComputedStyle(el);
    const fg = cs.color;
    const bg = effectiveBg(el);
    const ratio = contrast(fg, bg);
    if (ratio === null) continue;
    if (ratio < MIN_CONTRAST) {
      offenders.push({ element: el, bg, fg, ratio, className: el.className });
    }
  }
  // Sort worst first.
  offenders.sort((a, b) => a.ratio - b.ratio);
  return offenders;
}

function formatReport(offenders: Offender[]): string {
  const theme =
    document.documentElement.getAttribute("data-theme") ?? "(unset)";
  const lines = [
    `# Theme audit — ${offenders.length} offenders`,
    `theme=${theme}  url=${location.href}  at=${new Date().toISOString()}`,
    "",
  ];
  for (const o of offenders.slice(0, 100)) {
    const preview = (o.element.textContent ?? "")
      .trim()
      .slice(0, 60)
      .replace(/\s+/g, " ");
    lines.push(
      `  ratio=${o.ratio.toFixed(2)}  fg=${o.fg}  bg=${o.bg}`,
      `    text: "${preview}"`,
      `    classes: ${o.className}`,
      "",
    );
  }
  return lines.join("\n");
}

function renderPanel(offenders: Offender[]) {
  const existing = document.getElementById("drumit-theme-audit-panel");
  if (existing) existing.remove();

  const panel = document.createElement("div");
  panel.id = "drumit-theme-audit-panel";
  panel.style.cssText = `
    position: fixed;
    right: 12px;
    bottom: 12px;
    z-index: 99999;
    width: min(420px, calc(100vw - 24px));
    max-height: 60vh;
    overflow: auto;
    background: #0c0a09;
    color: #fafaf9;
    font: 12px/1.4 ui-monospace, monospace;
    padding: 12px 14px;
    border-radius: 12px;
    box-shadow: 0 20px 40px rgba(0,0,0,.5);
    border: 1px solid #44403c;
  `;

  const theme =
    document.documentElement.getAttribute("data-theme") ?? "(unset)";
  const header = document.createElement("div");
  header.style.cssText =
    "display:flex;align-items:center;gap:8px;margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid #292524;";
  header.innerHTML = `
    <strong style="color:#f59e0b;">Theme audit</strong>
    <span style="opacity:.7">theme=${theme} · ${offenders.length} issue${offenders.length === 1 ? "" : "s"}</span>
  `;

  const copyBtn = document.createElement("button");
  copyBtn.textContent = "Copy";
  copyBtn.style.cssText =
    "margin-left:auto;padding:2px 8px;border-radius:4px;border:1px solid #44403c;background:#1c1917;color:#fafaf9;font:inherit;cursor:pointer;";
  copyBtn.onclick = () => {
    navigator.clipboard.writeText(formatReport(offenders));
    copyBtn.textContent = "Copied!";
    setTimeout(() => (copyBtn.textContent = "Copy"), 1200);
  };
  header.appendChild(copyBtn);

  const closeBtn = document.createElement("button");
  closeBtn.textContent = "×";
  closeBtn.style.cssText =
    "padding:0 6px;border-radius:4px;border:1px solid #44403c;background:#1c1917;color:#fafaf9;font:inherit;cursor:pointer;";
  closeBtn.onclick = () => panel.remove();
  header.appendChild(closeBtn);

  panel.appendChild(header);

  if (offenders.length === 0) {
    const ok = document.createElement("div");
    ok.style.cssText = "color:#6ee7b7;padding:8px 0;";
    ok.textContent = "✓ No contrast issues above the 3:1 threshold.";
    panel.appendChild(ok);
  }

  for (const o of offenders.slice(0, 100)) {
    const row = document.createElement("div");
    row.style.cssText =
      "padding:6px 0;border-bottom:1px dashed #292524;cursor:pointer;";
    row.onmouseenter = () => {
      o.element.style.outline = "2px solid #f59e0b";
      o.element.scrollIntoView({ block: "center", behavior: "smooth" });
    };
    row.onmouseleave = () => {
      o.element.style.outline = "";
    };
    row.onclick = () => {
      o.element.style.outline = "2px solid #f59e0b";
      console.log("[theme-audit]", o);
    };

    const preview = (o.element.textContent ?? "").trim().slice(0, 40);
    const color = o.ratio < 1.5 ? "#fca5a5" : "#fcd34d";
    row.innerHTML = `
      <div><span style="color:${color};font-weight:bold;">ratio ${o.ratio.toFixed(2)}</span> · ${preview.replace(/[<>&]/g, "")}</div>
      <div style="opacity:.7;font-size:11px;">
        fg <span style="display:inline-block;width:10px;height:10px;background:${o.fg};border:1px solid #44403c;vertical-align:middle;"></span> ${o.fg}
        bg <span style="display:inline-block;width:10px;height:10px;background:${o.bg};border:1px solid #44403c;vertical-align:middle;"></span> ${o.bg}
      </div>
      <div style="opacity:.6;font-size:10px;margin-top:2px;">${String(o.className).slice(0, 140)}</div>
    `;
    panel.appendChild(row);
  }

  document.body.appendChild(panel);
}

/**
 * Auto-activate when the URL query contains `theme-audit`. Also
 * exposes `window.__themeAudit()` for manual runs (including re-runs
 * after toggling the theme).
 */
export function maybeStartThemeAudit(): void {
  if (typeof window === "undefined") return;
  const run = () => renderPanel(runThemeAudit());
  // Expose for devtools: window.__themeAudit() returns offenders
  // & redraws panel.
  (window as unknown as { __themeAudit?: () => Offender[] }).__themeAudit =
    () => {
      const o = runThemeAudit();
      renderPanel(o);
      return o;
    };
  if (new URLSearchParams(location.search).has("theme-audit")) {
    // Delay so React's first paint lands.
    setTimeout(run, 400);
  }
}
