const STORAGE_VERSION = 3;

export interface DocumentRecord {
  id: string;
  name: string;
  source: string;
  savedAt: number;
}

/**
 * Persisted UI preferences. Optional so older workspace snapshots (v2)
 * that predate these fields round-trip without clobbering the user's
 * documents — missing fields fall back to defaults on read.
 */
export interface StoredUiState {
  sidebarCollapsed?: boolean;
  editorCollapsed?: boolean;
}

export interface StoredWorkspace {
  version: number;
  documents: DocumentRecord[];
  activeId: string | null;
  ui?: StoredUiState;
}

interface StoredScoreV1 {
  version: 1;
  source: string;
  savedAt: number;
}

const KEY = "drumit:workspace";
const LEGACY_KEY = "drumit:score";

export function loadWorkspace(): StoredWorkspace | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as StoredWorkspace;
      if (!Array.isArray(parsed.documents)) return null;
      // Accept v2 (pre-ui-state) by in-place upgrading — ui defaults are
      // simply absent and will be filled in by the consumer.
      if (parsed.version === 2 || parsed.version === STORAGE_VERSION) {
        return { ...parsed, version: STORAGE_VERSION };
      }
      return null;
    }
    // Migrate from v1 single-document format.
    const legacyRaw = localStorage.getItem(LEGACY_KEY);
    if (legacyRaw) {
      const legacy = JSON.parse(legacyRaw) as StoredScoreV1;
      if (legacy.version === 1 && typeof legacy.source === "string") {
        const migrated: StoredWorkspace = {
          version: STORAGE_VERSION,
          documents: [
            {
              id: newId(),
              name: "",
              source: legacy.source,
              savedAt: legacy.savedAt,
            },
          ],
          activeId: null,
        };
        migrated.activeId = migrated.documents[0].id;
        saveWorkspace(migrated);
        localStorage.removeItem(LEGACY_KEY);
        return migrated;
      }
    }
    return null;
  } catch {
    return null;
  }
}

export function saveWorkspace(ws: StoredWorkspace): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(ws));
  } catch {
    // quota / disabled — ignore
  }
}

export function clearWorkspace(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    // ignore
  }
}

export function newId(): string {
  return "doc_" + Math.random().toString(36).slice(2, 10);
}

// Backwards-compat export for code still calling the old single-doc API.
export function loadStoredSource(): string | null {
  const ws = loadWorkspace();
  if (!ws || !ws.activeId) return null;
  const doc = ws.documents.find((d) => d.id === ws.activeId);
  return doc?.source ?? null;
}
export function saveStoredSource(source: string): void {
  const existing = loadWorkspace();
  if (!existing) {
    const id = newId();
    saveWorkspace({
      version: STORAGE_VERSION,
      documents: [{ id, name: "", source, savedAt: Date.now() }],
      activeId: id,
    });
    return;
  }
  const activeId = existing.activeId ?? existing.documents[0]?.id;
  if (!activeId) return;
  const docs = existing.documents.map((d) =>
    d.id === activeId ? { ...d, source, savedAt: Date.now() } : d,
  );
  saveWorkspace({ ...existing, documents: docs, activeId });
}
export function clearStoredSource(): void {
  clearWorkspace();
}
