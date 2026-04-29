/**
 * Shared helpers for browser-side file downloads.
 *
 * All exporters funnel through `triggerDownload`, which builds a
 * transient `<a href="blob:">` and clicks it. No runtime dependencies.
 */

export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the browser a tick to initiate the download before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * Slugify a title into something safe to use as a filename. Matches the
 * rule used elsewhere in the app (see `nameToFilename` in App.tsx).
 */
export function filenameStem(title: string, fallback = "chart"): string {
  const base = (title || "").trim();
  const slug = base
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, "_")
    .slice(0, 48);
  return slug || fallback;
}
