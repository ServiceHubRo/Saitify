import { PALETTE_IDS, STYLE_IDS } from '@saitify/engine';
import { z } from 'zod';
import { getCategory, isCategoryId } from './catalog/categories';
import { getCapability, isPlanned, isSupported } from './catalog/capabilities';
import { defaultPageName } from './catalog/i18n';
import { getTemplate, templatesFor } from './catalog/templates';
import { LANG_IDS, PAGE_KEYS, type CapabilityId, type CategoryId, type PageKey } from './catalog/types';
import { inferHints } from './hints';
import { buildPages, canAddPage, moveItem, recommendedKeys, slugify, uniqueSlug, type PageState } from './pages';

export const DRAFT_VERSION = 1;
export const STEP_IDS = ['category', 'idea', 'info', 'pages', 'features', 'design', 'template', 'review'] as const;
export type StepId = (typeof STEP_IDS)[number];

const short = (max: number) => z.string().max(max).default('');
const pageSchema = z.object({
  id: z.string().regex(/^p\d{1,4}$/),
  key: z.enum(PAGE_KEYS),
  name: z.string().max(60),
  slug: z.string().max(80),
});

export const wizardStateSchema = z.object({
  step: z.enum(STEP_IDS).default('category'),
  category: z.string().nullable().default(null),
  idea: z
    .object({ text: short(2000), audience: short(300), objective: short(80), different: short(600), actions: short(300) })
    .prefault({}),
  info: z
    .object({
      name: short(80),
      description: short(400),
      language: z.enum(LANG_IDS).default('en'),
      email: short(254),
      phone: short(40),
      address: short(300),
      social: z.record(z.string().max(30), z.string().max(300)).default({}),
      items: short(1500),
      extra: z.record(z.string().max(30), z.string().max(600)).default({}),
    })
    .prefault({}),
  pages: z.array(pageSchema).max(30).default([]),
  nextPageId: z.number().int().min(1).max(10000).default(1),
  homeId: z.string().nullable().default(null),
  pagesTouched: z.boolean().default(false),
  capabilities: z.array(z.string().max(40)).max(40).default([]),
  interests: z.array(z.string().max(40)).max(40).default([]),
  capsTouched: z.boolean().default(false),
  design: z
    .object({
      style: z.enum(STYLE_IDS).default('minimal'),
      palette: z.enum(PALETTE_IDS).default('modern'),
      imagery: z.enum(['rich', 'balanced', 'minimal']).default('balanced'),
      density: z.enum(['compact', 'comfortable', 'spacious']).default('comfortable'),
    })
    .prefault({}),
  designTouched: z.boolean().default(false),
  templateId: z.string().nullable().default(null),
});
export type WizardState = z.infer<typeof wizardStateSchema>;

export function createInitialState(): WizardState {
  return wizardStateSchema.parse({});
}

/** Ordered steps for the current answers. The template step only exists when real templates fit. */
export function getSteps(state: WizardState): StepId[] {
  const category = isCategoryId(state.category) ? state.category : null;
  return STEP_IDS.filter((s) => s !== 'template' || templatesFor(category).length > 0);
}

export function normalizeState(input: WizardState): WizardState {
  const s = { ...input };
  if (!isCategoryId(s.category)) s.category = null;
  s.capabilities = [...new Set(s.capabilities.filter(isSupported))];
  s.interests = [...new Set(s.interests.filter(isPlanned))];
  if (s.templateId && !templatesFor(s.category as CategoryId | null).some((t) => t.id === s.templateId)) s.templateId = null;
  if (s.homeId && !s.pages.some((p) => p.id === s.homeId)) s.homeId = s.pages[0]?.id ?? null;
  if (!s.homeId && s.pages[0]) s.homeId = s.pages[0].id;
  if (!getSteps(s).includes(s.step)) s.step = 'category';
  return s;
}

export type Action =
  | { type: 'setCategory'; category: CategoryId }
  | { type: 'patchIdea'; patch: Partial<WizardState['idea']> }
  | { type: 'patchInfo'; patch: Partial<Omit<WizardState['info'], 'social' | 'extra'>> }
  | { type: 'setExtra'; id: string; value: string }
  | { type: 'setSocial'; network: string; value: string }
  | { type: 'resetPages' }
  | { type: 'addPage'; key: PageKey }
  | { type: 'addCustomPage'; name: string }
  | { type: 'removePage'; id: string }
  | { type: 'renamePage'; id: string; name: string }
  | { type: 'movePage'; id: string; delta: -1 | 1 }
  | { type: 'setHome'; id: string }
  | { type: 'toggleCapability'; id: string }
  | { type: 'toggleInterest'; id: string }
  | { type: 'patchDesign'; patch: Partial<WizardState['design']> }
  | { type: 'selectTemplate'; id: string | null }
  | { type: 'goTo'; step: StepId }
  | { type: 'hydrate'; state: WizardState }
  | { type: 'reset' };

function applyRecommendations(s: WizardState): WizardState {
  const category = isCategoryId(s.category) ? s.category : null;
  const hints = inferHints(category, `${s.idea.text} ${s.idea.different}`);
  const next = { ...s };
  if (!s.pagesTouched) {
    const built = buildPages(recommendedKeys(category, `${s.idea.text} ${s.idea.different}`), s.info.language);
    next.pages = built.pages;
    next.nextPageId = built.nextId;
    next.homeId = built.pages[0]?.id ?? null;
  }
  if (!s.capsTouched) {
    const base = getCategory(category)?.recommendedCapabilities ?? [];
    const fromContact: CapabilityId[] = [];
    if (s.info.phone.trim()) fromContact.push('click-to-call');
    if (s.info.email.trim()) fromContact.push('email-links');
    if (Object.values(s.info.social).some((v) => v.trim())) fromContact.push('social-links');
    const has = { phone: !!s.info.phone.trim(), email: !!s.info.email.trim(), address: !!s.info.address.trim() };
    const usable = (id: string) => {
      const need = getCapability(id)?.requires;
      return !need || has[need];
    };
    next.capabilities = [...new Set([...base, ...fromContact, ...hints.capabilities])].filter((id) => isSupported(id) && usable(id));
    next.interests = hints.interests.filter(isPlanned);
  }
  return next;
}

export function reduce(state: WizardState, action: Action): WizardState {
  switch (action.type) {
    case 'setCategory': {
      let s: WizardState = { ...state, category: action.category };
      const cat = getCategory(action.category)!;
      if (!s.designTouched) s = { ...s, design: { ...s.design, ...cat.design } };
      s = applyRecommendations(s);
      if (s.templateId && !templatesFor(action.category).some((t) => t.id === s.templateId)) s.templateId = null;
      return normalizeState(s);
    }
    case 'patchIdea':
      return normalizeState(applyRecommendations({ ...state, idea: { ...state.idea, ...action.patch } }));
    case 'patchInfo': {
      let s: WizardState = { ...state, info: { ...state.info, ...action.patch } };
      const lang = action.patch.language;
      if (lang && lang !== state.info.language) {
        s = {
          ...s,
          pages: s.pages.map((p) => {
            if (p.name !== defaultPageName(state.info.language, p.key)) return p;
            const name = defaultPageName(lang, p.key);
            return { ...p, name, slug: uniqueSlug(slugify(name), s.pages.filter((o) => o.id !== p.id).map((o) => o.slug), p.key) };
          }),
        };
      }
      return normalizeState(applyRecommendations(s));
    }
    case 'setExtra':
      return { ...state, info: { ...state.info, extra: { ...state.info.extra, [action.id]: action.value } } };
    case 'setSocial':
      return applyRecommendations({ ...state, info: { ...state.info, social: { ...state.info.social, [action.network]: action.value } } });
    case 'resetPages':
      return normalizeState(applyRecommendations({ ...state, pagesTouched: false }));
    case 'addPage': {
      if (!canAddPage(state.category as CategoryId | null, state.pages, action.key)) return state;
      const name = defaultPageName(state.info.language, action.key);
      const page: PageState = { id: `p${state.nextPageId}`, key: action.key, name, slug: uniqueSlug(slugify(name), state.pages.map((p) => p.slug), action.key) };
      return normalizeState({ ...state, pages: [...state.pages, page], nextPageId: state.nextPageId + 1, pagesTouched: true });
    }
    case 'addCustomPage': {
      const name = action.name.trim().slice(0, 60);
      if (!name || !canAddPage(state.category as CategoryId | null, state.pages, 'custom')) return state;
      const page: PageState = { id: `p${state.nextPageId}`, key: 'custom', name, slug: uniqueSlug(slugify(name), state.pages.map((p) => p.slug), 'page') };
      return normalizeState({ ...state, pages: [...state.pages, page], nextPageId: state.nextPageId + 1, pagesTouched: true });
    }
    case 'removePage': {
      if (state.pages.length <= 1) return state;
      const pages = state.pages.filter((p) => p.id !== action.id);
      return normalizeState({ ...state, pages, pagesTouched: true, homeId: state.homeId === action.id ? (pages[0]?.id ?? null) : state.homeId });
    }
    case 'renamePage': {
      const name = action.name.slice(0, 60);
      return {
        ...state,
        pagesTouched: true,
        pages: state.pages.map((p) =>
          p.id === action.id
            ? { ...p, name, slug: uniqueSlug(slugify(name), state.pages.filter((o) => o.id !== p.id).map((o) => o.slug), p.key === 'custom' ? 'page' : p.key) }
            : p,
        ),
      };
    }
    case 'movePage': {
      const index = state.pages.findIndex((p) => p.id === action.id);
      return { ...state, pagesTouched: true, pages: moveItem(state.pages, index, action.delta) };
    }
    case 'setHome':
      return state.pages.some((p) => p.id === action.id) ? { ...state, homeId: action.id, pagesTouched: true } : state;
    case 'toggleCapability': {
      if (!isSupported(action.id)) return state;
      const has = state.capabilities.includes(action.id);
      return { ...state, capsTouched: true, capabilities: has ? state.capabilities.filter((c) => c !== action.id) : [...state.capabilities, action.id] };
    }
    case 'toggleInterest': {
      if (!isPlanned(action.id)) return state;
      const has = state.interests.includes(action.id);
      return { ...state, capsTouched: true, interests: has ? state.interests.filter((c) => c !== action.id) : [...state.interests, action.id] };
    }
    case 'patchDesign': {
      const touched = action.patch.style !== undefined || action.patch.palette !== undefined;
      return { ...state, designTouched: state.designTouched || touched, design: { ...state.design, ...action.patch } };
    }
    case 'selectTemplate': {
      if (action.id === null) return { ...state, templateId: null };
      const tpl = getTemplate(action.id);
      if (!tpl || !templatesFor(state.category as CategoryId | null).some((t) => t.id === tpl.id)) return state;
      return { ...state, templateId: tpl.id, design: state.designTouched ? state.design : { ...state.design, ...tpl.design } };
    }
    case 'goTo':
      return getSteps(state).includes(action.step) ? { ...state, step: action.step } : state;
    case 'hydrate':
      return normalizeState(wizardStateSchema.parse(action.state));
    case 'reset':
      return createInitialState();
  }
}

/* Draft persistence: pure serialization. The caller decides where to store it. */
const MAX_DRAFT_BYTES = 100_000;

export function serializeDraft(state: WizardState, now = Date.now()): string {
  return JSON.stringify({ v: DRAFT_VERSION, savedAt: now, state });
}

/** Returns a sanitized state, or null when the stored value is missing, too large, corrupt or from another version. */
export function parseDraft(raw: string | null | undefined): WizardState | null {
  if (!raw || raw.length > MAX_DRAFT_BYTES) return null;
  try {
    const data: unknown = JSON.parse(raw);
    if (typeof data !== 'object' || data === null || (data as { v?: unknown }).v !== DRAFT_VERSION) return null;
    const parsed = wizardStateSchema.safeParse((data as { state?: unknown }).state);
    return parsed.success ? normalizeState(parsed.data) : null;
  } catch {
    return null;
  }
}

export { getCapability };
