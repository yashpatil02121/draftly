import { useCallback, useEffect, useRef, useState } from 'react';

export type SaveStatus = 'saved' | 'unsaved' | 'saving' | 'error';

interface Options<P> {
  /** Persists a patch. Must throw on failure. */
  save: (patch: P) => Promise<void>;
  delayMs?: number;
}

/**
 * Debounced autosave with a serialized queue.
 * - Patches queued while a save is in flight are merged and sent after it finishes, so an older
 *   request can never overwrite a newer one.
 * - On failure the pending patch is kept (merged with anything newer) so retry() loses nothing.
 */
export function useAutosave<P extends object>({ save, delayMs = 700 }: Options<P>) {
  const [status, setStatus] = useState<SaveStatus>('saved');
  const pending = useRef<Partial<P> | null>(null);
  const inFlight = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const saveRef = useRef(save);
  saveRef.current = save;

  const run = useCallback(async () => {
    if (inFlight.current || !pending.current) return;
    inFlight.current = true;
    const patch = pending.current;
    pending.current = null;
    setStatus('saving');
    try {
      await saveRef.current(patch as P);
      setStatus(pending.current ? 'unsaved' : 'saved');
    } catch {
      pending.current = { ...patch, ...(pending.current ?? {}) }; // keep newer fields, restore failed ones
      setStatus('error');
      inFlight.current = false;
      return;
    }
    inFlight.current = false;
    if (pending.current) timer.current = setTimeout(run, delayMs);
  }, [delayMs]);

  const queue = useCallback(
    (patch: Partial<P>) => {
      pending.current = { ...(pending.current ?? {}), ...patch };
      setStatus((s) => (s === 'saving' ? s : 'unsaved'));
      clearTimeout(timer.current);
      timer.current = setTimeout(run, delayMs);
    },
    [run, delayMs],
  );

  /** Save now (used on retry, navigation and unmount). */
  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    await run();
  }, [run]);

  // Warn before closing the tab with unsaved edits.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (pending.current || inFlight.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  // Best-effort flush when leaving the editor.
  useEffect(() => () => {
    clearTimeout(timer.current);
    void run();
  }, [run]);

  return { status, queue, flush, hasPending: () => pending.current !== null };
}
