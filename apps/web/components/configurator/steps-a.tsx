'use client';

import { CATEGORIES, LANGUAGES, OBJECTIVES, SOCIAL_NETWORKS, getCategory, type Action, type Errors, type WizardState } from '@saitify/configurator';
import type { Dispatch } from 'react';
import { Select, StepIntro, TextArea, TextInput } from './fields';

type P = { state: WizardState; dispatch: Dispatch<Action>; errors: Errors; show: boolean; headingRef: React.Ref<HTMLHeadingElement> };
const err = (p: P, key: string) => (p.show ? p.errors[key] : undefined);

export function CategoryStep(p: P) {
  const { state, dispatch } = p;
  return (
    <>
      <StepIntro headingRef={p.headingRef} title="What do you want to create?" text="Pick the closest match. It is only a starting point: you can add or change anything later." />
      <fieldset>
        <legend className="sr-only">Website type</legend>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {CATEGORIES.map((c) => {
            const selected = state.category === c.id;
            return (
              <label
                key={c.id}
                className={`flex cursor-pointer flex-col gap-1.5 rounded-2xl border p-5 transition has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-violet ${selected ? 'border-violet bg-violet/5 ring-2 ring-violet' : 'border-midnight/15 bg-white hover:border-violet/60'}`}
              >
                <input type="radio" name="category" value={c.id} checked={selected} onChange={() => dispatch({ type: 'setCategory', category: c.id })} className="sr-only" />
                <span className="text-base font-semibold text-midnight">{c.name}</span>
                <span className="text-sm leading-snug text-midnight/70">{c.description}</span>
              </label>
            );
          })}
        </div>
        {err(p, 'category') ? <p className="mt-3 text-sm font-medium text-red-700">{err(p, 'category')}</p> : null}
      </fieldset>
    </>
  );
}

export function IdeaStep(p: P) {
  const { state, dispatch } = p;
  const cat = getCategory(state.category);
  const patch = (k: keyof WizardState['idea'], v: string) => dispatch({ type: 'patchIdea', patch: { [k]: v } });
  return (
    <>
      <StepIntro headingRef={p.headingRef} title="Describe your idea" text="Write it the way you would tell a friend. Short is fine: we use it to suggest pages and features, and you can change everything." />
      <div className="grid gap-6">
        <TextArea id="idea-text" label="Tell us about your website" optional={state.category !== 'other'} rows={5} value={state.idea.text} maxLength={2000} onChange={(e) => patch('text', e.target.value)} placeholder={cat?.ideaExample ?? 'Tell us what your website is about, who it is for and what you want visitors to do.'} error={err(p, 'text')} />
        <details className="rounded-2xl border border-midnight/15 bg-white p-5" open={!!(state.idea.audience || state.idea.different || state.idea.actions)}>
          <summary className="cursor-pointer text-base font-semibold text-midnight focus-visible:outline-2 focus-visible:outline-violet">Add more detail (optional)</summary>
          <div className="mt-5 grid gap-5">
            <TextInput id="idea-audience" label="Who is it for?" optional value={state.idea.audience} maxLength={300} onChange={(e) => patch('audience', e.target.value)} placeholder="Homeowners in Brașov" />
            <Select id="idea-objective" label="What is the main goal?" optional value={state.idea.objective} placeholder="Choose one" options={OBJECTIVES.map((o) => ({ value: o, label: o }))} onChange={(v) => patch('objective', v)} />
            <TextArea id="idea-different" label="What makes you different?" optional rows={3} value={state.idea.different} maxLength={600} onChange={(e) => patch('different', e.target.value)} />
            <TextInput id="idea-actions" label="What should visitors do?" optional value={state.idea.actions} maxLength={300} onChange={(e) => patch('actions', e.target.value)} placeholder="Call us, send an email, visit the shop" />
          </div>
        </details>
      </div>
    </>
  );
}

export function InfoStep(p: P) {
  const { state, dispatch } = p;
  const cat = getCategory(state.category);
  const info = state.info;
  const patch = (k: keyof Omit<WizardState['info'], 'social' | 'extra'>, v: string) => dispatch({ type: 'patchInfo', patch: { [k]: v } });
  return (
    <>
      <StepIntro headingRef={p.headingRef} title="About your website" text="Only the name is required. Everything else is optional and can be added later." />
      <div className="grid gap-10">
        <section aria-labelledby="info-basics" className="grid gap-5">
          <h2 id="info-basics" className="text-xl font-semibold text-midnight">The basics</h2>
          <TextInput id="info-name" label="Name of your website, business or project" value={info.name} maxLength={80} onChange={(e) => patch('name', e.target.value)} error={err(p, 'name')} autoComplete="organization" />
          <TextArea id="info-description" label="Short description" optional rows={3} value={info.description} maxLength={400} onChange={(e) => patch('description', e.target.value)} help="One or two sentences shown at the top of your home page." />
          <Select id="info-language" label="Website language" value={info.language} options={LANGUAGES.map((l) => ({ value: l.id, label: l.name }))} onChange={(v) => patch('language', v)} help="The text we write for you uses this language. A few fixed labels inside the website, such as the map note, are still in English." />
        </section>
        {cat ? (
          <section aria-labelledby="info-about" className="grid gap-5">
            <h2 id="info-about" className="text-xl font-semibold text-midnight">About your {cat.name.toLowerCase().split(' / ')[0]}</h2>
            {cat.fields.map((f) => {
              const id = `extra-${f.id}`;
              const value = info.extra[f.id] ?? '';
              const common = { id, label: f.label, help: f.help, optional: !f.required, error: err(p, `extra:${f.id}`) };
              if (f.type === 'select') return <Select key={f.id} {...common} value={value} placeholder="Choose one" options={(f.options ?? []).map((o) => ({ value: o, label: o }))} onChange={(v) => dispatch({ type: 'setExtra', id: f.id, value: v })} />;
              if (f.type === 'textarea') return <TextArea key={f.id} {...common} rows={3} value={value} maxLength={f.max} placeholder={f.placeholder} onChange={(e) => dispatch({ type: 'setExtra', id: f.id, value: e.target.value })} />;
              return <TextInput key={f.id} {...common} value={value} maxLength={f.max} placeholder={f.placeholder} onChange={(e) => dispatch({ type: 'setExtra', id: f.id, value: e.target.value })} />;
            })}
            <TextArea id="info-items" label={cat.items.label} optional rows={4} help={`${cat.items.help} We turn each line into an item on your website.`} placeholder={cat.items.placeholder} value={info.items} maxLength={1500} onChange={(e) => patch('items', e.target.value)} />
          </section>
        ) : null}
        <section aria-labelledby="info-contact" className="grid gap-5">
          <div>
            <h2 id="info-contact" className="text-xl font-semibold text-midnight">How can people reach you?</h2>
            <p className="mt-1 text-sm text-midnight/65">All optional. Anything you add will be visible on your public website if you choose the matching feature in a later step.</p>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <TextInput id="info-email" type="email" inputMode="email" autoComplete="email" label="Email" optional value={info.email} maxLength={254} onChange={(e) => patch('email', e.target.value)} error={err(p, 'email')} />
            <TextInput id="info-phone" type="tel" inputMode="tel" autoComplete="tel" label="Phone" optional value={info.phone} maxLength={40} onChange={(e) => patch('phone', e.target.value)} error={err(p, 'phone')} placeholder="+40 700 000 000" />
          </div>
          <TextInput id="info-address" label="Address" optional value={info.address} maxLength={300} onChange={(e) => patch('address', e.target.value)} autoComplete="street-address" />
          <fieldset className="grid gap-4 sm:grid-cols-2">
            <legend className="mb-2 text-sm font-semibold text-midnight">Social media <span className="font-normal text-midnight/55">(optional)</span></legend>
            {SOCIAL_NETWORKS.map((n) => (
              <TextInput key={n} id={`social-${n}`} label={n} value={info.social[n] ?? ''} maxLength={300} onChange={(e) => dispatch({ type: 'setSocial', network: n, value: e.target.value })} placeholder="Paste the link to your profile" error={err(p, `social:${n}`)} />
            ))}
          </fieldset>
          <div>
            <p className="mb-1.5 text-sm font-semibold text-midnight">Logo <span className="font-normal text-midnight/55">(not available yet)</span></p>
            <p className="rounded-xl border border-dashed border-midnight/20 px-4 py-3 text-sm text-midnight/60">Logo upload comes with accounts and file storage. For now your website uses your name as its logo.</p>
          </div>
        </section>
      </div>
    </>
  );
}
