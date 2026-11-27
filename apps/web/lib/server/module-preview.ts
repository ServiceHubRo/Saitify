import 'server-only';
import { getHomePage, validateWebsite } from '@saitify/engine';
import { activeModules, loadPageModules, ownedProjectRow, siteSecret, unconfiguredMailer, type Ctx, type SiteCtx } from '@saitify/platform';
import { appUrl } from './platform';

/**
 * Live module data for the editor canvas, so the preview shows real products, posts and events. It is read-only, runs as an
 * anonymous visitor of the owner's own project (no member, no cart) and never sends email.
 */
export async function previewModuleData(ctx: Ctx, ownerId: string, projectId: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const project = await ownedProjectRow(ctx.db, ownerId, projectId);
  const site = validateWebsite(body.site).website;
  if (!site) return {};
  const page = site.pages.find((p) => p.id === body.pageId) ?? getHomePage(site);
  const sctx: SiteCtx = {
    db: ctx.db, mailer: unconfiguredMailer, project: { id: project.id, ownerId }, website: site, active: await activeModules(ctx.db, project.id),
    now: new Date(), base: appUrl(), prefix: '', cookies: {}, ip: 'editor-preview', secret: await siteSecret(ctx.db),
  };
  // The owner previews the whole page, including parts that are restricted to members on the live website.
  const r = await loadPageModules(sctx, { ...page, access: undefined }, [], {}, '/');
  return r.moduleData;
}
