const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

export function isValidSlug(s: string): boolean {
  return typeof s === "string" && s.length > 0 && SLUG_RE.test(s);
}

export function slugify(input: string): string {
  if (!input) return "";
  const ascii = input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const dashed = ascii.replace(/[^a-z0-9]+/g, "-");
  return dashed.replace(/^-+|-+$/g, "");
}
