import { defaultRegistry, type Website } from '@saitify/engine';
import type { Finding } from '../publishing/validate';
import { getModule, moduleOfBlock, type ModuleId } from './catalog';

/**
 * Publishing checks for modules, run with the project's enabled modules. A section from a module that is switched off would
 * show nothing useful to visitors, so it blocks publishing until the module is switched on or the section is removed.
 */
export function checkModuleSections(website: Website, active: ReadonlySet<ModuleId>): { blocking: Finding[]; warnings: Finding[]; passed: string[] } {
  const blocking: Finding[] = [];
  const warnings: Finding[] = [];
  let used = 0;
  for (const page of website.pages.filter((p) => p.visible)) {
    let details = 0;
    for (const s of page.sections.filter((x) => x.visible)) {
      const module = moduleOfBlock(s.type);
      if (!module) continue;
      used++;
      const name = defaultRegistry.get(s.type)?.name ?? s.type;
      if (!active.has(module)) blocking.push({ code: 'module-inactive', message: `The “${name}” section needs the ${getModule(module)!.name} module. Switch it on in Modules, or remove the section.`, where: `Page “${page.name}”`, fix: { kind: 'section', pageId: page.id, sectionId: s.id } });
      if (defaultRegistry.get(s.type)?.detail) details++;
    }
    if (details > 1) warnings.push({ code: 'module-several-detail', message: 'This page has several sections that open item pages (posts, products…). Only the first one answers item addresses.', where: `Page “${page.name}”`, fix: { kind: 'page', pageId: page.id } });
    if (page.access && !active.has('members')) blocking.push({ code: 'members-inactive', message: 'This page is set to “Members only”, which needs the Memberships module. Switch it on, or make the page public.', where: `Page “${page.name}”`, fix: { kind: 'page', pageId: page.id } });
  }
  const has = (t: string) => website.pages.some((p) => p.visible && p.sections.some((s) => s.visible && s.type === t));
  if (has('store') && !has('cart')) warnings.push({ code: 'store-no-cart', message: 'Your products can be added to a cart, but no page shows the “Cart and checkout” section yet. Add it to a page so customers can order.', where: 'Store', fix: { kind: 'page' } });
  if (active.has('members') && !website.pages.some((p) => p.visible && p.sections.some((s) => s.visible && s.type === 'member-area')) && website.pages.some((p) => p.access || p.sections.some((s) => s.type === 'members-only' || s.type === 'courses'))) {
    warnings.push({ code: 'members-no-area', message: 'Members-only content exists, but no page has the “Member account” section, so visitors cannot sign in.', where: 'Memberships', fix: { kind: 'page' } });
  }
  return { blocking, warnings, passed: used > 0 && blocking.length === 0 ? ['Module sections are switched on'] : [] };
}
