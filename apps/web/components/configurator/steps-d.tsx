'use client';

import { CAPABILITIES, getCategory, getTemplate, type Action, type GeneratedProject, type StepId, type WizardState } from '@saitify/configurator';
import { PALETTES, STYLES, defaultRegistry } from '@saitify/engine';
import type { Dispatch, ReactNode } from 'react';
import { StepIntro } from './fields';

function Group({ title, step, dispatch, children }: { title: string; step: StepId; dispatch: Dispatch<Action>; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-midnight/15 bg-white p-5" aria-label={title}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-midnight">{title}</h2>
        <button type="button" onClick={() => dispatch({ type: 'goTo', step })} className="min-h-11 rounded-lg px-3 text-sm font-semibold text-violet underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-violet" aria-label={`Edit ${title}`}>
          Edit
        </button>
      </div>
      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[11rem_1fr]">{children}</dl>
    </section>
  );
}
const Row = ({ label, children }: { label: string; children: ReactNode }) => (
  <>
    <dt className="font-medium text-midnight/60">{label}</dt>
    <dd className="text-midnight">{children}</dd>
  </>
);
const none = <span className="text-midnight/50">Not set</span>;

export function ReviewStep({
  state, dispatch, project, headingRef, done, onFinish,
}: { state: WizardState; dispatch: Dispatch<Action>; project: GeneratedProject; headingRef: React.Ref<HTMLHeadingElement>; done: boolean; onFinish: () => void }) {
  const cat = getCategory(state.category);
  const tpl = getTemplate(state.templateId);
  const caps = CAPABILITIES.filter((c) => state.capabilities.includes(c.id));
  const future = CAPABILITIES.filter((c) => state.interests.includes(c.id));
  const style = STYLES[state.design.style];
  const imagery = { rich: 'Image-heavy', balanced: 'Balanced', minimal: 'Minimal imagery' }[state.design.imagery];
  const density = { compact: 'Compact', comfortable: 'Comfortable', spacious: 'Clean and spacious' }[state.design.density];
  const pages = project.config.pages;
  const download = () => {
    const blob = new Blob([JSON.stringify({ website: project.config, vision: project.vision }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(state.info.name || 'website').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'website'}.saitify.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <StepIntro headingRef={headingRef} title="Review your website" text="Check everything below. Use Edit to change anything: your answers are kept." />
      <div className="grid gap-4">
        <Group title="Your idea" step="category" dispatch={dispatch}>
          <Row label="Website type">{cat?.name ?? none}</Row>
          <Row label="Description">{state.idea.text.trim() || none}</Row>
          <Row label="Target audience">{state.idea.audience.trim() || none}</Row>
          <Row label="Main goal">{state.idea.objective || none}</Row>
        </Group>
        <Group title="Information" step="info" dispatch={dispatch}>
          <Row label="Name">{state.info.name.trim() || none}</Row>
          <Row label="Short description">{state.info.description.trim() || none}</Row>
          <Row label="Language">{state.info.language === 'ro' ? 'Română' : 'English'}</Row>
          {cat?.fields.map((f) => <Row key={f.id} label={f.label}>{(state.info.extra[f.id] ?? '').trim() || none}</Row>)}
          <Row label="Contact">{[state.info.email, state.info.phone, state.info.address].filter((x) => x.trim()).join(' · ') || none}</Row>
        </Group>
        <Group title="Pages and sections" step="pages" dispatch={dispatch}>
          {pages.map((pg) => (
            <Row key={pg.id} label={pg.name + (pg.type === 'home' ? ' · home page' : '')}>
              {(pg.sections ?? []).map((s) => defaultRegistry.get(s.type)?.name ?? s.type).join(', ') || none}
            </Row>
          ))}
        </Group>
        <Group title="Features" step="features" dispatch={dispatch}>
          <Row label="Included">{caps.length ? caps.map((c) => c.name).join(', ') : none}</Row>
          <Row label="Wish list (not available yet)">{future.length ? future.map((c) => c.name).join(', ') : none}</Row>
        </Group>
        <Group title="Design" step="design" dispatch={dispatch}>
          <Row label="Style">{style.name}</Row>
          <Row label="Color palette">{PALETTES[state.design.palette].name}</Row>
          <Row label="Typography">{state.design.style === 'minimal' ? 'Modern sans-serif' : 'Serif headings, sans-serif text'} (comes with the style)</Row>
          <Row label="Pictures">{imagery}</Row>
          <Row label="Spacing">{density}</Row>
        </Group>
        {state.templateId || project.vision.category ? (
          <Group title="Starting design" step={state.templateId || tpl ? 'template' : 'design'} dispatch={dispatch}>
            <Row label="Template">{tpl ? tpl.name : 'None: built from your choices'}</Row>
          </Group>
        ) : null}
      </div>

      {project.placeholders.length > 0 ? (
        <aside className="mt-6 rounded-2xl bg-amber-50 p-5 text-sm text-amber-950" aria-label="Text to replace">
          <p className="font-semibold">{project.placeholders.length} placeholder{project.placeholders.length === 1 ? '' : 's'} to replace later</p>
          <p className="mt-1">We never invent customer reviews, questions or team members. Where your website needs them, we left clearly marked text for you to replace once editing is available.</p>
        </aside>
      ) : null}

      <div className="mt-8 rounded-3xl bg-midnight p-6 text-white sm:p-8">
        {!project.valid ? (
          <p role="alert">Something in your answers needs attention before we can create the configuration. Use Back to check the earlier steps.</p>
        ) : done ? (
          <div data-testid="finished">
            <h2 className="text-2xl font-semibold">Your website configuration is ready</h2>
            <p className="mt-3 max-w-2xl text-white/80">It passed the website engine&rsquo;s validation and is shown in the preview. Publishing, accounts and the visual editor are not part of this version, so for now you can keep the configuration as a file. Your draft stays on this device until you start over.</p>
            <button type="button" onClick={download} className="mt-5 inline-flex min-h-12 items-center rounded-full bg-white px-6 font-semibold text-midnight focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
              Download configuration (JSON)
            </button>
          </div>
        ) : (
          <div>
            <h2 className="text-2xl font-semibold">Everything looks good</h2>
            <p className="mt-3 max-w-2xl text-white/80">Create the configuration for your website. We build it with the same engine that draws the live preview.</p>
            <button type="button" onClick={onFinish} className="mt-5 inline-flex min-h-12 items-center rounded-full bg-gradient-to-r from-violet to-blue px-6 font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
              Create my website configuration
            </button>
          </div>
        )}
      </div>
    </>
  );
}
