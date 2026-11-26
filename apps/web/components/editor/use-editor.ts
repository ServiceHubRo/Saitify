'use client';

import { EditorError, canRedo, canUndo, createHistory, push, redo, setContent, undo, type ContentResult, type History } from '@saitify/editor';
import type { Website } from '@saitify/engine';
import { useCallback, useReducer, useRef } from 'react';

type Action =
  | { type: 'apply'; site: Website; label: string; group?: string }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'load'; site: Website };

function reducer(h: History<Website>, a: Action): History<Website> {
  switch (a.type) {
    case 'apply':
      return push(h, a.site, a.label, { group: a.group });
    case 'undo':
      return undo(h);
    case 'redo':
      return redo(h);
    case 'load':
      return createHistory(a.site);
  }
}

export type EditResult = { ok: true } | { ok: false; error: string };

/**
 * Editor document state. Every edit is a pure function of the current website, validated before it is applied, so the
 * model never holds a state the renderer or the server would reject. Failed edits are returned as readable messages.
 */
export function useEditorState(initial: Website) {
  const [history, dispatch] = useReducer(reducer, initial, createHistory);
  const current = useRef(initial);
  current.current = history.present;

  const edit = useCallback((label: string, fn: (site: Website) => Website, opts: { group?: string } = {}): EditResult => {
    try {
      const next = fn(current.current);
      if (next === current.current) return { ok: true };
      current.current = next; // so two edits in one event see each other's result
      dispatch({ type: 'apply', site: next, label, group: opts.group });
      return { ok: true };
    } catch (e) {
      if (e instanceof EditorError) return { ok: false, error: e.message };
      throw e;
    }
  }, []);

  const editContent = useCallback((sectionId: string, path: readonly (string | number)[], value: unknown, label = 'Edit text', group?: string): EditResult => {
    const r: ContentResult = setContent(current.current, sectionId, path, value);
    if (!r.ok) return { ok: false, error: r.error };
    if (r.site !== current.current) {
      current.current = r.site;
      dispatch({ type: 'apply', site: r.site, label, group: group ?? `${sectionId}:${path.join('.')}` });
    }
    return { ok: true };
  }, []);

  const apply = useCallback((site: Website, label: string) => {
    current.current = site;
    dispatch({ type: 'apply', site, label });
  }, []);

  return {
    site: history.present,
    label: history.label,
    canUndo: canUndo(history),
    canRedo: canRedo(history),
    undo: useCallback(() => dispatch({ type: 'undo' }), []),
    redo: useCallback(() => dispatch({ type: 'redo' }), []),
    load: useCallback((site: Website) => dispatch({ type: 'load', site }), []),
    edit,
    editContent,
    apply,
    undoLabel: history.pastLabels[history.pastLabels.length - 1] ? history.label : '',
    redoLabel: history.futureLabels[0] ?? '',
  };
}
