'use client';

import {
  CAPABILITIES,
  PAGE_DEFS,
  canAddPage,
  getCategory,
  type Action,
  type Errors,
  type PageKey,
  type WizardState,
} from '@saitify/configurator';
import { useState, type Dispatch } from 'react';
import { StepIntro, Pill, inputClass } from './fields';

type P = { state: WizardState; dispatch: Dispatch<Action>; errors: Errors; show: boolean; headingRef: React.Ref<HTMLHeadingElement> };

const iconBtn =
  'inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-midnight/15 bg-white px-3 text-sm font-medium text-midnight hover:border-violet focus-visible:outline-2 focus-visible:outline-violet disabled:cursor-not-allowed disabled:opacity-40';

export function PagesStep(p: P) {
  const { state, dispatch } = p;
  const cat = getCategory(state.category);
  const [custom, setCustom] = useState('');
  const addable = (cat?.pages.available ?? []).filter((k) => k !== 'custom' && canAddPage(state.category as never, state.pages, k));
  return (
    <>
      <StepIntro headingRef={p.headingRef} title="Choose your pages" text="We suggested pages for your website. Rename them, change the order, add more or remove the ones you do not need." />
      {p.show && p.errors._ ? <p role="alert" className="mb-4 rounded-xl bg-red-50 p-4 text-sm font-medium text-red-800">{p.errors._}</p> : null}
      <fieldset>
        <legend className="sr-only">Your pages, in menu order. Choose one as your home page.</legend>
        <ol className="grid gap-3" data-testid="page-list">
          {state.pages.map((page, i) => {
            const def = PAGE_DEFS[page.key];
            const error = p.show ? p.errors[`page:${page.id}`] : undefined;
            return (
              <li key={page.id} className="rounded-2xl border border-midnight/15 bg-white p-4">
                <div className="flex flex-wrap items-end gap-3">
                  <div className="min-w-48 flex-1">
                    <label htmlFor={`page-${page.id}`} className="mb-1 block text-sm font-semibold text-midnight">Page {i + 1} name</label>
                    <input id={`page-${page.id}`} className={inputClass} value={page.name} maxLength={60} aria-invalid={error ? true : undefined} aria-describedby={error ? `page-${page.id}-error` : undefined} onChange={(e) => dispatch({ type: 'renamePage', id: page.id, name: e.target.value })} />
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" className={iconBtn} disabled={i === 0} aria-label={`Move ${page.name || 'page'} up`} onClick={() => dispatch({ type: 'movePage', id: page.id, delta: -1 })}>↑</button>
                    <button type="button" className={iconBtn} disabled={i === state.pages.length - 1} aria-label={`Move ${page.name || 'page'} down`} onClick={() => dispatch({ type: 'movePage', id: page.id, delta: 1 })}>↓</button>
                    <button type="button" className={iconBtn} disabled={state.pages.length <= 1} aria-label={`Remove ${page.name || 'page'}`} onClick={() => dispatch({ type: 'removePage', id: page.id })}>Remove</button>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
                  <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 font-medium text-midnight">
                    <input type="radio" name="home-page" checked={state.homeId === page.id} onChange={() => dispatch({ type: 'setHome', id: page.id })} className="size-4 accent-violet" />
                    Home page
                  </label>
                  <span className="text-midnight/60">{def.description}{def.note ? ` ${def.note}` : ''}</span>
                </div>
                {error ? <p id={`page-${page.id}-error`} className="mt-1 text-sm font-medium text-red-700">{error}</p> : null}
              </li>
            );
          })}
        </ol>
      </fieldset>

      <section aria-labelledby="add-pages" className="mt-10">
        <h2 id="add-pages" className="text-xl font-semibold text-midnight">Add a page</h2>
        {addable.length === 0 ? <p className="mt-2 text-sm text-midnight/65">You have added every page that fits this type of website. You can still add your own page below.</p> : null}
        <ul className="mt-4 flex flex-wrap gap-2">
          {addable.map((k: PageKey) => (
            <li key={k}>
              <button type="button" className={iconBtn} onClick={() => dispatch({ type: 'addPage', key: k })} title={PAGE_DEFS[k].description}>+ {PAGE_DEFS[k].key.charAt(0).toUpperCase() + PAGE_DEFS[k].key.slice(1)}</button>
            </li>
          ))}
        </ul>
        <form className="mt-5 flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); if (custom.trim()) { dispatch({ type: 'addCustomPage', name: custom }); setCustom(''); } }}>
          <div className="min-w-56 flex-1">
            <label htmlFor="custom-page" className="mb-1 block text-sm font-semibold text-midnight">Your own page</label>
            <input id="custom-page" className={inputClass} value={custom} maxLength={60} placeholder="For example: Our story" onChange={(e) => setCustom(e.target.value)} />
          </div>
          <button type="submit" className={iconBtn} disabled={!custom.trim() || state.pages.length >= 20}>Add page</button>
        </form>
        <button type="button" className="mt-6 text-sm font-medium text-violet underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-violet" onClick={() => dispatch({ type: 'resetPages' })}>
          Go back to the suggested pages
        </button>
      </section>
    </>
  );
}

function CapRow({ id, state, dispatch, error, planned }: { id: string; state: WizardState; dispatch: Dispatch<Action>; error?: string; planned: boolean }) {
  const c = CAPABILITIES.find((x) => x.id === id)!;
  const checked = planned ? state.interests.includes(id) : state.capabilities.includes(id);
  const inputId = `cap-${id}`;
  return (
    <li>
      <label htmlFor={inputId} className={`flex cursor-pointer gap-3 rounded-2xl border p-4 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-violet ${checked ? 'border-violet bg-violet/5' : 'border-midnight/15 bg-white'}`}>
        <input id={inputId} type="checkbox" checked={checked} onChange={() => dispatch({ type: planned ? 'toggleInterest' : 'toggleCapability', id })} aria-describedby={`${inputId}-d`} className="mt-1 size-5 shrink-0 accent-violet" />
        <span className="grid gap-1">
          <span className="flex flex-wrap items-center gap-2 font-semibold text-midnight">
            {c.name}
            {planned ? <Pill tone="soon">Not available yet</Pill> : <Pill tone="good">Included</Pill>}
          </span>
          <span id={`${inputId}-d`} className="text-sm text-midnight/70">{c.description}{c.note ? ` ${c.note}` : ''}</span>
          {planned ? <span className="text-sm font-medium text-midnight/80">{checked ? 'Noted as something you want in the future.' : 'Tick to tell us you are interested.'}</span> : null}
          {error ? <span className="text-sm font-medium text-red-700">{error}</span> : null}
        </span>
      </label>
    </li>
  );
}

export function FeaturesStep(p: P) {
  const { state, dispatch } = p;
  const cat = getCategory(state.category);
  const supported = CAPABILITIES.filter((c) => c.status === 'supported');
  const planned = CAPABILITIES.filter((c) => c.status === 'planned');
  const related = planned.filter((c) => cat?.relatedFuture.includes(c.id));
  const others = planned.filter((c) => !cat?.relatedFuture.includes(c.id));
  return (
    <>
      <StepIntro headingRef={p.headingRef} title="What should your website include?" text="These features work today. We pre-selected the ones that fit your website; change them as you like." />
      <ul className="grid gap-3 sm:grid-cols-2" aria-label="Features included in your website">
        {supported.map((c) => (
          <CapRow key={c.id} id={c.id} state={state} dispatch={dispatch} planned={false} error={p.show ? p.errors[`cap:${c.id}`] : undefined} />
        ))}
      </ul>

      <section aria-labelledby="future" className="mt-12 rounded-3xl bg-cloud p-5 sm:p-7">
        <h2 id="future" className="text-xl font-semibold text-midnight">Coming later</h2>
        <p className="mt-2 max-w-2xl text-sm text-midnight/75">
          These are on our roadmap but <strong>not available yet</strong>. Ticking one does not add anything to your website today: we keep it with your project as your wish list.
        </p>
        {related.length ? (
          <>
            <h3 className="mt-5 text-sm font-semibold uppercase tracking-wider text-midnight/60">Related to your website</h3>
            <ul className="mt-3 grid gap-3 sm:grid-cols-2">
              {related.map((c) => <CapRow key={c.id} id={c.id} state={state} dispatch={dispatch} planned />)}
            </ul>
          </>
        ) : null}
        <details className="mt-5">
          <summary className="cursor-pointer text-sm font-semibold text-violet focus-visible:outline-2 focus-visible:outline-violet">More future features</summary>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {others.map((c) => <CapRow key={c.id} id={c.id} state={state} dispatch={dispatch} planned />)}
          </ul>
        </details>
      </section>
    </>
  );
}
