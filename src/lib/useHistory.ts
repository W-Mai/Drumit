import { useCallback, useRef, useState } from "react";

/**
 * A per-key undo/redo stack for string snapshots (here: .drumtab source
 * strings). Each key (document id) keeps an independent history so
 * switching documents doesn't clobber other docs' histories.
 */

export interface HistoryEntry {
  stack: string[];
  /** Index of the current state within stack (0..stack.length-1). */
  index: number;
}

export const HISTORY_MAX_DEPTH = 50;

/**
 * Pure reducer: add a new snapshot on top of the stack. Truncates any
 * forward (redo) history beyond `entry.index`. Dedupes against the
 * current snapshot (no-op when equal). Enforces `maxDepth` by dropping
 * the oldest entries. Creates a seed entry when called on `undefined`.
 */
export function historyRecord(
  entry: HistoryEntry | undefined,
  snapshot: string,
  maxDepth: number = HISTORY_MAX_DEPTH,
): HistoryEntry {
  if (!entry) return { stack: [snapshot], index: 0 };
  if (entry.stack[entry.index] === snapshot) return entry;
  const trimmed = entry.stack.slice(0, entry.index + 1);
  trimmed.push(snapshot);
  while (trimmed.length > maxDepth) trimmed.shift();
  return { stack: trimmed, index: trimmed.length - 1 };
}

/**
 * Pure reducer: step back one snapshot. Returns `null` when the cursor is
 * already at the start, otherwise the updated entry plus the snapshot to
 * apply.
 */
export function historyUndo(
  entry: HistoryEntry | undefined,
): { entry: HistoryEntry; snapshot: string } | null {
  if (!entry || entry.index <= 0) return null;
  const nextIndex = entry.index - 1;
  return {
    entry: { stack: entry.stack, index: nextIndex },
    snapshot: entry.stack[nextIndex],
  };
}

/**
 * Pure reducer: step forward one snapshot. Returns `null` when the cursor
 * is already at the tip, otherwise the updated entry plus the snapshot to
 * apply.
 */
export function historyRedo(
  entry: HistoryEntry | undefined,
): { entry: HistoryEntry; snapshot: string } | null {
  if (!entry || entry.index >= entry.stack.length - 1) return null;
  const nextIndex = entry.index + 1;
  return {
    entry: { stack: entry.stack, index: nextIndex },
    snapshot: entry.stack[nextIndex],
  };
}

export interface UseHistoryResult {
  /**
   * Record a new snapshot for `key`. Truncates any forward (redo) history.
   * If the snapshot equals the current one, it's a no-op.
   */
  record: (key: string, snapshot: string) => void;
  /**
   * Return the previous snapshot for `key` and advance the cursor.
   * Returns `null` if there's nothing to undo.
   */
  undo: (key: string) => string | null;
  /**
   * Return the next snapshot for `key` and advance the cursor.
   * Returns `null` if there's nothing to redo.
   */
  redo: (key: string) => string | null;
  /** Drop all history for `key`. */
  reset: (key: string) => void;
  canUndo: (key: string) => boolean;
  canRedo: (key: string) => boolean;
}

export function useHistory(maxDepth: number = HISTORY_MAX_DEPTH): UseHistoryResult {
  // Map key -> HistoryEntry. Using a ref for writes (avoid re-renders per
  // record); a paired state tick lets consumers of canUndo/canRedo re-read.
  const storeRef = useRef<Map<string, HistoryEntry>>(new Map());
  const [, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);

  const record = useCallback(
    (key: string, snapshot: string) => {
      const store = storeRef.current;
      const next = historyRecord(store.get(key), snapshot, maxDepth);
      if (next === store.get(key)) return;
      store.set(key, next);
      bump();
    },
    [bump, maxDepth],
  );

  const undo = useCallback(
    (key: string): string | null => {
      const store = storeRef.current;
      const stepped = historyUndo(store.get(key));
      if (!stepped) return null;
      store.set(key, stepped.entry);
      bump();
      return stepped.snapshot;
    },
    [bump],
  );

  const redo = useCallback(
    (key: string): string | null => {
      const store = storeRef.current;
      const stepped = historyRedo(store.get(key));
      if (!stepped) return null;
      store.set(key, stepped.entry);
      bump();
      return stepped.snapshot;
    },
    [bump],
  );

  const reset = useCallback(
    (key: string) => {
      storeRef.current.delete(key);
      bump();
    },
    [bump],
  );

  const canUndo = useCallback((key: string) => {
    const entry = storeRef.current.get(key);
    return !!entry && entry.index > 0;
  }, []);

  const canRedo = useCallback((key: string) => {
    const entry = storeRef.current.get(key);
    return !!entry && entry.index < entry.stack.length - 1;
  }, []);

  return { record, undo, redo, reset, canUndo, canRedo };
}
