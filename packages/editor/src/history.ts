/**
 * Undo/redo over immutable snapshots. Every edit produces a new object that shares unchanged parts with the old
 * one, so keeping many snapshots is cheap; the stack is still capped. Edits that carry the same `group` within a
 * short window (typing in one field) collapse into a single undo step.
 */
export type History<T> = {
  past: T[];
  present: T;
  future: T[];
  /** Label of the edit that produced `present` (for "Undo: ..." hints). */
  label: string;
  pastLabels: string[];
  futureLabels: string[];
  group?: string;
  at: number;
};

export const HISTORY_LIMIT = 100;
export const GROUP_WINDOW_MS = 1500;

export const createHistory = <T>(present: T): History<T> => ({ past: [], present, future: [], label: '', pastLabels: [], futureLabels: [], at: 0 });

export function push<T>(h: History<T>, next: T, label: string, opts: { group?: string; now?: number } = {}): History<T> {
  if (next === h.present) return h;
  const now = opts.now ?? Date.now();
  if (opts.group && h.group === opts.group && now - h.at <= GROUP_WINDOW_MS && h.past.length > 0) {
    return { ...h, present: next, future: [], futureLabels: [], at: now };
  }
  const past = [...h.past, h.present].slice(-HISTORY_LIMIT);
  const pastLabels = [...h.pastLabels, h.label].slice(-HISTORY_LIMIT);
  return { past, present: next, future: [], label, pastLabels, futureLabels: [], group: opts.group, at: now };
}

export const canUndo = (h: History<unknown>) => h.past.length > 0;
export const canRedo = (h: History<unknown>) => h.future.length > 0;

export function undo<T>(h: History<T>): History<T> {
  if (!canUndo(h)) return h;
  const previous = h.past[h.past.length - 1]!;
  return {
    past: h.past.slice(0, -1),
    present: previous,
    future: [h.present, ...h.future],
    label: h.pastLabels[h.pastLabels.length - 1] ?? '',
    pastLabels: h.pastLabels.slice(0, -1),
    futureLabels: [h.label, ...h.futureLabels],
    at: 0,
  };
}

export function redo<T>(h: History<T>): History<T> {
  if (!canRedo(h)) return h;
  const next = h.future[0]!;
  return {
    past: [...h.past, h.present],
    present: next,
    future: h.future.slice(1),
    label: h.futureLabels[0] ?? '',
    pastLabels: [...h.pastLabels, h.label],
    futureLabels: h.futureLabels.slice(1),
    at: 0,
  };
}

/** Replace the current state without creating an undo step (e.g. after loading a newer server version). */
export const reset = <T>(present: T): History<T> => createHistory(present);
