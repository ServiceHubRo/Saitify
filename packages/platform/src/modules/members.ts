import type { GateData, MemberAreaData, MemberPlan } from '@saitify/engine';
import { burnPasswordCheck, hashPassword, verifyPassword } from '../auth/crypto';
import { consume, limitKey } from '../auth/rate-limit';
import { normalizeEmail, validateEmail, validateName, validatePassword } from '../auth/validation';
import { isUniqueViolation } from '../auth/service';
import type { Db } from '../db/types';
import { ProjectError, isUuid } from '../projects/service';
import { parseSettings } from './catalog';
import { checkModuleLimit } from './entitlements';
import { ownedProjectRow } from './service';
import { actionCtx, blockHref, detailHref, fail, formValues, hashToken, MEMBER_COOKIE, newVisitorToken, visitorLimit, type ActionInput, type ActionResult, type SiteCtx } from './visitor';

/**
 * Website members are visitors of ONE customer website, not Saitlify accounts: separate table, separate cookie, scoped to the
 * project. They reuse the platform's own password hashing (scrypt), token hashing and database rate limits.
 */

export type Member = { id: string; name: string; email: string };
const SESSION_DAYS = 30;
const memo = new WeakMap<SiteCtx, Promise<Member | null>>();

export function currentMember(ctx: SiteCtx): Promise<Member | null> {
  let p = memo.get(ctx);
  if (!p) {
    p = (async () => {
      if (!ctx.active.has('members')) return null;
      const token = ctx.cookies[MEMBER_COOKIE];
      if (!token || token.length > 100) return null;
      const r = await ctx.db.query<Member>(
        `select m.id, m.name, m.email from site_member_sessions s join site_members m on m.id = s.member_id
          where s.token_hash = $1 and s.project_id = $2 and m.project_id = $2 and s.expires_at > now()`,
        [hashToken(token), ctx.project.id],
      );
      return r[0] ?? null;
    })();
    memo.set(ctx, p);
  }
  return p;
}

/** Active, unexpired membership in one of these plans (slugs), or in any plan when the list is empty. */
export async function hasMembership(ctx: SiteCtx, memberId: string, planSlugs: string[] = []): Promise<boolean> {
  const r = await ctx.db.query(
    `select 1 from memberships ms join module_items p on p.id = ms.plan_id
      where ms.member_id = $1 and ms.project_id = $2 and ms.status = 'active' and (ms.ends_at is null or ms.ends_at > now())
        and (cardinality($3::text[]) = 0 or p.slug = any($3::text[])) limit 1`,
    [memberId, ctx.project.id, planSlugs],
  );
  return r.length > 0;
}

export async function hasPlanIds(ctx: SiteCtx, memberId: string, planIds: string[]): Promise<boolean> {
  const r = await ctx.db.query(
    `select 1 from memberships ms where ms.member_id = $1 and ms.project_id = $2 and ms.status = 'active' and (ms.ends_at is null or ms.ends_at > now())
        and (cardinality($3::uuid[]) = 0 or ms.plan_id = any($3::uuid[])) limit 1`,
    [memberId, ctx.project.id, planIds],
  );
  return r.length > 0;
}

export const memberLoginHref = (ctx: SiteCtx) => (ctx.active.has('members') ? blockHref(ctx, 'member-area') : null);

/** Server-side check for pages marked "members only". Without the Memberships module nobody gets in (fail closed). */
export async function pageAllowed(ctx: SiteCtx, access: { members: true; plans: string[] } | undefined): Promise<boolean> {
  if (!access) return true;
  const m = await currentMember(ctx);
  return m ? hasMembership(ctx, m.id, access.plans) : false;
}

export async function loadGate(ctx: SiteCtx): Promise<GateData> {
  const m = await currentMember(ctx);
  return { allowed: m ? await hasMembership(ctx, m.id) : false, signedIn: Boolean(m), loginHref: memberLoginHref(ctx) };
}

async function plansFor(ctx: SiteCtx, memberId: string | null): Promise<MemberPlan[]> {
  const rows = await ctx.db.query<{ id: string; slug: string; title: string; data: { description?: string; priceText?: string; access?: 'free' | 'approval' }; ms: 'pending' | 'active' | null }>(
    `select p.id, p.slug, p.title, p.data,
            (select ms.status from memberships ms where ms.plan_id = p.id and ms.member_id = $2 and ms.status in ('pending','active') and (ms.ends_at is null or ms.ends_at > now()) limit 1) as ms
       from module_items p where p.project_id = $1 and p.kind = 'plan' and p.status = 'active' order by p.position, lower(p.title)`,
    [ctx.project.id, memberId],
  );
  return rows.map((r) => ({ slug: r.slug, title: r.title, description: r.data.description || undefined, priceText: r.data.priceText || undefined, access: r.data.access === 'approval' ? 'approval' : 'free', status: r.ms ?? undefined }));
}

export async function loadMemberArea(ctx: SiteCtx, sectionId: string, query: Record<string, string>, returnTo: string, state?: MemberAreaData['state']): Promise<MemberAreaData> {
  const settings = parseSettings('members', ctx.active.get('members'));
  const m = await currentMember(ctx);
  const courses: MemberAreaData['courses'] = [];
  if (m && ctx.active.has('courses')) {
    const rows = await ctx.db.query<{ slug: string; title: string; status: 'pending' | 'active'; total: string; done: string }>(
      `select c.slug, c.title, e.status,
              (select count(*) from module_items l where l.parent_id = c.id and l.kind = 'lesson' and l.status = 'published') as total,
              (select count(*) from lesson_progress lp join module_items l on l.id = lp.lesson_id where lp.enrollment_id = e.id and l.status = 'published') as done
         from course_enrollments e join module_items c on c.id = e.course_id
        where e.member_id = $1 and e.project_id = $2 and e.status in ('pending','active') and c.status = 'published' order by e.created_at desc`,
      [m.id, ctx.project.id],
    );
    for (const r of rows) {
      const href = detailHref(ctx, 'courses', r.slug);
      if (href) courses.push({ title: r.title, href, status: r.status, progress: Number(r.total) ? Math.round((Number(r.done) / Number(r.total)) * 100) : 0 });
    }
  }
  return {
    view: m ? 'account' : query.view === 'register' && settings.allowSignup ? 'register' : 'login',
    member: m ? { name: m.name, email: m.email } : null,
    allowSignup: settings.allowSignup,
    plans: await plansFor(ctx, m?.id ?? null),
    courses,
    action: actionCtx(ctx, 'members', 'login', sectionId, returnTo),
    state,
    notice: query.joined === '1' ? 'Your membership request was saved.' : query.welcome === '1' ? 'Welcome! Your account is ready.' : undefined,
    welcome: m ? settings.welcome || undefined : undefined,
  };
}

/* ------------------------------------------------------------------ visitor actions */

async function startSession(ctx: SiteCtx, memberId: string) {
  const token = newVisitorToken();
  await ctx.db.query(`insert into site_member_sessions (member_id, project_id, token_hash, expires_at) values ($1, $2, $3, now() + make_interval(days => $4))`, [memberId, ctx.project.id, hashToken(token), SESSION_DAYS]);
  if (Math.random() < 0.05) await ctx.db.query('delete from site_member_sessions where expires_at < now()');
  return [{ name: MEMBER_COOKIE, value: token, maxAgeSec: SESSION_DAYS * 86400 }];
}

const back = (input: ActionInput, extra: Record<string, string> = {}) => {
  const q = new URLSearchParams({ ...Object.fromEntries(Object.entries(input.returnTo.query).filter(([k]) => !['view', 'welcome', 'joined'].includes(k))), ...extra }).toString();
  return `${input.returnTo.path}${q ? `?${q}` : ''}`;
};

export async function memberAction(ctx: SiteCtx, action: string, input: ActionInput): Promise<ActionResult> {
  const { form, sectionId } = input;
  const settings = parseSettings('members', ctx.active.get('members'));
  if (action === 'logout') {
    const token = ctx.cookies[MEMBER_COOKIE];
    if (token) await ctx.db.query('delete from site_member_sessions where token_hash = $1 and project_id = $2', [hashToken(token), ctx.project.id]);
    return { kind: 'redirect', to: back(input), cookies: [{ name: MEMBER_COOKIE, value: '', maxAgeSec: 0 }] };
  }
  if (action === 'register') {
    const v = formValues(form, ['name', 'email'], 254);
    const password = form.get('password') ?? '';
    const values = { ...v };
    if (!settings.allowSignup) return fail(sectionId, { message: 'New accounts cannot be created on this website right now.', values }, 409);
    if (!(await visitorLimit(ctx, 'member-register', 5, 3600))) return fail(sectionId, { message: 'Too many attempts. Please try again later.', values }, 429);
    const errors: Record<string, string> = {};
    const ne = validateName(v.name ?? '');
    if (ne) errors.name = ne;
    const ee = validateEmail(v.email ?? '');
    if (ee) errors.email = ee;
    const pwError = validatePassword(password, { email: v.email, name: v.name });
    if (pwError) errors.password = pwError;
    if (Object.keys(errors).length) return fail(sectionId, { errors, values: { ...values, view: 'register' } });
    const limit = await checkModuleLimit(ctx.db, ctx.project.ownerId, ctx.project.id, 'members_members');
    if (!limit.allowed) return fail(sectionId, { message: 'This website is not accepting new members right now.', values }, 409);
    try {
      const row = (await ctx.db.query<{ id: string }>('insert into site_members (project_id, email, name, password_hash) values ($1, $2, $3, $4) returning id', [ctx.project.id, normalizeEmail(v.email!), v.name!.trim(), await hashPassword(password)]))[0]!;
      return { kind: 'redirect', to: back(input, { welcome: '1' }), cookies: await startSession(ctx, row.id) };
    } catch (e) {
      if (isUniqueViolation(e)) return fail(sectionId, { errors: { email: 'An account with this email already exists. Sign in instead.' }, values });
      throw e;
    }
  }
  if (action === 'login') {
    const email = normalizeEmail(form.get('email') ?? '').slice(0, 254);
    const password = (form.get('password') ?? '').slice(0, 200);
    const values = { email };
    const okIp = await visitorLimit(ctx, 'member-login', 20, 900);
    const okEmail = (await consume(ctx.db, { key: limitKey('site:member-login-email', `${ctx.project.id}|${email}`), max: 8, windowSec: 900 })).allowed;
    if (!okIp || !okEmail) return fail(sectionId, { message: 'Too many sign-in attempts. Please wait 15 minutes.', values }, 429);
    const row = (await ctx.db.query<{ id: string; password_hash: string }>('select id, password_hash from site_members where project_id = $1 and email = $2', [ctx.project.id, email]))[0];
    if (!row) {
      await burnPasswordCheck(password);
      return fail(sectionId, { message: 'The email or password is not correct.', values });
    }
    const check = await verifyPassword(password, row.password_hash);
    if (!check.ok) return fail(sectionId, { message: 'The email or password is not correct.', values });
    await ctx.db.query('update site_members set last_login_at = now() where id = $1', [row.id]);
    return { kind: 'redirect', to: back(input), cookies: await startSession(ctx, row.id) };
  }
  if (action === 'join') {
    const m = await currentMember(ctx);
    if (!m) return fail(sectionId, { message: 'Sign in first.' }, 409);
    const plan = (await ctx.db.query<{ id: string; data: { access?: string; durationDays?: number | null } }>(`select id, data from module_items where project_id = $1 and kind = 'plan' and status = 'active' and slug = $2`, [ctx.project.id, (form.get('plan') ?? '').slice(0, 80)]))[0];
    if (!plan) return fail(sectionId, { message: 'This plan is not available.' }, 409);
    const free = plan.data.access !== 'approval';
    try {
      await ctx.db.query(
        `insert into memberships (project_id, member_id, plan_id, status, starts_at, ends_at) values ($1, $2, $3, $4, case when $4 = 'active' then now() end, case when $4 = 'active' and $5::int is not null then now() + make_interval(days => $5::int) end)`,
        [ctx.project.id, m.id, plan.id, free ? 'active' : 'pending', plan.data.durationDays ?? null],
      );
    } catch (e) {
      if (!isUniqueViolation(e)) throw e; // already a member or already requested: nothing to do
    }
    return { kind: 'redirect', to: back(input, { joined: '1' }) };
  }
  return fail(sectionId, { message: 'Unknown action.' }, 409);
}

/* ------------------------------------------------------------------ owner management */

export type MemberRow = { id: string; name: string; email: string; createdAt: string; lastLoginAt: string | null; memberships: { id: string; plan: string; status: string; startsAt: string | null; endsAt: string | null }[] };

export async function listMembers(db: Db, ownerId: string, projectId: string, q: { q?: string; status?: string; page?: number } = {}): Promise<{ items: MemberRow[]; total: number; page: number; pageSize: number }> {
  const project = await ownedProjectRow(db, ownerId, projectId);
  const pageSize = 25;
  const page = Math.max(1, Math.trunc(q.page ?? 1));
  const params: unknown[] = [project.id];
  const where = ['m.project_id = $1'];
  const text = (q.q ?? '').trim().slice(0, 100);
  if (text) {
    params.push(`%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
    where.push(`(m.email ilike $${params.length} escape '\\' or m.name ilike $${params.length} escape '\\')`);
  }
  if (q.status === 'pending' || q.status === 'active') {
    params.push(q.status);
    where.push(`exists (select 1 from memberships x where x.member_id = m.id and x.status = $${params.length})`);
  }
  const total = Number((await db.query<{ n: string }>(`select count(*) as n from site_members m where ${where.join(' and ')}`, params))[0]?.n ?? 0);
  const rows = await db.query<{ id: string; name: string; email: string; created_at: Date; last_login_at: Date | null; ms: MemberRow['memberships'] | null }>(
    `select m.id, m.name, m.email, m.created_at, m.last_login_at,
            (select json_agg(json_build_object('id', x.id, 'plan', p.title, 'status', case when x.status = 'active' and x.ends_at <= now() then 'expired' else x.status end, 'startsAt', x.starts_at, 'endsAt', x.ends_at) order by x.created_at desc)
               from memberships x join module_items p on p.id = x.plan_id where x.member_id = m.id) as ms
       from site_members m where ${where.join(' and ')} order by m.created_at desc limit ${pageSize} offset ${(page - 1) * pageSize}`,
    params,
  );
  return { items: rows.map((r) => ({ id: r.id, name: r.name, email: r.email, createdAt: new Date(r.created_at).toISOString(), lastLoginAt: r.last_login_at ? new Date(r.last_login_at).toISOString() : null, memberships: r.ms ?? [] })), total, page, pageSize };
}

/** Approve, cancel or reactivate one membership. */
export async function setMembership(db: Db, ownerId: string, projectId: string, membershipId: string, action: unknown): Promise<void> {
  const project = await ownedProjectRow(db, ownerId, projectId);
  if (!isUuid(membershipId)) throw new ProjectError('not_found', 'Membership not found.');
  const row = (await db.query<{ status: string; duration: number | null }>(`select x.status, (p.data->>'durationDays')::int as duration from memberships x join module_items p on p.id = x.plan_id where x.id = $1 and x.project_id = $2`, [membershipId, project.id]))[0];
  if (!row) throw new ProjectError('not_found', 'Membership not found.');
  if (action === 'approve') {
    await db.query(`update memberships set status = 'active', starts_at = now(), ends_at = case when $3::int is not null then now() + make_interval(days => $3::int) end, updated_at = now() where id = $1 and project_id = $2`, [membershipId, project.id, row.duration]);
  } else if (action === 'cancel') {
    await db.query(`update memberships set status = 'cancelled', ends_at = coalesce(least(ends_at, now()), now()), updated_at = now() where id = $1 and project_id = $2`, [membershipId, project.id]);
  } else throw new ProjectError('invalid', 'Unknown action.');
}

/** Removes a member account and everything tied to it (sessions, memberships, enrollments, progress). Asked for explicitly. */
export async function removeMember(db: Db, ownerId: string, projectId: string, memberId: string): Promise<void> {
  const project = await ownedProjectRow(db, ownerId, projectId);
  if (!isUuid(memberId)) throw new ProjectError('not_found', 'Member not found.');
  const r = await db.query('delete from site_members where id = $1 and project_id = $2 returning id', [memberId, project.id]);
  if (r.length === 0) throw new ProjectError('not_found', 'Member not found.');
}
