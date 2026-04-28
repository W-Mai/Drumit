const STORAGE_VERSION = 1;

export interface StoredScore {
  version: number;
  source: string;
  savedAt: number;
}

const KEY = "drumit:score";

export function loadStoredSource(): string | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredScore;
    if (parsed.version !== STORAGE_VERSION) return null;
    if (typeof parsed.source !== "string") return null;
    return parsed.source;
  } catch {
    return null;
  }
}

export function saveStoredSource(source: string): void {
  if (typeof localStorage === "undefined") return;
  try {
    const data: StoredScore = {
      version: STORAGE_VERSION,
      source,
      savedAt: Date.now(),
    };
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // quota full or disabled — ignore
  }
}

export function clearStoredSource(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
