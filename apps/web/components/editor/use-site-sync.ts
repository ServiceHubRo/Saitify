'use client';

import type { Website } from '@saitify/engine';
import { useCallback, useEffect, useRef, useState } from 'react';
import { call } from '../app/api-client';

export type SyncStatus = 'saved' | 'dirty' | 'saving' | 'error' | 'offline' | 'conflict' | 'signed-out' | 'missing';

const DEBOUNCE_MS = 1500;
const RETRY_MS = [3000, 6000, 12000, 30000];
export const backupKey = (id: string) => `saitify:editor:${id}`;
export type Backup = { baseRevision: number; site: Website; at: number };

export function readBackup(id: string): Backup | null {
  try {
    const raw = window.localStorage.getItem(backupKey(id));
    if (!raw) return null;
    const b = JSON.parse(raw) as Backup;
    return b && typeof b.baseRevision === 'number' && b.site && typeof b.at === 'number' ? b : null;
  } catch {
    return null;
  }
}
export function clearBackup(id: string) {
  try {
    window.localStorage.removeItem(backupKey(id));
  } catch {
    /* ignore */
  }
}

/**
 * Autosave for the editor.
 *  - Dirty is "the website object differs from the last one the server confirmed", so undoing back to the saved state is clean.
 *  - One request at a time; the latest state always wins; "saved" is shown only after the server answered 200.
 *  - Each write carries the revision it was based on. A newer revision on the server (another tab) answers 409 and
 *    saving stops until the user chooses, so nothing is overwritten silently.
 *  - Until a write succeeds a copy of the work stays in this browser, so a failure or a closed tab loses nothing.
 */
export function useSiteSync(opts: { projectId: string; initialRevision: number; site: Website; enabled: boolean }) {
  const { projectId, site, enabled } = opts;
  const [status, setStatus] = useState<SyncStatus>('saved');
  const [conflictRevision, setConflictRevision] = useState<number | null>(null);
  const [lastSaved, setLastSaved] = useState<number | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const revision = useRef(opts.initialRevision);
  const savedSite = useRef(site);
  const latest = useRef(site);
  latest.current = site;
  const inflight = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  const failures = useRef(0);
  const blocked = useRef(false);

  const flush = useCallback(async () => {
    if (blocked.current) return;
    window.clearTimeout(timer.current);
    if (inflight.current) return;
    if (latest.current === savedSite.current) {
      setStatus('saved');
      return;
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setStatus('offline');
      return;
    }
    inflight.current = true;
    setStatus('saving');
    const sent = latest.current;
    const r = await call<{ project: { revision: number } }>(`/api/projects/${projectId}/site`, { method: 'PATCH', body: { revision: revision.current, site: sent } });
    inflight.current = false;
    if (r.ok) {
      failures.current = 0;
      revision.current = r.data.project.revision;
      savedSite.current = sent;
      setProblem(null);
      setLastSaved(Date.now());
      if (latest.current === sent) {
        clearBackup(projectId);
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
      setStatus('missing');
    } else if (r.status === 422 || r.status === 413) {
      blocked.current = true;
      setProblem(r.error.message);
      setStatus('error');
    } else {
      setStatus('error');
      const wait = RETRY_MS[Math.min(failures.current, RETRY_MS.length - 1)]!;
      failures.current += 1;
      timer.current = window.setTimeout(() => void flush(), wait);
    }
  }, [projectId]);

  useEffect(() => {
    if (!enabled || blocked.current) return;
    if (site === savedSite.current) {
      setStatus((s) => (s === 'dirty' ? 'saved' : s));
      return;
    }
    const backup = window.setTimeout(() => {
      try {
        window.localStorage.setItem(backupKey(projectId), JSON.stringify({ baseRevision: revision.current, site: latest.current, at: Date.now() } satisfies Backup));
      } catch {
        /* storage unavailable: autosave still works */
      }
    }, 400);
    setStatus((s) => (s === 'saving' || s === 'error' || s === 'offline' ? s : 'dirty'));
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void flush(), DEBOUNCE_MS);
    return () => {
      window.clearTimeout(backup);
      window.clearTimeout(timer.current);
    };
  }, [site, enabled, projectId, flush]);

  useEffect(() => {
    const hide = () => {
      if (document.visibilityState === 'hidden') void flush();
    };
    const warn = (e: BeforeUnloadEvent) => {
      if (latest.current !== savedSite.current) e.preventDefault();
    };
    const online = () => {
      failures.current = 0;
      void flush();
    };
    const offline = () => setStatus((s) => (s === 'saved' ? s : 'offline'));
    document.addEventListener('visibilitychange', hide);
    window.addEventListener('beforeunload', warn);
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    return () => {
      document.removeEventListener('visibilitychange', hide);
      window.removeEventListener('beforeunload', warn);
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
    };
  }, [flush]);

  const retry = useCallback(() => {
    failures.current = 0;
    blocked.current = false;
    setProblem(null);
    void flush();
  }, [flush]);

  /** The user chose to keep their version over the newer one saved elsewhere. */
  const overwrite = useCallback(() => {
    if (conflictRevision) revision.current = conflictRevision;
    blocked.current = false;
    setConflictRevision(null);
    void flush();
  }, [conflictRevision, flush]);

  const markServerState = useCallback((nextRevision: number, serverSite: Website) => {
    revision.current = nextRevision;
    savedSite.current = serverSite;
    blocked.current = false;
    setConflictRevision(null);
    setStatus('saved');
  }, []);

  return { status, lastSaved, problem, retry, overwrite, flushNow: flush, markServerState, revision: () => revision.current };
}
