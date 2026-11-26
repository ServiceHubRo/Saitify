import { PALETTE_IDS, STYLE_IDS } from '@saitify/engine';
import { getCapability } from './catalog/capabilities';
import { CATEGORIES, getCategory, isCategoryId, SOCIAL_NETWORKS } from './catalog/categories';
import { templatesFor } from './catalog/templates';
import { getSteps, type StepId, type WizardState } from './state';

/** Field or item id to message. The key `_` is for problems that belong to the whole step. */
export type Errors = Record<string, string>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE = /^[+0-9()\-\s.]{5,30}$/;
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function normalizeUrl(value: string): string {
  const v = value.trim();
  if (!v) return '';
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}

export function isValidUrl(value: string): boolean {
  try {
    const u = new URL(normalizeUrl(value));
    return (u.protocol === 'https:' || u.protocol === 'http:') && u.hostname.includes('.') && !/\s/.test(value.trim());
  } catch {
    return false;
  }
}

export function validateStep(step: StepId, state: WizardState): Errors {
  const e: Errors = {};
  const cat = getCategory(state.category);
  switch (step) {
    case 'category':
      if (!cat) e.category = 'Choose what you want to create. You can change it later.';
      break;
    case 'idea':
      if (state.category === 'other' && state.idea.text.trim().length < 10) {
        e.text = 'Tell us a little about your idea. One or two sentences are enough.';
      }
      break;
    case 'info': {
      const i = state.info;
      if (!i.name.trim()) e.name = 'Give your website a name. You can change it any time.';
      if (i.email.trim() && !EMAIL.test(i.email.trim())) e.email = 'This email address does not look right.';
      if (i.phone.trim() && !PHONE.test(i.phone.trim())) e.phone = 'Use digits, spaces and + only, for example +40 700 000 000.';
      for (const net of SOCIAL_NETWORKS) {
        const v = i.social[net]?.trim();
        if (v && !isValidUrl(v)) e[`social:${net}`] = `This does not look like a ${net} link.`;
      }
      for (const f of cat?.fields ?? []) {
        if (f.required && !(i.extra[f.id] ?? '').trim()) e[`extra:${f.id}`] = 'This one helps us build the right website.';
      }
      break;
    }
    case 'pages': {
      if (state.pages.length === 0) e._ = 'Add at least one page.';
      const seen = new Set<string>();
      for (const p of state.pages) {
        if (!p.name.trim()) e[`page:${p.id}`] = 'Give this page a name.';
        else if (!SLUG.test(p.slug)) e[`page:${p.id}`] = 'This name cannot be turned into a web address. Use letters or numbers.';
        else if (seen.has(p.slug)) e[`page:${p.id}`] = 'Another page already uses this web address. Change the name.';
        seen.add(p.slug);
      }
      if (state.pages.length > 0 && !state.pages.some((p) => p.id === state.homeId)) e._ = 'Choose which page is your home page.';
      if (state.pages.some((p) => p.key === 'locations') && !state.info.address.trim()) {
        e._ = 'The Locations page needs an address. Add it in Information, or remove the page.';
      }
      break;
    }
    case 'features':
      for (const id of state.capabilities) {
        const c = getCapability(id);
        if (!c || c.status !== 'supported') {
          e[`cap:${id}`] = 'This capability is not available.';
          continue;
        }
        if (c.requires === 'phone' && !state.info.phone.trim()) e[`cap:${id}`] = 'Add a phone number in Information, or turn this off.';
        if (c.requires === 'email' && !state.info.email.trim()) e[`cap:${id}`] = 'Add an email address in Information, or turn this off.';
        if (c.requires === 'address' && !state.info.address.trim()) e[`cap:${id}`] = 'Add an address in Information, or turn this off.';
      }
      break;
    case 'design':
      if (!(STYLE_IDS as readonly string[]).includes(state.design.style)) e.style = 'Choose a style.';
      if (!(PALETTE_IDS as readonly string[]).includes(state.design.palette)) e.palette = 'Choose a color palette.';
      break;
    case 'template':
      if (state.templateId && !templatesFor(isCategoryId(state.category) ? state.category : null).some((t) => t.id === state.templateId)) {
        e.template = 'This template does not fit your website type.';
      }
      break;
    case 'review':
      break;
  }
  return e;
}

export const stepIsValid = (step: StepId, state: WizardState): boolean => Object.keys(validateStep(step, state)).length === 0;

/** First step with a problem, or null when everything is valid. */
export function firstInvalidStep(state: WizardState): StepId | null {
  for (const s of getSteps(state)) if (s !== 'review' && !stepIsValid(s, state)) return s;
  return null;
}

/** Index of the furthest step the user may open: up to and including the first invalid one. */
export function maxReachableIndex(state: WizardState): number {
  const steps = getSteps(state);
  const bad = firstInvalidStep(state);
  return bad ? steps.indexOf(bad) : steps.length - 1;
}

export const CATEGORY_NAMES = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.name]));
