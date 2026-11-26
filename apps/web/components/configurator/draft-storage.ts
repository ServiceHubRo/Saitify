import type { WizardState } from '@saitify/configurator';
import { parseDraft } from '@saitify/configurator';
import { call } from '../app/api-client';

export const DRAFT_KEY = 'saitify:configurator:draft';
export const PENDING_KEY = 'saitify:configurator:pending';
export const projectKey = (id: string) => `saitify:configurator:project:${id}`;
/** A guest draft older than this is treated as expired: it is cleared and the user is told. */
export const DRAFT_MAX_AGE_MS = 30 * 24 * 3600 * 1000;

export type StoredDraft = { state: WizardState; savedAt: number | null };

/** Reads the guest draft. `expired` means there was one but it is too old to trust. */
export function readGuestDraft(now = Date.now()): { draft: StoredDraft | null; expired: boolean } {
  const raw = window.localStorage.getItem(DRAFT_KEY);
  if (!raw) return { draft: null, expired: false };
  const state = parseDraft(raw);
  if (!state) return { draft: null, expired: false };
  let savedAt: number | null = null;
  try {
    const v = (JSON.parse(raw) as { savedAt?: unknown }).savedAt;
    savedAt = typeof v === 'number' ? v : null;
  } catch {
    /* parseDraft already validated the JSON */
  }
  if (savedAt !== null && now - savedAt > DRAFT_MAX_AGE_MS) return { draft: null, expired: true };
  return { draft: { state, savedAt }, expired: false };
}

/**
 * Stable id for "save this draft to my account". It survives sign-up, email steps, redirects and refreshes,
 * and the server treats a repeated id as the same project, so a retry can never create a duplicate.
 */
export function pendingKey(): string {
  try {
    const existing = JSON.parse(window.localStorage.getItem(PENDING_KEY) ?? 'null') as { key?: string } | null;
    if (existing?.key && /^[A-Za-z0-9_-]{8,64}$/.test(existing.key)) return existing.key;
  } catch {
    /* fall through and create one */
  }
  const key = crypto.randomUUID().replace(/-/g, '');
  try {
    window.localStorage.setItem(PENDING_KEY, JSON.stringify({ key, at: Date.now() }));
  } catch {
    /* storage unavailable: the key still works for this page view */
  }
  return key;
}

export function clearGuestDraft() {
  try {
    window.localStorage.removeItem(DRAFT_KEY);
    window.localStorage.removeItem(PENDING_KEY);
  } catch {
    /* ignore */
  }
}

export type SaveResult = { ok: true; id: string; status: string } | { ok: false; message: string; unauthenticated: boolean };

export async function saveDraftToAccount(state: WizardState): Promise<SaveResult> {
  const r = await call<{ project: { id: string; status: string } }>('/api/projects', { body: { wizard: state, clientKey: pendingKey() } });
  if (r.ok) return { ok: true, id: r.data.project.id, status: r.data.project.status };
  return { ok: false, message: r.error.message, unauthenticated: r.status === 401 };
}

export const destinationFor = (id: string, status: string) => (status === 'configured' ? `/dashboard/projects/${id}?created=1` : `/edit/${id}`);
