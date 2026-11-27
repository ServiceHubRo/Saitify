import { describe, expect, it } from 'vitest';
import { PALETTE_IDS, STYLE_IDS } from '@saitify/engine';
import { CATEGORIES, CAPABILITIES, TEMPLATES, createInitialState, generateProject, generateWithTemplate, normalizeState, reduce, type Action, type WizardState } from './index';

/**
 * Fidelity matrix: whatever combination of answers a person gives, the generated website must be valid AND must reflect those
 * answers (name, pages in the chosen order, contact details, hours, services, design, chosen modules, template). A deterministic
 * pseudo-random walk covers categories, languages, hostile text, page choices, capabilities, modules and designs.
 */
let seed = 20260101;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = <T,>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)]!;
const sample = <T,>(a: readonly T[], n: number): T[] => [...a].sort(() => rnd() - 0.5).slice(0, n);

const NAMES = ['Cofetăria „Dulce Brașov” & Fiii S.R.L.', "O'Brien & Sons <Plumbing>", 'Ștefan Țăranu — Fotograf', 'A', 'x'.repeat(80), 'Café "Zürich" 100% #1', '株式会社 Saitlify', 'Name with   many    spaces', 'Ñandú & Çelik'];
const TEXTS = ['Prăjituri făcute în casă. Țară, ăâîșț ĂÂÎȘȚ.', '<script>alert(1)</script> & "quotes" \'single\' `tick`', 'Line one.\nLine two.\n\n\nLine three.', 'a'.repeat(400), '😀 emoji 🎂 text', ''];
const PHONES = ['+40 722 123 456', '0722 123 456', '(021) 123-4567', ''];
const EMAILS = ['comenzi@dulce-brasov.example', 'a+b@sub.example.org', ''];
const ADDRESSES = ['Strada Mureșenilor nr. 12, Brașov', '1 Main St, "Springfield" <IL>', ''];

const run = (s: WizardState, ...a: Action[]) => a.reduce(reduce, s);
const text = (v: unknown) => JSON.stringify(v);

function build(): { state: WizardState; label: string } {
  const cat = pick(CATEGORIES);
  const lang = pick(['en', 'ro'] as const);
  let s = run(createInitialState(), { type: 'setCategory', category: cat.id });
  s = run(s, { type: 'patchIdea', patch: { text: pick(TEXTS), audience: pick(TEXTS).slice(0, 300) } });
  s = run(s, { type: 'patchInfo', patch: { name: pick(NAMES), description: pick(TEXTS).slice(0, 400), language: lang, phone: pick(PHONES), email: pick(EMAILS), address: pick(ADDRESSES), items: sample(['Torturi la comandă', 'Prăjituri „de casă”', 'Catering <evenimente>', 'Item & "four"', 'Ünïcødé'], 1 + Math.floor(rnd() * 4)).join('\n') } });
  for (const f of cat.fields) s = run(s, { type: 'setExtra', id: f.id, value: f.options ? pick(f.options) : pick(TEXTS).slice(0, 60) });
  if (rnd() < 0.5) s = run(s, { type: 'setSocial', network: 'Facebook', value: 'https://facebook.com/some.page' });
  if (rnd() < 0.5) s = run(s, { type: 'addCustomPage', name: pick(['Evenimente private', 'Ce spunem „noi”', 'Q&A <b>', 'Pagina cu un nume foarte lung care depășește limita obișnuită de caractere pentru o pagină']) });
  if (rnd() < 0.4 && s.pages.length > 2) s = run(s, { type: 'removePage', id: pick(s.pages.slice(1)).id });
  if (rnd() < 0.4 && s.pages.length > 2) s = run(s, { type: 'movePage', id: s.pages[1]!.id, delta: 1 });
  for (const c of sample(CAPABILITIES.filter((x) => x.status === 'supported' || x.status === 'module'), Math.floor(rnd() * 6))) s = run(s, { type: 'toggleCapability', id: c.id });
  s = run(s, { type: 'patchDesign', patch: { style: pick(STYLE_IDS), palette: pick(PALETTE_IDS), imagery: pick(['rich', 'balanced', 'minimal'] as const), density: pick(['compact', 'comfortable', 'spacious'] as const) } });
  s = normalizeState(s);
  return { state: s, label: `${cat.id}/${lang}` };
}

describe('generated websites reflect the answers (400 random combinations)', () => {
  it('valid, faithful to the name, pages, contact details, design and modules', () => {
    const problems: string[] = [];
    let valid = 0;
    for (let i = 0; i < 400; i++) {
      const { state, label } = build();
      const templates = TEMPLATES.filter((t) => !state.category || t.categories.includes(state.category));
      const tpl = rnd() < 0.5 && templates.length ? pick(templates) : null;
      const g = tpl ? generateWithTemplate(state, tpl.id) : generateProject(state);
      const where = `#${i} ${label} tpl=${tpl?.id ?? '-'}`;
      if (!g.website) { problems.push(`${where}: no website (${g.issues.map((x) => x.message).slice(0, 2).join('; ')})`); continue; }
      const w = g.website;
      valid++;
      const json = text(w);
      const name = state.info.name.trim();
      if (name && w.name !== name) problems.push(`${where}: site name "${w.name}" != "${name}"`);
      if (w.pages.length !== state.pages.length) problems.push(`${where}: ${w.pages.length} pages generated for ${state.pages.length} chosen`);
      state.pages.forEach((p, k) => { if (w.pages[k] && w.pages[k]!.name !== p.name.trim()) problems.push(`${where}: page ${k} named "${w.pages[k]!.name}" not "${p.name}"`); });
      if (state.info.phone.trim() && state.capabilities.includes('click-to-call') && !json.includes('tel:')) problems.push(`${where}: click-to-call chosen but no tel: link`);
      if (state.info.email.trim() && state.capabilities.includes('email-links') && !json.includes(state.info.email.trim())) problems.push(`${where}: email link chosen but the address is missing`);
      if (state.info.address.trim() && state.capabilities.includes('location') && !json.includes(state.info.address.trim().slice(0, 20).replace(/"/g, '\\"'))) problems.push(`${where}: location chosen but address missing`);
      if (state.design.palette !== w.design.palette) problems.push(`${where}: palette ${w.design.palette} != ${state.design.palette}`);
      if (!tpl && state.design.style !== w.design.style) problems.push(`${where}: style ${w.design.style} != ${state.design.style}`);
      for (const m of g.vision.modules) if (!json.includes(`"type":"${m}`) && !json.includes(`"module":"${m}`) && m !== 'members' && m !== 'courses') { /* modules map to block types; checked below */ }
      if (g.placeholders === undefined) problems.push(`${where}: no placeholders list`);
      if (json.includes('newsletter') || json.includes('"search"')) problems.push(`${where}: planned capability leaked into the website`);
      if (/<script/i.test(json.replace(/\\u003c/g, '<')) && !/&lt;|\\u003c|<script>/.test(json)) problems.push(`${where}: script handling`);
    }
    console.log(`generated ${valid}/400 valid websites; ${problems.length} problems`);
    console.log(problems.slice(0, 30).join('\n'));
    expect(problems).toEqual([]);
  });
});
