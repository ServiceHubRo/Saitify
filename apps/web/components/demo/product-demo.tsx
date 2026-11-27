'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { SiteFrame } from './site-frame';

/**
 * Homepage product demo: a short, looping simulation of the real Saitlify workflow. The websites inside it are rendered by the real
 * engine from the real configurator output (see DemoSection); only the surrounding interface and the cursor are drawn here, and
 * they show only things the product really does today.
 *
 * Motion rules: nothing plays until the demo is on screen, it pauses when the tab is hidden, a visible Pause/Play control is always
 * offered, and with `prefers-reduced-motion` there is no animation at all: each step shows its finished state and the visitor moves
 * with Previous/Next. The visual stage is hidden from assistive technology; the step text below it carries the same information.
 */

export type DemoData = {
  business: string;
  address: string;
  pages: string[];
  templates: { id: string; name: string; description: string }[];
  generated: ReactNode;
  edited: ReactNode;
  restyled: ReactNode;
};

const BEATS = 5; // beats 0..4 per step
const BEAT_MS = 1200;

const STEPS = [
  { id: 'choose', title: 'Start from a template or from scratch', text: 'Pick one of the starting designs, or just tell us what kind of website you are building.' },
  { id: 'configure', title: 'Answer a few questions', text: 'Your business name, what you offer and how people can reach you. This becomes your first draft.' },
  { id: 'generate', title: 'Your website is generated', text: 'Pages, sections and design are built from your answers and checked by the same engine that publishes your website.' },
  { id: 'edit', title: 'Edit it visually', text: 'Click any text to change it, switch colours and style, add or reorder sections. Changes are saved as you go.' },
  { id: 'preview', title: 'Check every screen', text: 'Switch between desktop, tablet and mobile to see the real layout before anyone else does.' },
  { id: 'publish', title: 'Publish in one step', text: 'Saitlify checks your website, builds it and puts it online at an address you choose.' },
  { id: 'live', title: 'Share it, keep improving', text: 'Edit any time and publish again. Earlier versions can be restored.' },
] as const;
type StepId = (typeof STEPS)[number]['id'];

/* ------------------------------------------------------------------ helpers */

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setReduced(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduced;
}

function Chrome({ title, children, url }: { title?: string; url?: string; children: ReactNode }) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-midnight/12 bg-white shadow-xl shadow-midnight/10">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-midnight/10 bg-cloud px-3">
        <span className="flex gap-1.5" aria-hidden="true">
          <i className="size-2.5 rounded-full bg-midnight/20" />
          <i className="size-2.5 rounded-full bg-midnight/20" />
          <i className="size-2.5 rounded-full bg-midnight/20" />
        </span>
        {url !== undefined ? <span className="mx-auto min-w-0 max-w-[80%] flex-1 truncate rounded-md bg-white px-3 py-0.5 text-center text-[11px] text-midnight/65" data-t="url">{url}</span> : <span className="mx-auto text-[11px] font-semibold text-midnight/60">{title}</span>}
        <span className="w-10 shrink-0" aria-hidden="true" />
      </div>
      <div className="relative min-h-0 flex-1">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ scenes (beat 0..4; the last beat is the finished state) */

type SceneProps = { beat: number; data: DemoData; device: 'desktop' | 'tablet' | 'mobile' };

function Choose({ beat, data }: SceneProps) {
  const picked = beat >= 3;
  return (
    <Chrome title="Saitlify · New website">
      <div className="flex h-full flex-col gap-3 p-3 sm:p-5">
        <p className="text-sm font-semibold text-midnight">How do you want to start?</p>
        <ul className="grid min-h-0 flex-1 gap-2 sm:grid-cols-4 sm:gap-3">
          {data.templates.map((t) => {
            const on = picked && t.id === 'table-restaurant';
            return (
              <li key={t.id} data-t={`tpl-${t.id}`} className={`flex min-h-0 items-center gap-3 rounded-xl border p-2.5 transition sm:flex-col sm:items-start sm:gap-2 sm:p-3 ${on ? 'border-violet bg-violet/5 ring-2 ring-violet/30' : beat === 2 && t.id === 'table-restaurant' ? 'border-midnight/30 bg-cloud' : 'border-midnight/12'}`}>
                <span className={`h-9 w-12 shrink-0 rounded-md sm:h-16 sm:w-full ${t.id === 'clean-business' ? 'bg-gradient-to-br from-blue/30 to-white' : t.id === 'studio-portfolio' ? 'bg-gradient-to-br from-midnight/70 to-lavender/60' : 'bg-gradient-to-br from-midnight to-violet/70'}`} aria-hidden="true" />
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 text-[13px] font-semibold text-midnight">{t.name}{on ? <span aria-hidden="true" className="text-violet">✓</span> : null}</span>
                  <span className="hidden text-[11.5px] leading-snug text-midnight/60 sm:block">{t.description}</span>
                </span>
              </li>
            );
          })}
          <li className="flex items-center gap-3 rounded-xl border border-dashed border-midnight/25 p-2.5 sm:flex-col sm:items-start sm:gap-2 sm:p-3">
            <span className="grid h-9 w-12 shrink-0 place-items-center rounded-md bg-cloud text-lg text-midnight/50 sm:h-16 sm:w-full" aria-hidden="true">+</span>
            <span className="text-[13px] font-semibold text-midnight">Start from scratch</span>
          </li>
        </ul>
        <div className="flex justify-end">
          <span data-t="continue" className={`rounded-full px-4 py-1.5 text-[12px] font-semibold text-white transition ${picked ? 'bg-gradient-to-r from-violet to-blue' : 'bg-midnight/25'}`}>Continue</span>
        </div>
      </div>
    </Chrome>
  );
}

function Configure({ beat, data }: SceneProps) {
  const labels = ['Type', 'Idea', 'Details', 'Pages', 'Features', 'Look', 'Review'];
  return (
    <Chrome title="Saitlify · Create your website">
      <div className="flex h-full flex-col gap-3 p-3 sm:p-5">
        <ol className="flex gap-1 overflow-hidden" aria-hidden="true">
          {labels.map((l, i) => (
            <li key={l} className={`flex-1 truncate rounded-md px-1.5 py-1 text-center text-[10.5px] font-medium ${i === 2 ? 'bg-midnight text-white' : i < 2 ? 'bg-violet/10 text-midnight' : 'bg-midnight/5 text-midnight/45'}`}>{l}</li>
          ))}
        </ol>
        <div className="grid min-h-0 flex-1 gap-3 sm:grid-cols-2">
          <div className="space-y-2.5">
            <p className="text-[12px] font-semibold text-midnight">Name of your business</p>
            <div data-t="name" className="flex h-9 items-center rounded-lg border border-midnight/25 bg-white px-3 text-[13px] text-midnight">
              {beat >= 2 ? <span key="typed" className="demo-type" style={{ ['--chars' as string]: data.business.length }}>{data.business}</span> : <span className="text-midnight/35">e.g. Casa Brașov</span>}
            </div>
            <p className="hidden text-[12px] font-semibold text-midnight sm:block">Cuisine</p>
            <div className="hidden h-9 items-center rounded-lg border border-midnight/25 bg-white px-3 text-[13px] text-midnight sm:flex">Transylvanian</div>
          </div>
          <div>
            <p className="mb-2 text-[12px] font-semibold text-midnight">Pages</p>
            <ul className="grid grid-cols-2 gap-1.5">
              {['Home', 'Menu', 'About', 'Contact', 'Gallery', 'FAQ'].map((p, i) => {
                const on = i < 4 || (p === 'Gallery' && beat >= 4);
                return (
                  <li key={p} data-t={p === 'Gallery' ? 'page-gallery' : undefined} className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[12px] ${on ? 'border-violet/40 bg-violet/5 text-midnight' : 'border-midnight/12 text-midnight/60'}`}>
                    <span className={`grid size-4 place-items-center rounded border text-[10px] ${on ? 'border-violet bg-violet text-white' : 'border-midnight/30'}`} aria-hidden="true">{on ? '✓' : ''}</span>
                    {p}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
        <div className="flex justify-end">
          <span data-t="continue" className="rounded-full bg-gradient-to-r from-violet to-blue px-4 py-1.5 text-[12px] font-semibold text-white">Continue</span>
        </div>
      </div>
    </Chrome>
  );
}

function Generate({ beat, data }: SceneProps) {
  const checks = ['Pages created', 'Sections placed', 'Design applied', 'Checked by the website engine'];
  return (
    <Chrome title="Saitlify · Review">
      <div className="grid h-full gap-3 p-3 sm:grid-cols-[1fr_1.2fr] sm:p-5">
        <div className="min-h-0">
          <p className="text-[12px] font-semibold text-midnight">Building your website…</p>
          <ul className="mt-2 space-y-1.5">
            {checks.map((c, i) => (
              <li key={c} className={`flex items-center gap-2 text-[12.5px] transition ${beat > i ? 'text-midnight' : 'text-midnight/35'}`}>
                <span className={`grid size-4 place-items-center rounded-full text-[10px] ${beat > i ? 'bg-emerald-500 text-white' : 'border border-midnight/25'}`} aria-hidden="true">{beat > i ? '✓' : ''}</span>
                {c}
              </li>
            ))}
          </ul>
          <ul className="mt-3 flex flex-wrap gap-1.5" aria-hidden="true">
            {data.pages.map((p, i) => (
              <li key={p} className={`rounded-full border px-2.5 py-0.5 text-[11px] transition ${beat >= 2 + (i > 2 ? 1 : 0) ? 'demo-pop border-violet/30 bg-violet/5 text-midnight' : 'border-transparent text-transparent'}`}>{p}</li>
            ))}
          </ul>
        </div>
        <div className="relative hidden min-h-0 overflow-hidden rounded-lg border border-midnight/12 sm:block">
          {beat >= 3 ? <div className="demo-pop absolute inset-0"><SiteFrame node={data.generated} design={1000} /></div> : <div className="absolute inset-0 grid place-items-center bg-cloud text-[11px] text-midnight/40">Preview</div>}
        </div>
      </div>
    </Chrome>
  );
}

function Edit({ beat, data }: SceneProps) {
  const node = beat >= 4 ? data.restyled : beat >= 2 ? data.edited : data.generated;
  const palettes = [['Modern', 'bg-blue'], ['Premium', 'bg-midnight'], ['Bold', 'bg-violet']] as const;
  return (
    <Chrome title="Saitlify · Visual editor">
      <div className="flex h-full min-h-0">
        <div className="hidden w-28 shrink-0 space-y-1 border-r border-midnight/10 bg-cloud/60 p-2 text-[11px] sm:block" aria-hidden="true">
          <p className="px-1 font-semibold text-midnight/55">Sections</p>
          {['Header', 'Hero', 'Menu', 'Contact'].map((s) => <p key={s} className={`rounded-md px-2 py-1 ${s === 'Hero' ? 'bg-white font-semibold text-midnight shadow-sm' : 'text-midnight/65'}`}>{s}</p>)}
        </div>
        <div className="relative min-w-0 flex-1 bg-midnight/5">
          <div className="absolute inset-2 overflow-hidden rounded-md bg-white shadow-sm sm:inset-3">
            <SiteFrame node={node} design={1000} />
            <span data-t="hero-text" className="absolute left-[18%] top-[32%] h-10 w-[64%]" />
            {beat >= 1 && beat < 3 ? <span className="pointer-events-none absolute left-[16%] top-[30%] h-12 w-[68%] rounded-md border-2 border-blue/80" aria-hidden="true" /> : null}
            {beat === 2 ? <span className="demo-pop pointer-events-none absolute right-3 top-3 rounded-full bg-midnight px-2.5 py-1 text-[10.5px] font-semibold text-white" aria-hidden="true">Text updated</span> : null}
          </div>
        </div>
        <div className="hidden w-36 shrink-0 border-l border-midnight/10 p-2.5 text-[11px] sm:block" aria-hidden="true">
          <p className="font-semibold text-midnight/55">Design</p>
          <p className="mt-2 font-medium text-midnight">Palette</p>
          <ul className="mt-1.5 space-y-1.5">
            {palettes.map(([n, c]) => {
              const on = (beat >= 4 ? 'Modern' : 'Bold') === n;
              return (
                <li key={n} data-t={n === 'Modern' ? 'palette-modern' : undefined} className={`flex items-center gap-2 rounded-md border px-2 py-1.5 transition ${on ? 'border-violet bg-violet/5' : 'border-midnight/12'}`}>
                  <span className={`size-3.5 rounded-full ${c}`} />
                  {n}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
      <div className="absolute inset-x-0 bottom-0 flex justify-around border-t border-midnight/10 bg-white py-1.5 text-[10px] font-medium text-midnight/70 sm:hidden" aria-hidden="true">
        {['Sections', 'Pages', 'Design', 'Menu'].map((t) => <span key={t} data-t={t === 'Design' ? 'palette-modern' : undefined} className={t === 'Design' && beat >= 3 ? 'font-semibold text-violet' : ''}>{t}</span>)}
      </div>
    </Chrome>
  );
}

function Preview({ data, device }: SceneProps) {
  const width = device === 'desktop' ? '100%' : device === 'tablet' ? '74%' : 'clamp(9.5rem, 32%, 13rem)';
  const design = device === 'desktop' ? 1000 : device === 'tablet' ? 768 : 390;
  return (
    <Chrome title="Saitlify · Preview">
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex shrink-0 justify-center gap-1 border-b border-midnight/10 p-2" aria-hidden="true">
          {(['desktop', 'tablet', 'mobile'] as const).map((d) => (
            <span key={d} data-t={`dev-${d}`} className={`rounded-md px-3 py-1 text-[11.5px] font-medium capitalize transition ${device === d ? 'bg-midnight text-white' : 'bg-cloud text-midnight/70'}`}>{d}</span>
          ))}
        </div>
        <div className="grid min-h-0 flex-1 place-items-center bg-midnight/5 p-2 sm:p-3">
          <div className="relative h-full overflow-hidden rounded-md bg-white shadow-md transition-[width] duration-700 ease-out" style={{ width }}>
            <SiteFrame node={data.restyled} design={design} />
          </div>
        </div>
      </div>
    </Chrome>
  );
}

function Publish({ beat, data }: SceneProps) {
  const name = 'casa-brasov';
  const steps = ['Checked your website', 'Prepared every page', 'Verified the result'];
  const done = beat >= 4;
  return (
    <Chrome title="Saitlify · Publish">
      <div className="relative h-full bg-midnight/5">
        <div className="absolute inset-3 hidden overflow-hidden rounded-md opacity-60 sm:block"><SiteFrame node={data.restyled} design={1000} /></div>
        <div className="absolute inset-x-3 top-1/2 mx-auto max-w-sm -translate-y-1/2 rounded-2xl bg-white p-4 shadow-2xl shadow-midnight/20 sm:p-5">
          <p className="text-[14px] font-semibold text-midnight">Publish your website</p>
          <p className="mt-2 text-[11.5px] font-medium text-midnight/70">Address</p>
          <div className="mt-1 flex items-center gap-1 rounded-lg border border-midnight/25 px-2.5 py-2 text-[12px] text-midnight">
            {beat >= 1 ? <span className="demo-type" style={{ ['--chars' as string]: name.length }}>{name}</span> : <span className="text-midnight/35">your-address</span>}
            <span className="min-w-0 truncate text-midnight/45">{data.address.replace('casa-brasov', '')}</span>
          </div>
          <ul className="mt-3 space-y-1.5">
            {steps.map((s, i) => (
              <li key={s} className={`flex items-center gap-2 text-[12px] ${beat >= 2 + i && beat < 5 ? 'text-midnight' : 'text-midnight/35'} ${done ? 'text-midnight' : ''}`}>
                <span className={`grid size-4 place-items-center rounded-full text-[10px] ${beat >= 2 + i ? 'bg-emerald-500 text-white' : 'border border-midnight/25'}`} aria-hidden="true">{beat >= 2 + i ? '✓' : ''}</span>
                {s}
              </li>
            ))}
          </ul>
          <span data-t="publish-btn" className={`mt-4 block rounded-full py-2 text-center text-[12.5px] font-semibold text-white transition ${done ? 'bg-emerald-600' : 'bg-gradient-to-r from-violet to-blue'}`}>{done ? 'Published ✓' : 'Publish'}</span>
        </div>
      </div>
    </Chrome>
  );
}

function Live({ beat, data }: SceneProps) {
  return (
    <Chrome url={data.address}>
      <SiteFrame node={data.restyled} design={1000} />
      <span className="demo-pop absolute left-3 top-3 z-10 flex items-center gap-1.5 rounded-full bg-emerald-600 px-3 py-1 text-[11px] font-semibold text-white shadow-md" aria-hidden="true">
        <i className="size-1.5 rounded-full bg-white" /> Online · Version 1
      </span>
      {beat >= 3 ? <span className="demo-pop absolute bottom-3 right-3 z-10 rounded-lg bg-midnight px-3 py-2 text-[11px] text-white shadow-lg" aria-hidden="true">Edit and publish again any time</span> : null}
    </Chrome>
  );
}

/* ------------------------------------------------------------------ cursor script: where the pointer goes on each beat */

const CURSOR: Record<StepId, (beat: number) => { to: string | null; click?: boolean }> = {
  choose: (b) => (b === 0 ? { to: null } : b === 1 || b === 2 ? { to: 'tpl-table-restaurant' } : b === 3 ? { to: 'tpl-table-restaurant', click: true } : { to: 'continue' }),
  configure: (b) => (b === 0 ? { to: null } : b === 1 ? { to: 'name', click: true } : b === 2 ? { to: 'name' } : b === 3 ? { to: 'page-gallery' } : { to: 'page-gallery', click: true }),
  generate: () => ({ to: null }),
  edit: (b) => (b === 0 ? { to: null } : b === 1 ? { to: 'hero-text', click: true } : b === 2 ? { to: 'hero-text' } : b === 3 ? { to: 'palette-modern', click: true } : { to: 'palette-modern' }),
  preview: (b) => (b === 0 ? { to: null } : b < 3 ? { to: 'dev-tablet', click: b === 1 } : { to: 'dev-mobile', click: b === 3 }),
  publish: (b) => (b < 3 ? { to: null } : b === 3 ? { to: 'publish-btn' } : { to: 'publish-btn', click: true }),
  live: () => ({ to: null }),
};

const SCENES: Record<StepId, (p: SceneProps) => ReactNode> = {
  choose: Choose, configure: Configure, generate: Generate, edit: Edit, preview: (p) => <Preview {...p} />, publish: Publish, live: Live,
};

/* ------------------------------------------------------------------ the demo */

export function ProductDemo({ data }: { data: DemoData }) {
  const reduced = useReducedMotion();
  const root = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(0);
  const [beat, setBeat] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [visible, setVisible] = useState(false);
  const [tabVisible, setTabVisible] = useState(true);
  const [userDriven, setUserDriven] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number; show: boolean }>({ x: 24, y: 24, show: false });
  const [clickKey, setClickKey] = useState(0);

  const id = STEPS[step]!.id;
  const finalBeat = BEATS - 1;
  const shownBeat = reduced ? finalBeat : beat;
  const device: 'desktop' | 'tablet' | 'mobile' = id === 'preview' ? (shownBeat >= 3 ? 'mobile' : shownBeat >= 1 ? 'tablet' : 'desktop') : 'desktop';
  const running = playing && visible && tabVisible && !reduced;

  // Only play while the demo is on screen and the tab is in front.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(Boolean(e?.isIntersecting)), { threshold: 0.35 });
    io.observe(el);
    const vis = () => setTabVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', vis);
    return () => {
      io.disconnect();
      document.removeEventListener('visibilitychange', vis);
    };
  }, []);

  // The clock: one beat at a time, then the next step; it loops.
  useEffect(() => {
    if (!running) return;
    const t = window.setTimeout(() => {
      if (beat < finalBeat) setBeat(beat + 1);
      else {
        setStep((s) => (s + 1) % STEPS.length);
        setBeat(0);
      }
    }, BEAT_MS);
    return () => window.clearTimeout(t);
  }, [running, beat, step, finalBeat]);

  // Move the pointer to the element the script points at (measured, so it is right at every screen size).
  useLayoutEffect(() => {
    const el = stage.current;
    if (!el || reduced) return;
    const target = CURSOR[id](shownBeat);
    if (!target.to) {
      setPos((p) => ({ ...p, show: false }));
      return;
    }
    // The same target can exist in a desktop-only and a mobile-only version; use the one that is actually on screen.
    const node = [...el.querySelectorAll<HTMLElement>(`[data-t="${target.to}"]`)].find((n) => n.getClientRects().length > 0);
    if (!node) return;
    const a = el.getBoundingClientRect();
    const b = node.getBoundingClientRect();
    setPos({ x: b.left - a.left + Math.min(b.width * 0.6, b.width - 6), y: b.top - a.top + b.height * 0.6, show: true });
    if (target.click) setClickKey((k) => k + 1);
  }, [id, shownBeat, reduced]);

  const go = useCallback((to: number) => {
    setStep(((to % STEPS.length) + STEPS.length) % STEPS.length);
    setBeat(0);
    setUserDriven(true);
  }, []);

  const Scene = SCENES[id];
  const current = STEPS[step]!;

  return (
    <div ref={root} className="mx-auto max-w-6xl" data-testid="product-demo" data-step={id} data-playing={running ? 'true' : 'false'}>
      <div className="grid gap-6 lg:grid-cols-[17rem_minmax(0,1fr)] lg:gap-8">
        {/* The stage keeps one fixed size so nothing below it ever moves. */}
        <div className="lg:order-2">
          <div ref={stage} className="relative h-[25rem] sm:h-[28rem] lg:h-[31rem]" aria-hidden="true" data-testid="demo-stage">
            <div key={id} className="demo-pop h-full">
              <Scene beat={shownBeat} data={data} device={device} />
            </div>
            <div className="demo-cursor" style={{ transform: `translate(${pos.x}px, ${pos.y}px)`, opacity: pos.show ? 1 : 0 }}>
              <svg viewBox="0 0 24 24" width="24" height="24" fill="#0b1020" stroke="#fff" strokeWidth="1.5" strokeLinejoin="round"><path d="M5 3l14 8-6 1.5L10 19 5 3z" /></svg>
              <span key={clickKey} className={clickKey ? 'demo-click' : 'hidden'} />
            </div>
          </div>
        </div>

        <div className="lg:order-1">
          <ol className="hidden gap-1 lg:grid" aria-label="Steps">
            {STEPS.map((s, i) => (
              <li key={s.id}>
                <button type="button" onClick={() => go(i)} aria-current={i === step ? 'step' : undefined} className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-[14.5px] transition focus-visible:outline-2 focus-visible:outline-violet ${i === step ? 'bg-white font-semibold text-midnight shadow-md shadow-midnight/5 ring-1 ring-midnight/10' : 'text-midnight/65 hover:bg-white/60 hover:text-midnight'}`}>
                  <span className={`grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold ${i === step ? 'bg-gradient-to-br from-violet to-blue text-white' : 'bg-midnight/8 text-midnight/70'}`}>{i + 1}</span>
                  {s.title}
                </button>
              </li>
            ))}
          </ol>

          <div className="mt-1 lg:mt-5">
            <p className="text-sm font-semibold text-violet">Step {step + 1} of {STEPS.length}</p>
            <h3 className="mt-1 text-xl font-semibold tracking-tight text-midnight">{current.title}</h3>
            <p className="mt-1.5 text-[15px] leading-relaxed text-midnight/70" aria-live={userDriven ? 'polite' : 'off'}>{current.text}</p>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => go(step - 1)} aria-label="Previous step" className="inline-flex size-11 items-center justify-center rounded-full border border-midnight/20 bg-white text-midnight hover:border-violet focus-visible:outline-2 focus-visible:outline-violet">←</button>
            <button type="button" onClick={() => go(step + 1)} aria-label="Next step" className="inline-flex size-11 items-center justify-center rounded-full border border-midnight/20 bg-white text-midnight hover:border-violet focus-visible:outline-2 focus-visible:outline-violet">→</button>
            {!reduced ? (
              <button type="button" onClick={() => { setPlaying((p) => !p); setUserDriven(true); }} aria-pressed={!playing} className="inline-flex min-h-11 items-center rounded-full border border-midnight/20 bg-white px-4 text-sm font-semibold text-midnight hover:border-violet focus-visible:outline-2 focus-visible:outline-violet">
                {playing ? 'Pause' : 'Play'}
              </button>
            ) : null}
            <ol className="ml-1 flex gap-1.5 lg:hidden" aria-label="Progress">
              {STEPS.map((s, i) => (
                <li key={s.id}>
                  <button type="button" onClick={() => go(i)} aria-label={`Step ${i + 1}: ${s.title}`} aria-current={i === step ? 'step' : undefined} className="flex size-6 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-violet">
                    <span className={`block rounded-full transition-all ${i === step ? 'h-2.5 w-5 bg-gradient-to-r from-violet to-blue' : 'size-2.5 bg-midnight/20'}`} />
                  </button>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
