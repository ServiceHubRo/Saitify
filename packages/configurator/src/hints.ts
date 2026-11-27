import { getCategory } from './catalog/categories';
import { getCapability } from './catalog/capabilities';
import type { CapabilityId, CategoryId, ModuleKey, PageKey } from './catalog/types';

/** `modules` are suggestions shown next to the module choices; they are never selected automatically. */
export type Hints = { pages: PageKey[]; capabilities: CapabilityId[]; interests: CapabilityId[]; modules: ModuleKey[] };

type Rule = { test: RegExp; pages?: PageKey[]; capabilities?: CapabilityId[]; interests?: CapabilityId[] };

/** Plain keyword rules (English and Romanian). Recommendations only: the user always decides. */
const RULES: Rule[] = [
  { test: /gallery|galerie|photos?|pictures?|poze|fotografi/i, pages: ['gallery'], capabilities: ['gallery'] },
  { test: /testimonials?|reviews?|recenzi|păreri/i, pages: ['testimonials'], capabilities: ['testimonials'] },
  { test: /\bfaq\b|frequently asked|întrebări/i, pages: ['faq'], capabilities: ['faq'] },
  { test: /\bteam\b|\bstaff\b|echip/i, pages: ['team'] },
  { test: /location|address|where to find|map\b|adres|locați|hart/i, pages: ['locations'], capabilities: ['location'] },
  { test: /\bmenu\b|meniu/i, pages: ['menu'] },
  { test: /\bprices?\b|pricing|tarif|prețuri/i, pages: ['pricing'] },
  { test: /book(ing)?\b|appointments?|programări|programare/i, interests: ['appointment-booking'] },
  { test: /reserv|rezerv/i, interests: ['reservations'] },
  { test: /\bsell|\bshop\b|\bstore\b|magazin|vând|vand/i, interests: ['online-store'] },
  { test: /payments?|plăți|plata|card/i, interests: ['online-payments'] },
  { test: /newsletter/i, interests: ['newsletter'] },
  { test: /member|abona/i, interests: ['memberships'] },
  { test: /courses?|lessons?|cursuri|lecți/i, interests: ['courses'] },
  { test: /\bblog\b|articles?|articole/i, interests: ['blog-cms'] },
  { test: /events?|tickets?|evenimente|bilete/i, interests: ['events'] },
];

export function inferHints(category: CategoryId | null, text: string): Hints {
  const available = new Set<PageKey>(getCategory(category)?.pages.available ?? []);
  const out: Hints = { pages: [], capabilities: [], interests: [], modules: [] };
  if (!text.trim()) return out;
  for (const rule of RULES) {
    if (!rule.test.test(text)) continue;
    for (const p of rule.pages ?? []) if (available.has(p) && !out.pages.includes(p)) out.pages.push(p);
    for (const c of rule.capabilities ?? []) if (!out.capabilities.includes(c)) out.capabilities.push(c);
    for (const i of rule.interests ?? []) {
      const module = getCapability(i)?.module;
      if (module) {
        if (!out.modules.includes(module)) out.modules.push(module);
      } else if (!out.interests.includes(i)) out.interests.push(i);
    }
  }
  return out;
}
