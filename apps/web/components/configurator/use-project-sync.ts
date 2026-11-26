'use client';

import type { WizardState } from '@saitify/configurator';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { call } from '../app/api-client';
import { projectKey } from './draft-storage';

export type ProjectSeed = { id: string; name: string; revision: number; state: WizardState };
export type SyncStatus = 'saved' | 'dirty' | 'saving' | 'error' | 'conflict' | 'signed-out';

const DEBOUNCE_MS = 1200;
const RETRY_MS = [3000, 6000, 12000, 30000];

/**
 * Autosave for a saved project.
 *  - Debounced, one request at a time, latest state wins (no pile of writes).
 *  - "saved" is only reported after the server confirmed the write.
 *  - Each write carries the revision it was based on. If another tab saved first, the server answers 409 and we stop
 *    and ask the user instead of overwriting.
 *  - Until a write succeeds, a copy of the work stays in this browser so a failed save or a closed tab loses nothing.
 */
export function useProjectSync(seed: ProjectSeed | undefined, state: WizardState, enabled: boolean) {
  const [status, setStatus] = useState<SyncStatus>('saved');
  const [conflictRevision, setConflictRevision] = useState<number | null>(null);
  const [lastSaved, setLastSaved] = useState<number | null>(null);
  const revision = useRef(seed?.revision ?? 0);
  const savedJson = useRef(seed ? JSON.stringify(seed.state) : '');
  const latest = useRef({ json: savedJson.current, state });
  const inflight = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  const failures = useRef(0);
  const blocked = useRef(false);

  const json = useMemo(() => JSON.stringify(state), [state]);
  latest.current = { json, state };

  const flush = useCallback(async () => {
    if (!seed || blocked.current) return;
    window.clearTimeout(timer.current);
    if (inflight.current) return; // the running save re-checks for newer changes when it finishes
    if (latest.current.json === savedJson.current) {
      setStatus('saved');
      return;
    }
    inflight.current = true;
    setStatus('saving');
    const sent = latest.current;
    const r = await call<{ project: { revision: number } }>(`/api/projects/${seed.id}`, { method: 'PATCH', body: { revision: revision.current, wizard: sent.state } });
    inflight.current = false;
    if (r.ok) {
      failures.current = 0;
      revision.current = r.data.project.revision;
      savedJson.current = sent.json;
      setLastSaved(Date.now());
      if (latest.current.json === sent.json) {
        try {
          window.localStorage.removeItem(projectKey(seed.id));
        } catch {
          /* ignore */
        }
        setStatus('saved');
      } else {
        setStatus('dirty');
        void flush();
      }
      return;
    }
    if (r.status === 409) {
      blocked.current = true;
      setConflictRevision(Number(r.error.details?.currentRevision ?? 0) || null);
      setStatus('conflict');
    } else if (r.status === 401) {
      blocked.current = true;
      setStatus('signed-out');
    } else if (r.status === 404) {
      blocked.current = true;
      setStatus('error');
    } else {
      setStatus('error');
      const wait = RETRY_MS[Math.min(failures.current, RETRY_MS.length - 1)]!;
      failures.current += 1;
      timer.current = window.setTimeout(() => void flush(), wait);
    }
  }, [seed]);

  // Something changed: keep a local copy right away, then save after a short pause.
  useEffect(() => {
    if (!seed || !enabled || blocked.current) return;
    if (json === savedJson.current) return;
    try {
      window.localStorage.setItem(projectKey(seed.id), JSON.stringify({ baseRevision: revision.current, state: latest.current.state, at: Date.now() }));
    } catch {
      /* storage unavailable: autosave still works */
    }
    setStatus((s) => (s === 'saving' || s === 'error' ? s : 'dirty'));
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void flush(), DEBOUNCE_MS);
    return () => window.clearTimeout(timer.current);
  }, [json, seed, enabled, flush]);

  // Save promptly when the tab is hidden, and warn before leaving with unsaved work.
  useEffect(() => {
    if (!seed) return;
    const hide = () => {
      if (document.visibilityState === 'hidden') void flush();
    };
    const warn = (e: BeforeUnloadEvent) => {
      if (latest.current.json !== savedJson.current) e.preventDefault();
    };
    document.addEventListener('visibilitychange', hide);
    window.addEventListener('beforeunload', warn);
    return () => {
      document.removeEventListener('visibilitychange', hide);
      window.removeEventListener('beforeunload', warn);
    };
  }, [seed, flush]);

  const retry = useCallback(() => {
    failures.current = 0;
    void flush();
  }, [flush]);

  /** The user chose to keep their version over the newer one saved elsewhere. */
  const overwrite = useCallback(() => {
    if (conflictRevision) revision.current = conflictRevision;
    blocked.current = false;
    setConflictRevision(null);
    void flush();
  }, [conflictRevision, flush]);

  const discardLocalAndReload = useCallback(() => {
    if (seed) {
      try {
        window.localStorage.removeItem(projectKey(seed.id));
      } catch {
        /* ignore */
      }
    }
    window.location.reload();
  }, [seed]);

  return { status, lastSaved, retry, overwrite, discardLocalAndReload, flushNow: flush, baseRevision: () => revision.current };
}
