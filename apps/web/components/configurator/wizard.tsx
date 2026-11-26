'use client';

import {
  createInitialState,
  generateProject,
  getSteps,
  maxReachableIndex,
  parseDraft,
  reduce,
  serializeDraft,
  validateStep,
  type StepId,
  type WizardState,
} from '@saitify/configurator';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useDeferredValue, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { LogoMark } from '../logo';
import { call } from '../app/api-client';
import { clearGuestDraft, destinationFor, pendingKey, projectKey, readGuestDraft, saveDraftToAccount, DRAFT_KEY } from './draft-storage';
import { Preview } from './preview';
import { CategoryStep, IdeaStep, InfoStep } from './steps-a';
import { FeaturesStep, PagesStep } from './steps-b';
import { DesignStep, TemplateStep } from './steps-c';
import { ReviewStep } from './steps-d';
import { useProjectSync, type ProjectSeed, type SyncStatus } from './use-project-sync';

export { DRAFT_KEY };
const LABELS: Record<StepId, string> = { category: 'Type', idea: 'Idea', info: 'Details', pages: 'Pages', features: 'Features', design: 'Look', template: 'Template', review: 'Review' };

const isPristine = (s: WizardState) => JSON.stringify({ ...s, step: 'category' }) === JSON.stringify(createInitialState());

const SYNC_TEXT: Record<SyncStatus, string> = { saved: 'All changes saved', dirty: 'Unsaved changes…', saving: 'Saving…', error: 'Could not save', conflict: 'Not saved: changed elsewhere', 'signed-out': 'Not saved: signed out' };

export function Wizard({ project }: { project?: ProjectSeed }) {
  const router = useRouter();
  const isProject = Boolean(project);
  const [state, dispatch] = useReducer(reduce, project?.state, (p) => p ?? createInitialState());
  const [ready, setReady] = useState(isProject);
  const [restored, setRestored] = useState(false);
  const [expired, setExpired] = useState(false);
  const [recovered, setRecovered] = useState(false);
  const [auth, setAuth] = useState<'unknown' | 'user' | 'guest'>('unknown');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const sync = useProjectSync(project, state, isProject && ready);
  const [showErrors, setShowErrors] = useState(false);
  const [done, setDone] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [storageOk, setStorageOk] = useState(true);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  useEffect(() => {
    if (project) {
      // Work that was typed but not yet saved (failed save, closed tab) is kept in this browser. Re-apply it only if
      // the server copy has not moved on since; otherwise the user would be overwriting a newer version.
      try {
        const raw = window.localStorage.getItem(projectKey(project.id));
        if (raw) {
          const local = JSON.parse(raw) as { baseRevision?: number; state?: unknown };
          const restoredState = parseDraft(JSON.stringify({ v: 1, savedAt: Date.now(), state: local.state }));
          if (restoredState && local.baseRevision === project.revision && JSON.stringify(restoredState) !== JSON.stringify(project.state)) {
            dispatch({ type: 'hydrate', state: restoredState });
            setRecovered(true);
          } else window.localStorage.removeItem(projectKey(project.id));
        }
      } catch {
        /* storage unavailable */
      }
      return;
    }
    try {
      const { draft, expired: wasExpired } = readGuestDraft();
      if (draft && !isPristine(draft.state)) {
        dispatch({ type: 'hydrate', state: draft.state });
        setRestored(true);
      } else if (wasExpired) {
        window.localStorage.removeItem(DRAFT_KEY);
        setExpired(true);
      } else if (window.localStorage.getItem(DRAFT_KEY)) {
        window.localStorage.removeItem(DRAFT_KEY); // corrupt or empty draft
      }
    } catch {
      setStorageOk(false);
    }
    setReady(true);
    void call<{ user: unknown }>('/api/session', { method: 'GET' }).then((r) => setAuth(r.ok && r.data.user ? 'user' : r.ok ? 'guest' : 'unknown'));
  }, [project]);

  useEffect(() => {
    if (!ready || isProject) return;
    const id = window.setTimeout(() => {
      try {
        if (isPristine(state)) window.localStorage.removeItem(DRAFT_KEY);
        else window.localStorage.setItem(DRAFT_KEY, serializeDraft(state));
      } catch {
        setStorageOk(false);
      }
    }, 250);
    return () => window.clearTimeout(id);
  }, [state, ready, isProject]);

  const steps = getSteps(state);
  const index = Math.max(0, steps.indexOf(state.step));
  const step = steps[index]!;
  const errors = useMemo(() => validateStep(step, state), [step, state]);
  const reachable = maxReachableIndex(state);
  const deferred = useDeferredValue(state);
  const previewProject = useMemo(() => generateProject(deferred), [deferred]);
  const finalProject = useMemo(() => generateProject(state), [state]);

  useEffect(() => {
    setShowErrors(false);
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
    window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }, [step]);

  const next = useCallback(() => {
    if (Object.keys(errors).length > 0) {
      setShowErrors(true);
      window.setTimeout(() => (document.querySelector('[aria-invalid="true"], [role="alert"]') as HTMLElement | null)?.focus?.(), 0);
      return;
    }
    const n = steps[index + 1];
    if (n) dispatch({ type: 'goTo', step: n });
  }, [errors, steps, index]);
  const back = () => {
    const p = steps[index - 1];
    if (p) dispatch({ type: 'goTo', step: p });
  };
  const start = () => {
    dispatch({ type: 'reset' });
    setRestored(false);
    setDone(false);
    setConfirmReset(false);
    clearGuestDraft();
  };

  const saveToAccount = async () => {
    if (saving) return;
    setSaving(true);
    setSaveError(null);
    const r = await saveDraftToAccount(state);
    if (r.ok) {
      clearGuestDraft();
      router.push(destinationFor(r.id, r.status));
      return;
    }
    setSaving(false);
    if (r.unauthenticated) {
      setAuth('guest');
      setSaveError('Your session has ended. Sign in again to save: your answers are still here.');
    } else setSaveError(r.message);
  };
  const finishGuest = () => {
    setDone(true);
    if (auth === 'user') void saveToAccount();
  };
  const openProject = async () => {
    if (!project || opening) return;
    setOpening(true);
    await sync.flushNow();
    router.push(`/dashboard/projects/${project.id}`);
  };

  const props = { state, dispatch, errors, show: showErrors, headingRef };
  const showPreview = step !== 'category' && step !== 'idea' && step !== 'template' && state.category !== null;
  const errorList = Object.values(errors);

  return (
    <div className="min-h-screen bg-cloud">
      <header className="border-b border-midnight/10 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-5 py-3 sm:px-8">
          <Link href="/" aria-label="Saitify home" className="inline-flex items-center gap-2.5 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-violet">
            <LogoMark />
            <span className="text-xl font-semibold tracking-tight text-midnight">Saitify</span>
          </Link>
          <div className="flex items-center gap-2">
            {project ? (
              <>
                <p role="status" data-testid="save-status" className={`hidden text-sm font-medium sm:block ${sync.status === 'saved' ? 'text-midnight/70' : sync.status === 'error' || sync.status === 'conflict' || sync.status === 'signed-out' ? 'text-red-700' : 'text-midnight/70'}`}>{SYNC_TEXT[sync.status]}</p>
                <Link href={`/dashboard/projects/${project.id}`} className="inline-flex min-h-11 items-center rounded-lg border border-midnight/20 px-3 text-sm font-medium text-midnight hover:border-violet focus-visible:outline-2 focus-visible:outline-violet">Project page</Link>
                <Link href="/dashboard" className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-midnight/75 hover:text-violet focus-visible:outline-2 focus-visible:outline-violet">Exit</Link>
              </>
            ) : (
              <>
                {confirmReset ? (
                  <div role="group" aria-label="Confirm start over" className="flex items-center gap-2 text-sm">
                    <span className="hidden text-midnight/75 sm:inline">Clear all your answers?</span>
                    <button type="button" onClick={start} className="min-h-11 rounded-lg bg-red-700 px-3 font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700">Yes, start over</button>
                    <button type="button" onClick={() => setConfirmReset(false)} className="min-h-11 rounded-lg border border-midnight/20 px-3 font-medium text-midnight">Cancel</button>
                  </div>
                ) : (
                  <>
                    {!isPristine(state) && ready ? (
                      auth === 'user' ? (
                        <button type="button" onClick={() => void saveToAccount()} disabled={saving} className="min-h-11 rounded-lg bg-midnight px-3 text-sm font-semibold text-white disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet">{saving ? 'Saving…' : 'Save to my account'}</button>
                      ) : (
                        <a href={`/register?next=${encodeURIComponent('/create/save')}`} onClick={() => pendingKey()} className="inline-flex min-h-11 items-center rounded-lg bg-midnight px-3 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet">Save to account</a>
                      )
                    ) : null}
                    <button type="button" onClick={() => setConfirmReset(true)} disabled={isPristine(state)} className="min-h-11 rounded-lg border border-midnight/20 px-3 text-sm font-medium text-midnight hover:border-violet disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-violet">Start over</button>
                  </>
                )}
                <Link href="/" className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-midnight/75 hover:text-violet focus-visible:outline-2 focus-visible:outline-violet">Exit</Link>
              </>
            )}
          </div>
        </div>
        <nav aria-label="Progress" className="mx-auto max-w-7xl px-5 pb-3 sm:px-8">
          <p className="mb-2 text-sm font-medium text-midnight/70 sm:hidden" aria-live="polite">Step {index + 1} of {steps.length}: {LABELS[step]}</p>
          <ol className="flex gap-1.5 overflow-x-auto sm:gap-2" data-testid="stepper">
            {steps.map((s, i) => {
              const current = i === index;
              const enabled = i <= reachable;
              return (
                <li key={s} className="min-w-0 flex-1">
                  <button type="button" disabled={!enabled} aria-current={current ? 'step' : undefined} onClick={() => dispatch({ type: 'goTo', step: s })} className={`flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg px-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-violet ${current ? 'bg-midnight text-white' : enabled ? 'bg-violet/10 text-midnight hover:bg-violet/20' : 'bg-midnight/5 text-midnight/45'}`}>
                    <span aria-hidden="true" className="text-xs opacity-70">{i + 1}</span>
                    <span className="hidden truncate sm:inline">{LABELS[s]}</span>
                    <span className="sr-only sm:hidden">{LABELS[s]}</span>
                  </button>
                </li>
              );
            })}
          </ol>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-midnight/10" aria-hidden="true">
            <div className="h-full bg-gradient-to-r from-violet to-blue motion-safe:transition-[width]" style={{ width: `${((index + 1) / steps.length) * 100}%` }} />
          </div>
        </nav>
      </header>

      <div className={`mx-auto grid max-w-7xl gap-8 px-5 py-8 sm:px-8 sm:py-10 ${showPreview ? 'xl:grid-cols-[minmax(0,1fr)_minmax(0,34rem)]' : ''}`}>
        <main id="main" className="min-w-0">
          {!ready ? (
            <p role="status" className="text-midnight/70">Loading…</p>
          ) : (
            <>
              {restored ? (
                <p role="status" className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-violet/10 p-4 text-sm text-midnight">
                  <span>We restored your saved draft from this device.</span>
                  <button type="button" onClick={() => setRestored(false)} className="min-h-11 rounded-lg px-3 font-semibold text-violet underline underline-offset-4">Dismiss</button>
                </p>
              ) : null}
              {expired ? <p role="status" className="mb-6 rounded-2xl bg-amber-50 p-4 text-sm text-amber-950">Your saved draft on this device was more than 30 days old, so we cleared it. You can start again below.</p> : null}
              {recovered ? <p role="status" className="mb-6 rounded-2xl bg-violet/10 p-4 text-sm text-midnight">We restored changes from this device that had not reached your account yet. They are being saved now.</p> : null}
              {project && sync.status === 'error' ? (
                <p role="alert" className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-red-50 p-4 text-sm text-red-900">
                  <span>We could not save your latest changes. They are kept in this browser and we will keep trying.</span>
                  <button type="button" onClick={sync.retry} className="min-h-11 rounded-lg bg-red-700 px-4 font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700">Try again now</button>
                </p>
              ) : null}
              {project && sync.status === 'conflict' ? (
                <div role="alert" className="mb-6 rounded-2xl bg-amber-50 p-4 text-sm text-amber-950">
                  <p className="font-semibold">This project was saved from another tab or device while you were editing.</p>
                  <p className="mt-1">Saving is paused so nothing is overwritten by accident. Choose which version to keep.</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" onClick={sync.discardLocalAndReload} className="min-h-11 rounded-lg border border-amber-900/30 bg-white px-4 font-semibold text-midnight focus-visible:outline-2 focus-visible:outline-violet">Load the latest saved version</button>
                    <button type="button" onClick={sync.overwrite} className="min-h-11 rounded-lg bg-midnight px-4 font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet">Keep my version and overwrite</button>
                  </div>
                </div>
              ) : null}
              {project && sync.status === 'signed-out' ? (
                <p role="alert" className="mb-6 rounded-2xl bg-amber-50 p-4 text-sm text-amber-950">
                  Your session has ended, so your latest changes are not saved yet. They are kept in this browser. <a className="font-semibold underline underline-offset-4" href={`/login?next=${encodeURIComponent(`/edit/${project.id}`)}`}>Sign in again</a> to continue and save them.
                </p>
              ) : null}
              {!storageOk ? <p role="status" className="mb-6 rounded-2xl bg-amber-50 p-4 text-sm text-amber-950">Your browser does not allow saving drafts, so your answers will be lost if you close this page.</p> : null}
              {showErrors && errorList.length > 0 ? <p role="alert" tabIndex={-1} className="mb-6 rounded-2xl bg-red-50 p-4 text-sm font-semibold text-red-800">Please fix {errorList.length === 1 ? 'one thing' : `${errorList.length} things`} below to continue.</p> : null}
              <div key={step} className="motion-safe:animate-[fadein_.25s_ease-out]">
                {step === 'category' && <CategoryStep {...props} />}
                {step === 'idea' && <IdeaStep {...props} />}
                {step === 'info' && <InfoStep {...props} />}
                {step === 'pages' && <PagesStep {...props} />}
                {step === 'features' && <FeaturesStep {...props} />}
                {step === 'design' && <DesignStep {...props} />}
                {step === 'template' && <TemplateStep {...props} />}
                {step === 'review' && (
                  <ReviewStep
                    state={state}
                    dispatch={dispatch}
                    project={finalProject}
                    headingRef={headingRef}
                    finish={project ? { mode: 'project', projectId: project.id, status: sync.status, onOpen: () => void openProject(), opening } : { mode: 'guest', auth, done, saving, error: saveError, onFinish: finishGuest, onSave: () => void saveToAccount(), onBeforeAuth: () => void pendingKey() }}
                  />
                )}
              </div>
              {showPreview ? (
                <div className="mt-8 xl:hidden">
                  <button type="button" aria-expanded={previewOpen} onClick={() => setPreviewOpen((v) => !v)} className="min-h-12 w-full rounded-xl border border-midnight/20 bg-white px-4 font-semibold text-midnight focus-visible:outline-2 focus-visible:outline-violet">
                    {previewOpen ? 'Hide preview' : 'Show live preview'}
                  </button>
                  {previewOpen ? <div className="mt-4"><Preview project={previewProject} /></div> : null}
                </div>
              ) : null}
              <div className="mt-10 flex items-center justify-between gap-3 border-t border-midnight/10 pt-6">
                <button type="button" onClick={back} disabled={index === 0} className="min-h-12 rounded-full border border-midnight/20 bg-white px-6 font-semibold text-midnight disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-violet">Back</button>
                {step !== 'review' ? (
                  <button type="button" onClick={next} className="min-h-12 rounded-full bg-gradient-to-r from-violet to-blue px-8 font-semibold text-white shadow-lg shadow-violet/25 hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet">Continue</button>
                ) : null}
              </div>
            </>
          )}
        </main>
        {showPreview && ready ? (
          <aside aria-label="Preview" className="hidden xl:block">
            <div className="sticky top-6"><Preview project={previewProject} /></div>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
