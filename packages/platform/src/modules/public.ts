import { defaultRegistry, type FormState, type Page, type Unavailable } from '@saitify/engine';
import { getModule, isModuleId, moduleOfBlock, type ModuleId } from './catalog';
import { bookingAction, loadBooking } from './booking';
import { courseAction, eventAction, loadBlog, loadCourses, loadDirectory, loadEvents, type Meta } from './content';
import { formAction, loadForm } from './forms';
import { loadGate, loadMemberArea, memberAction, memberLoginHref, pageAllowed } from './members';
import { loadCart, loadStore, storeAction } from './store';
import { fail, type ActionInput, type ActionResult, type SiteCtx } from './visitor';

export type SectionOverride = { state?: FormState; extra?: Record<string, string> };

export type PageModules = {
  /** Data per module section of this page. Only sections on this page are loaded; other pages cost nothing. */
  moduleData: Record<string, unknown>;
  notFound: boolean;
  locked: { loginHref: string | null; message?: string } | null;
  meta?: Meta;
  /** The page shows live or per-visitor data and must not be cached as a static page. */
  dynamic: boolean;
};

const unavailable = (): Unavailable => ({ unavailable: true, message: 'This part of the website is not available right now.' });

/** True when a page may answer addresses below it (`/<page>/<item>`): it holds a visible detail-capable block. */
export function pageAcceptsSubpaths(page: Page): boolean {
  return page.sections.some((s) => s.visible && defaultRegistry.get(s.type)?.detail);
}

export async function loadPageModules(ctx: SiteCtx, page: Page, sub: string[], query: Record<string, string>, returnTo: string, overrides: Record<string, SectionOverride> = {}): Promise<PageModules> {
  const sections = page.sections.filter((s) => s.visible && defaultRegistry.get(s.type)?.module);
  const out: PageModules = { moduleData: {}, notFound: false, locked: null, dynamic: sections.length > 0 || Boolean(page.access) };
  if (sub.length && !pageAcceptsSubpaths(page)) return { ...out, notFound: true };
  if (page.access && !(await pageAllowed(ctx, page.access))) {
    return { ...out, locked: { loginHref: memberLoginHref(ctx), message: ctx.active.has('members') ? 'This page is for members. Sign in or join to see it.' : 'This page is not available.' } };
  }
  let detailDone = false;
  for (const s of sections) {
    const block = defaultRegistry.get(s.type)!;
    const module = moduleOfBlock(s.type);
    if (!module || !ctx.active.has(module)) {
      out.moduleData[s.id] = unavailable();
      if (block.detail && sub.length && !detailDone) return { ...out, notFound: true };
      continue;
    }
    // Only the first detail-capable section answers the sub-path; others show their normal (list) view.
    const mySub = block.detail && !detailDone ? sub : [];
    if (block.detail && !detailDone) detailDone = true;
    const o = overrides[s.id];
    const c = s.content as Record<string, never>;
    let r: { data: unknown; notFound?: boolean; meta?: Meta };
    switch (s.type) {
      case 'form': r = { data: await loadForm(ctx, s.id, c, query, returnTo, o?.state) }; break;
      case 'blog': r = await loadBlog(ctx, c, mySub, query); break;
      case 'store': r = await loadStore(ctx, s.id, c, mySub, query, returnTo, o?.state); break;
      case 'cart': r = await loadCart(ctx, s.id, mySub, query, returnTo, o?.state); break;
      case 'booking': r = { data: await loadBooking(ctx, s.id, query, returnTo, o) }; break;
      case 'events': r = await loadEvents(ctx, s.id, c, mySub, query, returnTo, o?.state); break;
      case 'directory': r = await loadDirectory(ctx, c, mySub, query); break;
      case 'member-area': r = { data: await loadMemberArea(ctx, s.id, query, returnTo, o?.state) }; break;
      case 'members-only': r = { data: await loadGate(ctx) }; break;
      case 'courses': r = await loadCourses(ctx, s.id, mySub, returnTo, o?.state); break;
      default: r = { data: unavailable() };
    }
    if (r.notFound) return { ...out, notFound: true };
    out.moduleData[s.id] = r.data;
    if (r.meta && mySub.length) out.meta = r.meta;
  }
  return out;
}

/** Routes a visitor form post to its module. The module must be switched on; everything else is checked inside. */
export async function handleSiteAction(ctx: SiteCtx, moduleRaw: string, action: string, input: ActionInput): Promise<ActionResult> {
  if (!isModuleId(moduleRaw) || !ctx.active.has(moduleRaw)) return fail(input.sectionId, { message: 'This is not available right now.' }, 409);
  const module: ModuleId = moduleRaw;
  switch (module) {
    case 'forms': return formAction(ctx, action, input);
    case 'store': return storeAction(ctx, action, input);
    case 'booking': return bookingAction(ctx, action, input);
    case 'events': return eventAction(ctx, action, input);
    case 'members': return memberAction(ctx, action, input);
    case 'courses': return courseAction(ctx, action, input);
    default: return fail(input.sectionId, { message: `${getModule(module)?.name ?? 'This module'} has no visitor actions.` }, 409);
  }
}
