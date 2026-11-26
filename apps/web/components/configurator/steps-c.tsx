'use client';

import { PALETTES, PALETTE_IDS, STYLES, STYLE_IDS, relativeLuminance } from '@saitify/engine';
import { generateWithTemplate, templatesFor, type Action, type CategoryId, type Errors, type WizardState } from '@saitify/configurator';
import { SiteRenderer } from '@saitify/engine';
import { useMemo, type Dispatch } from 'react';
import { StepIntro } from './fields';
import { useFit } from './preview';

type P = { state: WizardState; dispatch: Dispatch<Action>; errors: Errors; show: boolean; headingRef: React.Ref<HTMLHeadingElement> };

const card = (selected: boolean) =>
  `flex min-w-0 cursor-pointer flex-col gap-3 rounded-2xl border p-4 transition has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-violet ${selected ? 'border-violet bg-violet/5 ring-2 ring-violet' : 'border-midnight/15 bg-white hover:border-violet/60'}`;

function Choice<T extends string>({ legend, name, value, options, onChange }: { legend: string; name: string; value: T; options: { value: T; label: string; hint: string }[]; onChange: (v: T) => void }) {
  return (
    <fieldset>
      <legend className="mb-3 text-lg font-semibold text-midnight">{legend}</legend>
      <div className="grid gap-3 sm:grid-cols-3">
        {options.map((o) => (
          <label key={o.value} className={card(value === o.value)}>
            <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} className="sr-only" />
            <span className="font-semibold text-midnight">{o.label}</span>
            <span className="text-sm text-midnight/70">{o.hint}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function DesignStep(p: P) {
  const { state, dispatch } = p;
  const d = state.design;
  return (
    <>
      <StepIntro headingRef={p.headingRef} title="Choose your look" text="Pick a style and colors. Everything stays editable later." />
      <div className="grid gap-10">
        <fieldset>
          <legend className="mb-3 text-lg font-semibold text-midnight">Style</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {STYLE_IDS.map((id) => {
              const s = STYLES[id];
              return (
                <label key={id} className={card(d.style === id)}>
                  <input type="radio" name="style" value={id} checked={d.style === id} onChange={() => dispatch({ type: 'patchDesign', patch: { style: id } })} className="sr-only" />
                  <span aria-hidden="true" className="text-4xl text-midnight" style={{ fontFamily: s.typography.headingFont, fontWeight: s.typography.headingWeight }}>Aa</span>
                  <span className="font-semibold text-midnight">{s.name}</span>
                  <span className="text-sm text-midnight/70">{id === 'minimal' ? 'Clean, spacious, modern, simple.' : 'Refined, sophisticated, elegant, carefully composed.'}</span>
                  <span className="text-xs text-midnight/55">Lettering: {id === 'minimal' ? 'modern sans-serif' : 'classic serif headings with sans-serif text'}</span>
                </label>
              );
            })}
          </div>
          <p className="mt-3 text-sm text-midnight/65">Lettering comes with the style, so you do not have to choose fonts.</p>
        </fieldset>

        <fieldset>
          <legend className="mb-3 text-lg font-semibold text-midnight">Color palette</legend>
          <div className="grid gap-3 sm:grid-cols-3">
            {PALETTE_IDS.map((id) => {
              const pal = PALETTES[id];
              const c = pal.colors;
              const dark = relativeLuminance(c.background) < 0.2;
              return (
                <label key={id} className={card(d.palette === id)}>
                  <input type="radio" name="palette" value={id} checked={d.palette === id} onChange={() => dispatch({ type: 'patchDesign', patch: { palette: id } })} className="sr-only" />
                  <span aria-hidden="true" className="flex h-16 overflow-hidden rounded-xl ring-1 ring-midnight/10" style={{ background: c.background }}>
                    {[c.primary, c.secondary, c.accent, c.surface].map((col, i) => <span key={i} className="flex-1" style={{ background: col }} />)}
                  </span>
                  <span className="font-semibold text-midnight">{pal.name} <span className="font-normal text-midnight/60">· {dark ? 'Dark' : 'Light'}</span></span>
                  <span className="text-sm text-midnight/70">{pal.description}</span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <Choice legend="Pictures" name="imagery" value={d.imagery} onChange={(v) => dispatch({ type: 'patchDesign', patch: { imagery: v } })} options={[
          { value: 'rich', label: 'Image-heavy', hint: 'Big pictures lead the pages.' },
          { value: 'balanced', label: 'Balanced', hint: 'Pictures and text share the stage.' },
          { value: 'minimal', label: 'Minimal imagery', hint: 'Text first, very few pictures.' },
        ]} />
        <Choice legend="Spacing" name="density" value={d.density} onChange={(v) => dispatch({ type: 'patchDesign', patch: { density: v } })} options={[
          { value: 'compact', label: 'Compact', hint: 'More content on the screen.' },
          { value: 'comfortable', label: 'Comfortable', hint: 'A good everyday balance.' },
          { value: 'spacious', label: 'Clean and spacious', hint: 'Lots of breathing room.' },
        ]} />
      </div>
    </>
  );
}

function TemplatePreview({ state, templateId }: { state: WizardState; templateId: string | null }) {
  const project = useMemo(() => generateWithTemplate(state, templateId), [state, templateId]);
  const { ref, scale } = useFit(1100);
  return (
    <div ref={ref} aria-hidden="true" className="relative h-52 w-full min-w-0 overflow-hidden rounded-xl bg-cloud ring-1 ring-midnight/10">
      <div inert style={{ width: 1100, zoom: scale }} className="pointer-events-none select-none bg-white">
        <SiteRenderer website={project.config} />
      </div>
    </div>
  );
}

export function TemplateStep(p: P) {
  const { state, dispatch } = p;
  const templates = templatesFor(state.category as CategoryId | null);
  return (
    <>
      <StepIntro headingRef={p.headingRef} title="Pick a starting design" text="These are real layouts built from your own answers. Choosing one only sets the starting point: you can still change pages, sections and colors." />
      <fieldset>
        <legend className="sr-only">Starting design</legend>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2">
          {templates.map((t) => (
            <label key={t.id} className={card(state.templateId === t.id)}>
              <input type="radio" name="template" value={t.id} checked={state.templateId === t.id} onChange={() => dispatch({ type: 'selectTemplate', id: t.id })} className="sr-only" />
              <TemplatePreview state={state} templateId={t.id} />
              <span className="font-semibold text-midnight">{t.name}{state.templateId === t.id ? <span className="ml-2 text-sm font-medium text-violet">Selected</span> : null}</span>
              <span className="text-sm text-midnight/70">{t.description}</span>
            </label>
          ))}
          <label className={card(state.templateId === null)}>
            <input type="radio" name="template" value="" checked={state.templateId === null} onChange={() => dispatch({ type: 'selectTemplate', id: null })} className="sr-only" />
            <TemplatePreview state={state} templateId={null} />
            <span className="font-semibold text-midnight">Start from my choices{state.templateId === null ? <span className="ml-2 text-sm font-medium text-violet">Selected</span> : null}</span>
            <span className="text-sm text-midnight/70">No template: the standard layout for each section.</span>
          </label>
        </div>
      </fieldset>
    </>
  );
}
