import {
  cancelRegistration, consume, createItem, deleteItem, deleteSubmission, disableModule, duplicateItem, enableModule, exportSubmissionsCsv, getItem, getModulesOverview, getOrder,
  isKind, isModuleId, itemOptions, KIND_DEFS, limitKey, listBookings, listEnrollments, listItems, listMembers, listOrders, listRegistrations, listSubmissions, markSubmission,
  ProjectError, removeMember, rescheduleOptions, setEnrollment, setMembership, updateBooking, updateItem, updateModuleSettings, updateOrder, type Ctx,
} from '@saitify/platform';
import { api, fail, ok } from '../../../../../../lib/server/api';
import { previewModuleData } from '../../../../../../lib/server/module-preview';

export const dynamic = 'force-dynamic';

/**
 * Module management for one project: `/api/projects/:id/modules/...`. Every call runs as the signed-in owner; each service
 * re-checks that the project belongs to them, so another account's project behaves exactly like a missing one.
 */
type P = { id: string; path?: string[] };
const num = (v: string | null) => (v && /^\d{1,6}$/.test(v) ? Number(v) : undefined);
const str = (v: string | null, max = 100) => (v ? v.slice(0, max) : undefined);

async function writeBudget(ctx: Ctx, userId: string): Promise<Response | null> {
  const r = await consume(ctx.db, { key: limitKey('modules:write', userId), max: 600, windowSec: 600 });
  return r.allowed ? null : fail(429, { code: 'rate_limited', message: 'You are doing that too quickly. Please wait a moment.', retryAfterSec: r.retryAfterSec });
}

function kindFor(module: string, kind: string | undefined) {
  if (!isKind(kind) || KIND_DEFS[kind].module !== module) throw new ProjectError('not_found', 'Unknown content type.');
  return kind;
}

const handler = api<P>({ auth: true, maxBytes: 900_000 }, async ({ req, ctx, body, session, params }) => {
  const owner = session!.user.id;
  const pid = params.id;
  const [module, area, a, b, c] = params.path ?? [];
  const url = new URL(req.url);
  const q = url.searchParams;
  const m = req.method;
  if (m !== 'GET') {
    const limited = await writeBudget(ctx, owner);
    if (limited) return limited;
  }

  if (!module) {
    if (m === 'GET') return ok(await getModulesOverview(ctx.db, owner, pid));
    return fail(405, { code: 'method', message: 'Not allowed.' });
  }
  if (module === 'preview' && m === 'POST') return ok({ moduleData: await previewModuleData(ctx, owner, pid, body) });
  if (!isModuleId(module)) return fail(404, { code: 'not_found', message: 'This module does not exist.' });

  if (!area) {
    if (m !== 'POST') return fail(405, { code: 'method', message: 'Not allowed.' });
    if (body.action === 'enable') return ok(await enableModule(ctx.db, owner, pid, module));
    if (body.action === 'disable') return ok({ overview: await disableModule(ctx.db, owner, pid, module) });
    return fail(422, { code: 'invalid', message: 'Unknown action.' });
  }
  if (area === 'settings' && m === 'PATCH') return ok({ overview: await updateModuleSettings(ctx.db, owner, pid, module, body.settings) });

  if (area === 'options' && m === 'GET') return ok({ options: await itemOptions(ctx.db, owner, pid, kindFor(module, a)) });
  if (area === 'items') {
    const kind = kindFor(module, a);
    if (!b) {
      if (m === 'GET') return ok(await listItems(ctx.db, owner, pid, kind, { q: str(q.get('q')), status: str(q.get('status'), 20), parent: str(q.get('parent'), 40), page: num(q.get('page')), pageSize: num(q.get('pageSize')) }));
      if (m === 'POST') return ok({ item: await createItem(ctx.db, owner, pid, kind, body.item) }, 201);
    } else if (c === 'duplicate' && m === 'POST') {
      return ok({ item: await duplicateItem(ctx.db, owner, pid, kind, b) }, 201);
    } else if (!c) {
      if (m === 'GET') return ok({ item: await getItem(ctx.db, owner, pid, kind, b) });
      if (m === 'PATCH') return ok({ item: await updateItem(ctx.db, owner, pid, kind, b, body.item) });
      if (m === 'DELETE') {
        await deleteItem(ctx.db, owner, pid, kind, b);
        return ok({ deleted: true });
      }
    }
  }

  if (module === 'store' && area === 'orders') {
    if (!a && m === 'GET') return ok(await listOrders(ctx.db, owner, pid, { status: str(q.get('status'), 20), payment: str(q.get('payment'), 20), q: str(q.get('q')), page: num(q.get('page')) }));
    if (a && m === 'GET') return ok({ order: await getOrder(ctx.db, owner, pid, a) });
    if (a && m === 'PATCH') return ok({ order: await updateOrder(ctx.db, owner, pid, a, { status: body.status, paymentStatus: body.paymentStatus }) });
  }
  if (module === 'booking' && area === 'bookings') {
    if (!a && m === 'GET') return ok(await listBookings(ctx.db, owner, pid, { from: str(q.get('from'), 10), to: str(q.get('to'), 10), status: str(q.get('status'), 20), staff: str(q.get('staff'), 40), q: str(q.get('q')) }));
    if (a && b === 'slots' && m === 'GET') return ok({ slots: await rescheduleOptions(ctx.db, owner, pid, a, str(q.get('date'), 10) ?? '') });
    if (a && !b && m === 'PATCH') return ok({ booking: await updateBooking(ctx.db, ctx.mailer, owner, pid, a, body) });
  }
  if (module === 'events' && area === 'registrations') {
    if (!a && m === 'GET') return ok(await listRegistrations(ctx.db, owner, pid, str(q.get('event'), 40) ?? ''));
    if (a && m === 'PATCH' && body.action === 'cancel') {
      await cancelRegistration(ctx.db, owner, pid, a);
      return ok({ cancelled: true });
    }
  }
  if (module === 'forms') {
    if (area === 'submissions') {
      if (!a && m === 'GET') return ok(await listSubmissions(ctx.db, owner, pid, { form: str(q.get('form'), 40), status: str(q.get('status'), 10), q: str(q.get('q')), page: num(q.get('page')) }));
      if (a && m === 'PATCH') {
        await markSubmission(ctx.db, owner, pid, a, body.read === true);
        return ok({ updated: true });
      }
      if (a && m === 'DELETE') {
        await deleteSubmission(ctx.db, owner, pid, a);
        return ok({ deleted: true });
      }
    }
    if (area === 'export' && m === 'GET') {
      const file = await exportSubmissionsCsv(ctx.db, owner, pid, str(q.get('form'), 40) ?? '');
      return new Response(file.csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${file.filename}"`, 'Cache-Control': 'no-store' } });
    }
  }
  if (module === 'members') {
    if (area === 'members' && !a && m === 'GET') return ok(await listMembers(ctx.db, owner, pid, { q: str(q.get('q')), status: str(q.get('status'), 20), page: num(q.get('page')) }));
    if (area === 'members' && a && m === 'DELETE') {
      await removeMember(ctx.db, owner, pid, a);
      return ok({ deleted: true });
    }
    if (area === 'memberships' && a && m === 'PATCH') {
      await setMembership(ctx.db, owner, pid, a, body.action);
      return ok({ updated: true });
    }
  }
  if (module === 'courses' && area === 'enrollments') {
    if (!a && m === 'GET') return ok(await listEnrollments(ctx.db, owner, pid, { course: str(q.get('course'), 40), status: str(q.get('status'), 20) }));
    if (a && m === 'PATCH') {
      await setEnrollment(ctx.db, owner, pid, a, body.action);
      return ok({ updated: true });
    }
  }
  return fail(404, { code: 'not_found', message: 'Not found.' });
});

export { handler as GET, handler as POST, handler as PATCH, handler as DELETE };
