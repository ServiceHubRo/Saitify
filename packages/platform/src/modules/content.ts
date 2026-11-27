import { richText, type BlogData, type CourseOutline, type CoursesData, type DirectoryData, type EventCard, type EventsData, type FormState, type ImageRef, type PostCard, type RichBlock } from '@saitify/engine';
import { isUniqueViolation } from '../auth/service';
import type { Db } from '../db/types';
import { ProjectError, isUuid } from '../projects/service';
import { parseSettings } from './catalog';
import type { ItemRow } from './items';
import { currentMember, hasMembership, hasPlanIds, memberLoginHref } from './members';
import { ownedProjectRow } from './service';
import { actionCtx, checkFormToken, detailHref, EMAIL_RE, fail, formValues, hashToken, newVisitorToken, notify, ownerEmail, shortRef, visitorLimit, type ActionInput, type ActionResult, type SiteCtx } from './visitor';

export type Meta = { title: string; description?: string; image?: ImageRef };
export type Loaded<T> = { data: T; notFound?: boolean; meta?: Meta };
const missing = <T>(): Loaded<T> => ({ data: null as never, notFound: true });
const like = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
const pageOf = (query: Record<string, string>) => Math.max(1, Math.min(1000, Math.trunc(Number(query.page) || 1)));
const iso = (d: Date | null) => (d ? new Date(d).toISOString() : '');

async function categories(ctx: SiteCtx, kind: string) {
  return ctx.db.query<{ id: string; slug: string; name: string }>(`select id, slug, title as name from module_items where project_id = $1 and kind = $2 and status = 'active' order by position, lower(title)`, [ctx.project.id, kind]);
}

/* ================================================================== blog */

type PostData = { excerpt?: string; cover?: ImageRef; body?: RichBlock[]; categories?: string[]; tags?: string[]; author?: string; membersOnly?: boolean; seoTitle?: string; seoDescription?: string };
type PostRow = ItemRow & { data: PostData };
// Drafts and future (scheduled) posts are excluded here, in the query itself: there is no code path that could show them.
const PUBLISHED_POST = `project_id = $1 and kind = 'post' and status = 'published' and at is not null and at <= now()`;

export async function loadBlog(ctx: SiteCtx, content: { postsPerPage?: number }, sub: string[], query: Record<string, string>): Promise<Loaded<BlogData>> {
  const cats = await categories(ctx, 'post_category');
  const showAuthor = parseSettings('blog', ctx.active.get('blog')).showAuthor;
  const toCard = (p: PostRow): PostCard => ({
    slug: p.slug ?? '', title: p.title, excerpt: p.data.excerpt || richText(p.data.body ?? []).slice(0, 220) || undefined, cover: p.data.cover, date: iso(p.at),
    author: showAuthor ? p.data.author || undefined : undefined, categories: cats.filter((c) => p.data.categories?.includes(c.id)).map((c) => ({ slug: c.slug, name: c.name })), membersOnly: Boolean(p.data.membersOnly),
  });
  if (sub.length) {
    if (sub.length > 1) return missing();
    const p = (await ctx.db.query<PostRow>(`select * from module_items where ${PUBLISHED_POST} and slug = $2`, [ctx.project.id, sub[0]]))[0];
    if (!p) return missing();
    let body: RichBlock[] | null = p.data.body ?? [];
    if (p.data.membersOnly) {
      const m = await currentMember(ctx);
      if (!m || !(await hasMembership(ctx, m.id))) body = null; // never sent to visitors without access
    }
    const related = await ctx.db.query<PostRow>(
      `select * from module_items where ${PUBLISHED_POST} and id <> $2 and (cardinality($3::text[]) = 0 or data->'categories' ?| $3::text[]) order by at desc limit 3`,
      [ctx.project.id, p.id, p.data.categories ?? []],
    );
    return {
      data: { mode: 'post', post: { ...toCard(p), body, tags: p.data.tags ?? [], loginHref: memberLoginHref(ctx) }, related: related.map(toCard) },
      meta: { title: p.data.seoTitle || p.title, description: p.data.seoDescription || p.data.excerpt || undefined, image: p.data.cover },
    };
  }
  const per = Math.min(Math.max(Math.trunc(content.postsPerPage ?? 9), 3), 24);
  const page = pageOf(query);
  const where = [PUBLISHED_POST];
  const params: unknown[] = [ctx.project.id];
  const cat = cats.find((c) => c.slug === query.category);
  if (cat) {
    params.push(cat.id);
    where.push(`data->'categories' ? $${params.length}`);
  }
  const tag = (query.tag ?? '').trim().slice(0, 60);
  if (tag) {
    params.push(tag);
    where.push(`data->'tags' ? $${params.length}`);
  }
  const q = (query.q ?? '').trim().slice(0, 100);
  if (q) {
    params.push(like(q));
    where.push(`(title ilike $${params.length} escape '\\' or coalesce(data->>'excerpt', '') ilike $${params.length} escape '\\')`);
  }
  const total = Number((await ctx.db.query<{ n: string }>(`select count(*) as n from module_items where ${where.join(' and ')}`, params))[0]?.n ?? 0);
  const rows = await ctx.db.query<PostRow>(`select * from module_items where ${where.join(' and ')} order by featured desc, at desc limit ${per} offset ${(page - 1) * per}`, params);
  return { data: { mode: 'list', posts: rows.map(toCard), paging: { page, pages: Math.max(1, Math.ceil(total / per)), total }, categories: cats.map((c) => ({ slug: c.slug, name: c.name })), category: cat?.slug, tag: tag || undefined, q: q || undefined } };
}

/* ================================================================== events */

type EventData = { timezone?: string; online?: boolean; location?: string; onlineUrl?: string; description?: string; cover?: ImageRef; registration?: 'open' | 'closed' | 'none'; deadline?: string; organizer?: string; category?: string };
type EventRow = ItemRow & { data: EventData };

const eventCard = (e: EventRow): EventCard => ({
  slug: e.slug ?? '', title: e.title, startsAt: iso(e.at), endsAt: e.ends_at ? iso(e.ends_at) : undefined, timezone: e.data.timezone || 'UTC', location: e.data.location || undefined,
  online: Boolean(e.data.online), cover: e.data.cover, category: e.data.category || undefined, status: e.status === 'cancelled' ? 'cancelled' : 'published',
});

async function taken(db: Db, eventId: string): Promise<number> {
  return Number((await db.query<{ n: string }>(`select coalesce(sum(quantity), 0) as n from event_registrations where event_id = $1 and status = 'registered'`, [eventId]))[0]?.n ?? 0);
}

/** Registration state, decided on the server from stored data only. */
export function registrationState(e: { status: string; at: Date | null; capacity: number | null; data: EventData }, used: number, now: Date): 'open' | 'closed' | 'full' | 'ended' | 'none' {
  if (e.data.registration === 'none') return 'none';
  if (e.status !== 'published' || !e.at || new Date(e.at) <= now) return e.status === 'published' ? 'ended' : 'closed';
  if (e.data.registration !== 'open' || (e.data.deadline && new Date(e.data.deadline) <= now)) return 'closed';
  if (e.capacity !== null && used >= e.capacity) return 'full';
  return 'open';
}

export async function loadEvents(ctx: SiteCtx, sectionId: string, content: { limit?: number; showPast?: boolean }, sub: string[], query: Record<string, string>, returnTo: string, state?: FormState): Promise<Loaded<EventsData>> {
  if (sub.length) {
    if (sub.length > 1) return missing();
    const e = (await ctx.db.query<EventRow>(`select * from module_items where project_id = $1 and kind = 'event' and status in ('published', 'cancelled') and slug = $2`, [ctx.project.id, sub[0]]))[0];
    if (!e) return missing();
    const used = await taken(ctx.db, e.id);
    let registered: { reference: string } | undefined;
    if (query.registered && query.k) {
      const r = (await ctx.db.query<{ reference: string }>(`select reference from event_registrations where event_id = $1 and reference = $2 and access_hash = $3 and status = 'registered'`, [e.id, query.registered.slice(0, 20), hashToken(query.k.slice(0, 100))]))[0];
      if (r) registered = r;
    }
    return {
      data: {
        mode: 'event',
        event: {
          ...eventCard(e), description: e.data.description || undefined, organizer: e.data.organizer || undefined, onlineUrl: registered && e.data.online ? e.data.onlineUrl : undefined,
          spotsLeft: e.capacity === null ? null : Math.max(0, e.capacity - used), registration: registrationState(e, used, ctx.now),
        },
        action: actionCtx(ctx, 'events', 'register', sectionId, returnTo), state, registered,
      },
      meta: { title: e.title, description: e.data.description?.slice(0, 200), image: e.data.cover },
    };
  }
  const limit = Math.min(Math.max(Math.trunc(content.limit ?? 12), 1), 60);
  const upcoming = await ctx.db.query<EventRow>(`select * from module_items where project_id = $1 and kind = 'event' and status in ('published', 'cancelled') and coalesce(ends_at, at) >= now() order by at asc limit ${limit}`, [ctx.project.id]);
  const past = content.showPast === false ? [] : await ctx.db.query<EventRow>(`select * from module_items where project_id = $1 and kind = 'event' and status = 'published' and coalesce(ends_at, at) < now() order by at desc limit 12`, [ctx.project.id]);
  return { data: { mode: 'list', upcoming: upcoming.map(eventCard), past: past.map(eventCard) } };
}

export async function eventAction(ctx: SiteCtx, action: string, input: ActionInput): Promise<ActionResult> {
  const { form, sectionId, returnTo } = input;
  if (action !== 'register') return fail(sectionId, { message: 'Unknown action.' }, 409);
  const v = formValues(form, ['name', 'email', 'quantity'], 254);
  if (checkFormToken(ctx, form.get('_token'), 2) !== 'ok' || (form.get('website_url') ?? '') !== '') return fail(sectionId, { message: 'Please check your details and try again.', values: v });
  const errors: Record<string, string> = {};
  if (!v.name || v.name.length > 100) errors.name = 'Enter your name.';
  if (!EMAIL_RE.test(v.email ?? '')) errors.email = 'Enter a valid email address.';
  const qty = Math.trunc(Number(v.quantity || '1'));
  if (!Number.isInteger(qty) || qty < 1 || qty > 10) errors.quantity = 'Choose 1 to 10 people.';
  if (Object.keys(errors).length) return fail(sectionId, { errors, values: v });
  if (!(await visitorLimit(ctx, 'event', 10, 3600))) return fail(sectionId, { message: 'Too many registrations from this connection. Please try later.', values: v }, 429);
  const reference = shortRef();
  const key = newVisitorToken();
  const result = await ctx.db.tx(async (t) => {
    // Locking the event row serialises registrations for this event, so capacity can never be exceeded.
    const e = (await t.query<EventRow>(`select * from module_items where project_id = $1 and kind = 'event' and slug = $2 for update`, [ctx.project.id, (form.get('event') ?? '').slice(0, 80)]))[0];
    if (!e) return { error: 'This event is not available.' };
    const used = await taken(t, e.id);
    const state = registrationState(e, used, ctx.now);
    if (state !== 'open') return { error: state === 'full' ? 'Sorry, this event is full.' : 'Registration for this event is closed.' };
    if (e.capacity !== null && used + qty > e.capacity) return { error: `Only ${e.capacity - used} ${e.capacity - used === 1 ? 'place is' : 'places are'} left.` };
    try {
      await t.query(`insert into event_registrations (project_id, event_id, name, email, quantity, reference, access_hash) values ($1, $2, $3, $4, $5, $6, $7)`, [ctx.project.id, e.id, v.name, v.email!.toLowerCase(), qty, reference, hashToken(key)]);
    } catch (err) {
      if (isUniqueViolation(err)) return { error: 'This email is already registered for this event.' };
      throw err;
    }
    return { event: e };
  });
  if ('error' in result) return fail(sectionId, { message: result.error, values: v }, 409);
  const e = result.event!;
  const settings = parseSettings('events', ctx.active.get('events'));
  await notify(ctx, settings.notifyEmail || (await ownerEmail(ctx.db, ctx.project.id)), `New registration: ${e.title}`, [`${v.name} (${v.email}) registered ${qty} ${qty === 1 ? 'person' : 'people'} for ${e.title}.`]);
  const link = `${ctx.base}${(detailHref(ctx, 'events', e.slug ?? '') ?? '').slice(ctx.prefix.length)}?registered=${reference}&k=${key}`;
  await notify(ctx, v.email!, `You are registered: ${e.title}`, [`Your registration for ${e.title} is confirmed. Reference ${reference}.`, `Details: ${link}`]);
  return { kind: 'redirect', to: `${returnTo.path}?${new URLSearchParams({ registered: reference, k: key })}` };
}

export async function listRegistrations(db: Db, ownerId: string, projectId: string, eventId: string) {
  const project = await ownedProjectRow(db, ownerId, projectId);
  if (!isUuid(eventId)) throw new ProjectError('not_found', 'Event not found.');
  const e = (await db.query<{ capacity: number | null; title: string }>(`select capacity, title from module_items where id = $1 and project_id = $2 and kind = 'event'`, [eventId, project.id]))[0];
  if (!e) throw new ProjectError('not_found', 'Event not found.');
  const rows = await db.query<{ id: string; name: string; email: string; quantity: number; status: string; reference: string; created_at: Date }>(`select id, name, email, quantity, status, reference, created_at from event_registrations where event_id = $1 and project_id = $2 order by created_at desc limit 2000`, [eventId, project.id]);
  const used = rows.filter((r) => r.status === 'registered').reduce((n, r) => n + r.quantity, 0);
  return { title: e.title, capacity: e.capacity, used, items: rows.map((r) => ({ id: r.id, name: r.name, email: r.email, quantity: r.quantity, status: r.status, reference: r.reference, createdAt: iso(r.created_at) })) };
}

export async function cancelRegistration(db: Db, ownerId: string, projectId: string, id: string): Promise<void> {
  const project = await ownedProjectRow(db, ownerId, projectId);
  if (!isUuid(id)) throw new ProjectError('not_found', 'Registration not found.');
  const r = await db.query(`update event_registrations set status = 'cancelled', updated_at = now() where id = $1 and project_id = $2 and status = 'registered' returning id`, [id, project.id]);
  if (!r.length) throw new ProjectError('not_found', 'Registration not found or already cancelled.');
}

/* ================================================================== directory */

type ListingData = { summary?: string; description?: string; category?: string; location?: string; phone?: string; email?: string; website?: string; images?: ImageRef[]; custom?: Record<string, string> };
type ListingRow = ItemRow & { data: ListingData };
const DIR_SORTS: Record<string, string> = { featured: 'featured desc, lower(title)', name: 'lower(title)', newest: 'created_at desc' };

export async function loadDirectory(ctx: SiteCtx, content: { listingsPerPage?: number }, sub: string[], query: Record<string, string>): Promise<Loaded<DirectoryData>> {
  const cats = await categories(ctx, 'listing_category');
  const catOf = (id?: string) => {
    const c = cats.find((x) => x.id === id);
    return c ? { slug: c.slug, name: c.name } : undefined;
  };
  const card = (l: ListingRow) => ({ slug: l.slug ?? '', title: l.title, summary: l.data.summary || undefined, image: l.data.images?.[0], category: catOf(l.data.category), location: l.data.location || undefined, featured: l.featured });
  if (sub.length) {
    if (sub.length > 1) return missing();
    const l = (await ctx.db.query<ListingRow>(`select * from module_items where project_id = $1 and kind = 'listing' and status = 'published' and slug = $2`, [ctx.project.id, sub[0]]))[0];
    if (!l) return missing();
    const defs = parseSettings('directory', ctx.active.get('directory')).fields;
    return {
      data: { mode: 'listing', listing: { ...card(l), description: l.data.description || undefined, images: l.data.images ?? [], phone: l.data.phone || undefined, email: l.data.email || undefined, website: l.data.website || undefined, fields: defs.map((d) => ({ label: d.label, value: l.data.custom?.[d.key] ?? '' })).filter((f) => f.value) } },
      meta: { title: l.title, description: l.data.summary || l.data.description?.slice(0, 200), image: l.data.images?.[0] },
    };
  }
  const per = Math.min(Math.max(Math.trunc(content.listingsPerPage ?? 12), 4), 48);
  const page = pageOf(query);
  const sort = DIR_SORTS[query.sort ?? ''] ? query.sort! : 'featured';
  const where = [`project_id = $1`, `kind = 'listing'`, `status = 'published'`];
  const params: unknown[] = [ctx.project.id];
  const cat = cats.find((c) => c.slug === query.category);
  if (cat) {
    params.push(cat.id);
    where.push(`data->>'category' = $${params.length}`);
  }
  const q = (query.q ?? '').trim().slice(0, 100);
  if (q) {
    params.push(like(q));
    where.push(`(title ilike $${params.length} escape '\\' or coalesce(data->>'summary', '') ilike $${params.length} escape '\\' or coalesce(data->>'location', '') ilike $${params.length} escape '\\')`);
  }
  const total = Number((await ctx.db.query<{ n: string }>(`select count(*) as n from module_items where ${where.join(' and ')}`, params))[0]?.n ?? 0);
  const rows = await ctx.db.query<ListingRow>(`select * from module_items where ${where.join(' and ')} order by ${DIR_SORTS[sort]}, id limit ${per} offset ${(page - 1) * per}`, params);
  return { data: { mode: 'list', listings: rows.map(card), paging: { page, pages: Math.max(1, Math.ceil(total / per)), total }, categories: cats.map((c) => ({ slug: c.slug, name: c.name })), category: cat?.slug, q: q || undefined, sort } };
}

/* ================================================================== courses */

type CourseData = { summary?: string; description?: string; cover?: ImageRef; instructor?: string; access?: 'free' | 'members' | 'approval'; plans?: string[]; priceText?: string; sections?: { id: string; title: string }[] };
type CourseRow = ItemRow & { data: CourseData };
type LessonData = { section?: string; body?: RichBlock[]; video?: string; downloads?: { label: string; href: string }[]; preview?: boolean };
type LessonRow = ItemRow & { data: LessonData };

async function lessonsOf(db: Db, courseId: string): Promise<LessonRow[]> {
  return db.query<LessonRow>(`select * from module_items where parent_id = $1 and kind = 'lesson' and status = 'published' order by position, created_at`, [courseId]);
}

/** Can this member enroll? Decided on the server; the reason is shown to the visitor. */
async function enrollCheck(ctx: SiteCtx, c: CourseRow, memberId: string | null): Promise<{ ok: boolean; reason?: string }> {
  if (!memberId) return { ok: false, reason: 'Sign in or create an account to enroll.' };
  if (c.data.access === 'members' && !(await hasPlanIds(ctx, memberId, c.data.plans ?? []))) return { ok: false, reason: 'This course is included in a membership plan.' };
  return { ok: true };
}

async function outline(ctx: SiteCtx, c: CourseRow): Promise<{ course: CourseOutline; lessons: LessonRow[]; enrollmentId: string | null }> {
  const lessons = await lessonsOf(ctx.db, c.id);
  const m = await currentMember(ctx);
  const enr = m ? (await ctx.db.query<{ id: string; status: 'pending' | 'active' }>(`select id, status from course_enrollments where course_id = $1 and member_id = $2 and status in ('pending','active')`, [c.id, m.id]))[0] : undefined;
  const done = new Set(enr ? (await ctx.db.query<{ lesson_id: string }>('select lesson_id from lesson_progress where enrollment_id = $1', [enr.id])).map((r) => r.lesson_id) : []);
  const active = enr?.status === 'active';
  const href = (l: LessonRow) => (active || l.data.preview ? detailHref(ctx, 'courses', c.slug ?? '', l.slug ?? '') : null);
  const sections = (c.data.sections ?? []).map((s) => ({ title: s.title, lessons: lessons.filter((l) => l.data.section === s.id).map((l) => ({ slug: l.slug ?? '', title: l.title, completed: done.has(l.id), preview: Boolean(l.data.preview), href: href(l) })) })).filter((s) => s.lessons.length);
  const total = lessons.length;
  const completed = lessons.filter((l) => done.has(l.id)).length;
  const next = lessons.find((l) => !done.has(l.id)) ?? lessons[0];
  const check = enr ? { ok: false } : await enrollCheck(ctx, c, m?.id ?? null);
  return {
    lessons,
    enrollmentId: active ? enr!.id : null,
    course: {
      slug: c.slug ?? '', title: c.title, summary: c.data.summary || undefined, cover: c.data.cover, instructor: c.data.instructor || undefined, lessons: total, access: c.data.access ?? 'free', priceText: c.data.priceText || undefined,
      description: c.data.description || undefined, sections, enrollment: enr?.status ?? null, progress: total ? Math.round((completed / total) * 100) : 0,
      canEnroll: check.ok, reason: check.reason, continueHref: active && next ? detailHref(ctx, 'courses', c.slug ?? '', next.slug ?? '') : null, loginHref: m ? (c.data.access === 'members' ? memberLoginHref(ctx) : null) : memberLoginHref(ctx),
    },
  };
}

export async function loadCourses(ctx: SiteCtx, sectionId: string, sub: string[], returnTo: string, state?: FormState): Promise<Loaded<CoursesData>> {
  if (sub.length === 0) {
    const rows = await ctx.db.query<CourseRow & { n: string }>(`select c.*, (select count(*) from module_items l where l.parent_id = c.id and l.kind = 'lesson' and l.status = 'published') as n from module_items c where c.project_id = $1 and c.kind = 'course' and c.status = 'published' order by c.position, lower(c.title)`, [ctx.project.id]);
    return { data: { mode: 'list', courses: rows.map((c) => ({ slug: c.slug ?? '', title: c.title, summary: c.data.summary || undefined, cover: c.data.cover, instructor: c.data.instructor || undefined, lessons: Number(c.n), access: c.data.access ?? 'free', priceText: c.data.priceText || undefined })) } };
  }
  if (sub.length > 2) return missing();
  const c = (await ctx.db.query<CourseRow>(`select * from module_items where project_id = $1 and kind = 'course' and status = 'published' and slug = $2`, [ctx.project.id, sub[0]]))[0];
  if (!c) return missing();
  const o = await outline(ctx, c);
  const meta = { title: c.title, description: c.data.summary || undefined, image: c.data.cover };
  if (sub.length === 2) {
    const idx = o.lessons.findIndex((l) => l.slug === sub[1]);
    const lesson = o.lessons[idx];
    if (!lesson) return missing();
    // Protected lessons are only ever loaded for an active enrollment (or when marked as a free preview).
    if (!o.enrollmentId && !lesson.data.preview) return { data: { mode: 'course', course: o.course, action: actionCtx(ctx, 'courses', 'enroll', sectionId, returnTo), state: { errors: {}, values: {}, message: 'Enroll in this course to open its lessons.' } }, meta };
    const done = o.enrollmentId ? (await ctx.db.query('select 1 from lesson_progress where enrollment_id = $1 and lesson_id = $2', [o.enrollmentId, lesson.id])).length > 0 : false;
    const link = (l?: LessonRow) => (l && (o.enrollmentId || l.data.preview) ? detailHref(ctx, 'courses', c.slug ?? '', l.slug ?? '') : null);
    return {
      data: {
        mode: 'lesson', course: o.course,
        lesson: { slug: lesson.slug ?? '', title: lesson.title, body: lesson.data.body ?? [], video: lesson.data.video || undefined, downloads: lesson.data.downloads ?? [], completed: done },
        prev: link(o.lessons[idx - 1]), next: link(o.lessons[idx + 1]), action: actionCtx(ctx, 'courses', 'progress', sectionId, returnTo),
      },
      meta: { title: `${lesson.title} | ${c.title}` },
    };
  }
  return { data: { mode: 'course', course: o.course, action: actionCtx(ctx, 'courses', 'enroll', sectionId, returnTo), state }, meta };
}

export async function courseAction(ctx: SiteCtx, action: string, input: ActionInput): Promise<ActionResult> {
  const { form, sectionId, returnTo } = input;
  if (checkFormToken(ctx, form.get('_token'), 0) !== 'ok') return fail(sectionId, { message: 'This page was open for a long time. Please try again.' });
  const m = await currentMember(ctx);
  if (!m) return fail(sectionId, { message: 'Sign in first.' }, 409);
  const c = (await ctx.db.query<CourseRow>(`select * from module_items where project_id = $1 and kind = 'course' and status = 'published' and slug = $2`, [ctx.project.id, (form.get('course') ?? '').slice(0, 80)]))[0];
  if (!c) return fail(sectionId, { message: 'This course is not available.' }, 409);
  if (action === 'enroll') {
    const check = await enrollCheck(ctx, c, m.id);
    if (!check.ok) return fail(sectionId, { message: check.reason }, 409);
    const status = c.data.access === 'approval' ? 'pending' : 'active';
    await ctx.db.query(`insert into course_enrollments (project_id, course_id, member_id, status) values ($1, $2, $3, $4) on conflict (course_id, member_id) do update set status = case when course_enrollments.status = 'revoked' then excluded.status else course_enrollments.status end, updated_at = now()`, [ctx.project.id, c.id, m.id, status]);
    if (status === 'pending') await notify(ctx, await ownerEmail(ctx.db, ctx.project.id), `Enrollment request: ${c.title}`, [`${m.name} (${m.email}) asked to join ${c.title}. Approve it in Saitlify.`]);
    return { kind: 'redirect', to: returnTo.path };
  }
  if (action === 'progress') {
    const enr = (await ctx.db.query<{ id: string }>(`select id from course_enrollments where course_id = $1 and member_id = $2 and status = 'active'`, [c.id, m.id]))[0];
    if (!enr) return fail(sectionId, { message: 'Enroll in this course first.' }, 409);
    const lesson = (await ctx.db.query<{ id: string }>(`select id from module_items where parent_id = $1 and kind = 'lesson' and status = 'published' and slug = $2`, [c.id, (form.get('lesson') ?? '').slice(0, 80)]))[0];
    if (!lesson) return fail(sectionId, { message: 'This lesson is not available.' }, 409);
    if (form.get('done') === '0') await ctx.db.query('delete from lesson_progress where enrollment_id = $1 and lesson_id = $2', [enr.id, lesson.id]);
    else await ctx.db.query('insert into lesson_progress (enrollment_id, lesson_id) values ($1, $2) on conflict do nothing', [enr.id, lesson.id]);
    return { kind: 'redirect', to: returnTo.path };
  }
  return fail(sectionId, { message: 'Unknown action.' }, 409);
}

export async function listEnrollments(db: Db, ownerId: string, projectId: string, q: { course?: string; status?: string } = {}) {
  const project = await ownedProjectRow(db, ownerId, projectId);
  const w = ['e.project_id = $1'];
  const p: unknown[] = [project.id];
  if (q.course && isUuid(q.course)) {
    p.push(q.course);
    w.push(`e.course_id = $${p.length}`);
  }
  if (q.status && ['pending', 'active', 'revoked'].includes(q.status)) {
    p.push(q.status);
    w.push(`e.status = $${p.length}`);
  }
  const rows = await db.query<{ id: string; status: string; created_at: Date; course: string; name: string; email: string; total: string; done: string }>(
    `select e.id, e.status, e.created_at, c.title as course, m.name, m.email,
            (select count(*) from module_items l where l.parent_id = c.id and l.kind = 'lesson' and l.status = 'published') as total,
            (select count(*) from lesson_progress lp where lp.enrollment_id = e.id) as done
       from course_enrollments e join module_items c on c.id = e.course_id join site_members m on m.id = e.member_id
      where ${w.join(' and ')} order by e.created_at desc limit 1000`,
    p,
  );
  return { items: rows.map((r) => ({ id: r.id, status: r.status, createdAt: iso(r.created_at), course: r.course, name: r.name, email: r.email, progress: Number(r.total) ? Math.min(100, Math.round((Number(r.done) / Number(r.total)) * 100)) : 0 })) };
}

export async function setEnrollment(db: Db, ownerId: string, projectId: string, id: string, action: unknown): Promise<void> {
  const project = await ownedProjectRow(db, ownerId, projectId);
  if (!isUuid(id)) throw new ProjectError('not_found', 'Enrollment not found.');
  const to = action === 'approve' ? 'active' : action === 'revoke' ? 'revoked' : null;
  if (!to) throw new ProjectError('invalid', 'Unknown action.');
  const r = await db.query(`update course_enrollments set status = $3, updated_at = now() where id = $1 and project_id = $2 returning id`, [id, project.id, to]);
  if (!r.length) throw new ProjectError('not_found', 'Enrollment not found.');
}
