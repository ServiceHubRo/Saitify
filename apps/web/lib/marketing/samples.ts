import { createInitialState, generateWithTemplate, getCategory, reduce, TEMPLATES, type Action, type CategoryId, type WizardState } from '@saitify/configurator';
import { validateWebsite, type Website, type WebsiteInput } from '@saitify/engine';

/**
 * Example websites for the marketing pages, produced by the real configurator generator with each real template applied, and drawn
 * by the real engine. Nothing here is a mock-up: what visitors see is what the product generates from these answers. The content
 * is a fictional business, said so wherever it is shown.
 */

type Sample = { category: CategoryId; name: string; description: string; phone: string; email: string; address: string; items: string; extra: Record<string, string> };

const SAMPLES: Record<string, Sample> = {
  'clean-business': { category: 'business', name: 'Acme Electric', description: 'Safe, tidy electrical work for homes and small businesses. Fair prices, clear quotes.', phone: '+40 700 000 111', email: 'hello@acme.example', address: '12 Main Street, Brașov', items: 'Home wiring\nRepairs and fault finding\nSafety inspections', extra: { industry: 'Electrical services', hours: 'Mon–Fri: 08:00–17:00' } },
  'studio-portfolio': { category: 'portfolio', name: 'Lena Voss Photography', description: 'Portraits, weddings and travel stories, photographed with patience and natural light.', phone: '+40 700 000 222', email: 'lena@studio.example', address: '3 Gallery Lane, Cluj-Napoca', items: 'Portraits\nWeddings\nTravel', extra: { field: 'Photographer' } },
  'table-restaurant': { category: 'restaurant', name: 'Casa Brașov', description: 'Seasonal Transylvanian cooking in the heart of the old town.', phone: '+40 700 000 333', email: 'table@casa.example', address: '5 Piața Sfatului, Brașov', items: 'Starters\nMains\nDesserts', extra: { cuisine: 'Transylvanian', hours: 'Tue–Sun: 12:00–23:00' } },
};

const run = (s: WizardState, ...actions: Action[]) => actions.reduce(reduce, s);

/** The wizard answers behind a sample, exactly as a visitor could have typed them. */
export function sampleState(templateId: string): WizardState {
  const sample = SAMPLES[templateId];
  if (!sample) throw new Error(`no sample for template ${templateId}`);
  let s = run(createInitialState(), { type: 'setCategory', category: sample.category });
  s = run(s, { type: 'patchInfo', patch: { name: sample.name, description: sample.description, phone: sample.phone, email: sample.email, address: sample.address, items: sample.items } });
  for (const f of getCategory(sample.category)!.fields) s = run(s, { type: 'setExtra', id: f.id, value: sample.extra[f.id] ?? f.options?.[0] ?? '' });
  return s;
}

export type TemplateSample = { id: string; name: string; description: string; categories: string[]; business: string; site: Website };

/** The real templates, each generated for its sample business. Throws at build time if the generator ever stops producing a valid website. */
export function templateSamples(): TemplateSample[] {
  return TEMPLATES.map((tpl) => {
    const generated = generateWithTemplate(sampleState(tpl.id), tpl.id);
    if (!generated.valid || !generated.website) throw new Error(`sample for template ${tpl.id} is not valid`);
    return { id: tpl.id, name: tpl.name, description: tpl.description, categories: tpl.categories, business: SAMPLES[tpl.id]!.name, site: generated.website };
  });
}

/**
 * A compact copy of a generated website for the homepage demo: the home page only, its first few sections, with an optional new
 * headline and palette. This is how "edit the text" and "change the colours" look after the same operations in the editor.
 */
export function demoWebsite(base: Website, opts: { headline?: string; palette?: 'modern' | 'premium' | 'bold'; sections?: number }): Website {
  const home = base.pages.find((p) => p.type === 'home') ?? base.pages[0]!;
  const sections = home.sections.slice(0, opts.sections ?? 2).map((s) => (s.type === 'hero' && opts.headline ? { ...s, content: { ...s.content, heading: opts.headline } } : s));
  const input: WebsiteInput = { ...(base as unknown as WebsiteInput), design: { ...base.design, ...(opts.palette ? { palette: opts.palette } : {}) }, navigation: { items: [] }, pages: [{ ...home, sections }] } as WebsiteInput;
  const v = validateWebsite(input);
  if (!v.website) throw new Error('demo website is not valid');
  return v.website;
}
