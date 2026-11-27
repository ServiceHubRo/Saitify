import type { BookingData, FormState } from '@saitify/engine';
import type { Db } from '../db/types';
import { ProjectError, isUuid } from '../projects/service';
import { parseSettings, WEEKDAYS, type ModuleSettings, type WeeklyHours } from './catalog';
import { checkModuleLimit } from './entitlements';
import { ownedProjectRow, assertModuleActive } from './service';
import { addDays, hhmmToMinutes, minutesToHhmm, utcToZoned, zonedToUtc } from './time';
import { actionCtx, checkFormToken, EMAIL_RE, fail, formValues, hashToken, newVisitorToken, notify, ownerEmail, PHONE_RE, shortRef, visitorLimit, type ActionInput, type ActionResult, type SiteCtx } from './visitor';

type Settings = ModuleSettings<'booking'>;
export type Resource = { id: string | null; hours: WeeklyHours | null };
export type Existing = { id?: string; start: Date; end: Date; staffId: string | null; serviceId: string | null };
export type ServiceInfo = { id: string; durationMin: number; capacity: number };
export type Slot = { time: string; start: Date; staff: (string | null)[] };

const DAY_MS = 86_400_000;
const weekdayOf = (day: string) => WEEKDAYS[(new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7]!;

/**
 * Free start times on one day, in the business's time zone. Pure and deterministic: the same function decides what visitors
 * see and, inside a locked transaction, whether a booking may be created. A start is free for a resource (a team member, or
 * the business when the service has no team) when it lies inside working hours (breaks are gaps between ranges), respects the
 * minimum notice and the booking window, and does not overlap another appointment (plus buffer). Group services
 * (capacity > 1) share a start with bookings of the same service until full.
 */
export function slotsForDay(args: { settings: Settings; service: ServiceInfo; resources: Resource[]; bookings: Existing[]; day: string; now: Date }): Slot[] {
  const { settings: s, service, bookings, day, now } = args;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || s.closedDates.includes(day)) return [];
  const today = utcToZoned(now, s.timezone).day;
  if (day < today || day > addDays(today, s.maxAdvanceDays)) return [];
  const earliest = now.getTime() + s.minNoticeHours * 3_600_000;
  const resources = args.resources.length ? args.resources : [{ id: null, hours: null }];
  const wd = weekdayOf(day);
  const out = new Map<string, Slot>();
  const buffer = s.bufferMin * 60_000;
  for (const r of resources) {
    const ranges = (r.hours ?? s.hours)[wd] ?? [];
    const mine = bookings.filter((b) => b.staffId === r.id);
    for (const range of ranges) {
      const from = hhmmToMinutes(range.start);
      const to = hhmmToMinutes(range.end);
      for (let t = from; t + service.durationMin <= to; t += s.intervalMin) {
        const start = zonedToUtc(day, t, s.timezone);
        if (start.getTime() < earliest) continue;
        const end = new Date(start.getTime() + service.durationMin * 60_000);
        const overlapping = mine.filter((b) => b.start.getTime() < end.getTime() + buffer && b.end.getTime() + buffer > start.getTime());
        const free =
          overlapping.length === 0 ||
          (service.capacity > 1 && overlapping.length < service.capacity && overlapping.every((b) => b.serviceId === service.id && b.start.getTime() === start.getTime()));
        if (!free) continue;
        const key = minutesToHhmm(t);
        const slot = out.get(key) ?? { time: key, start, staff: [] };
        slot.staff.push(r.id);
        out.set(key, slot);
      }
    }
  }
  return [...out.values()].sort((a, b) => a.start.getTime() - b.start.getTime());
}

/* ------------------------------------------------------------------ data */

type ServiceRow = { id: string; slug: string; title: string; capacity: number | null; data: { durationMin?: number; priceText?: string; description?: string; staff?: string[] } };
type StaffRow = { id: string; slug: string; title: string; data: { customHours?: boolean; hours?: WeeklyHours } };

async function services(db: Db, projectId: string) {
  return db.query<ServiceRow>(`select id, slug, title, capacity, data from module_items where project_id = $1 and kind = 'service' and status = 'active' order by position, lower(title)`, [projectId]);
}
async function staffFor(db: Db, projectId: string, service: ServiceRow): Promise<StaffRow[]> {
  const ids = service.data.staff ?? [];
  if (ids.length === 0) return [];
  return db.query<StaffRow>(`select id, slug, title, data from module_items where project_id = $1 and kind = 'staff' and status = 'active' and id = any($2::uuid[]) order by position, lower(title)`, [projectId, ids]);
}
async function existing(db: Db, projectId: string, from: Date, to: Date, exceptId?: string): Promise<Existing[]> {
  const rows = await db.query<{ id: string; starts_at: Date; ends_at: Date; staff_id: string | null; service_id: string | null }>(
    `select id, starts_at, ends_at, staff_id, service_id from bookings where project_id = $1 and status in ('pending','confirmed') and starts_at < $3 and ends_at > $2 and ($4::uuid is null or id <> $4::uuid)`,
    [projectId, from, to, exceptId ?? null],
  );
  return rows.map((r) => ({ id: r.id, start: new Date(r.starts_at), end: new Date(r.ends_at), staffId: r.staff_id, serviceId: r.service_id }));
}
const resourcesOf = (staff: StaffRow[]): Resource[] => staff.map((p) => ({ id: p.id, hours: p.data.customHours && p.data.hours ? p.data.hours : null }));
const info = (s: ServiceRow): ServiceInfo => ({ id: s.id, durationMin: s.data.durationMin ?? 30, capacity: Math.max(1, s.capacity ?? 1) });

/** Slots for a day with everything loaded from the database. `exceptId` ignores one booking (when moving it). */
async function daySlots(db: Db, projectId: string, settings: Settings, service: ServiceRow, staff: StaffRow[], day: string, now: Date, exceptId?: string) {
  const from = new Date(zonedToUtc(day, 0, settings.timezone).getTime() - DAY_MS);
  const to = new Date(from.getTime() + 3 * DAY_MS);
  return slotsForDay({ settings, service: info(service), resources: resourcesOf(staff), bookings: await existing(db, projectId, from, to, exceptId), day, now });
}

/* ------------------------------------------------------------------ public section */

const DAYS_SHOWN = 21;
const paused = 'Online booking is not available right now. Please contact us directly.';

export async function loadBooking(ctx: SiteCtx, sectionId: string, query: Record<string, string>, returnTo: string, override?: { state?: FormState; extra?: Record<string, string> }): Promise<BookingData> {
  const settings = parseSettings('booking', ctx.active.get('booking'));
  const all = await services(ctx.db, ctx.project.id);
  const base: BookingData = {
    step: 'service', timezone: settings.timezone,
    services: all.map((s) => ({ slug: s.slug, title: s.title, description: s.data.description || undefined, duration: s.data.durationMin ?? 30, priceText: s.data.priceText || undefined })),
    staff: [], selected: {}, days: [], slots: [], action: actionCtx(ctx, 'booking', 'book', sectionId, returnTo), state: override?.state, policy: settings.policy || undefined,
  };
  if (query.booked && query.k) {
    const b = (await ctx.db.query<{ reference: string; status: 'pending' | 'confirmed'; starts_at: Date }>(`select reference, status, starts_at from bookings where project_id = $1 and reference = $2 and access_hash = $3`, [ctx.project.id, query.booked.slice(0, 20), hashToken(query.k.slice(0, 100))]))[0];
    if (b) return { ...base, step: 'done', done: { reference: b.reference, status: b.status === 'confirmed' ? 'confirmed' : 'pending', when: new Date(b.starts_at).toISOString() } };
  }
  if (!Object.values(settings.hours).some((r) => r.length)) return { ...base, paused };
  const service = all.find((s) => s.slug === query.service);
  if (!service) return base;
  const staff = await staffFor(ctx.db, ctx.project.id, service);
  const selected: BookingData['selected'] = { service: service.slug };
  const out: BookingData = { ...base, staff: staff.map((p) => ({ slug: p.slug, name: p.title })), selected };
  let chosen = staff;
  if (staff.length > 1) {
    if (!query.staff) return { ...out, step: 'staff' };
    if (query.staff !== 'any') {
      const one = staff.find((p) => p.slug === query.staff);
      if (!one) return { ...out, step: 'staff' };
      chosen = [one];
    }
    selected.staff = query.staff === 'any' ? 'any' : chosen[0]!.slug;
  } else if (staff.length === 1) selected.staff = staff[0]!.slug;

  const today = utcToZoned(ctx.now, settings.timezone).day;
  const window = Math.min(DAYS_SHOWN, settings.maxAdvanceDays + 1);
  const from = new Date(zonedToUtc(today, 0, settings.timezone).getTime() - DAY_MS);
  const to = new Date(from.getTime() + (window + 2) * DAY_MS);
  const bookings = await existing(ctx.db, ctx.project.id, from, to);
  const slotsOn = (day: string) => slotsForDay({ settings, service: info(service), resources: resourcesOf(chosen), bookings, day, now: ctx.now });
  out.days = Array.from({ length: window }, (_, i) => addDays(today, i)).map((day) => ({ date: day, available: slotsOn(day).length > 0 }));
  const day = query.date && out.days.some((d) => d.date === query.date && d.available) ? query.date : undefined;
  if (!day) return { ...out, step: 'date' };
  selected.date = day;
  const slots = slotsOn(day);
  out.slots = slots.map((s) => s.time);
  const slot = slots.find((s) => s.time === query.time);
  if (!slot) return { ...out, step: 'time' };
  selected.time = slot.time;
  const staffName = selected.staff && selected.staff !== 'any' ? chosen[0]?.title : undefined;
  return {
    ...out, step: override?.extra?.step === 'review' ? 'review' : 'details',
    summary: { service: service.title, staff: staffName, date: day, time: slot.time, duration: service.data.durationMin ?? 30, priceText: service.data.priceText || undefined },
  };
}

export async function bookingAction(ctx: SiteCtx, action: string, input: ActionInput): Promise<ActionResult> {
  const { form, sectionId, returnTo } = input;
  if (action !== 'book') return fail(sectionId, { message: 'Unknown action.' }, 409);
  const settings = parseSettings('booking', ctx.active.get('booking'));
  const v = formValues(form, ['name', 'email', 'phone', 'notes'], 1000);
  // The time trap applies to the first submit; the review page is freshly rendered, so confirming there may be quick.
  const token = checkFormToken(ctx, form.get('_token'), form.get('confirm') === '1' ? 0 : 2);
  if (token !== 'ok' || (form.get('website_url') ?? '') !== '') return fail(sectionId, { message: 'Please check your details and try again.', values: v });
  const errors: Record<string, string> = {};
  if (!v.name || v.name.length > 100) errors.name = 'Enter your name.';
  if (!EMAIL_RE.test(v.email ?? '')) errors.email = 'Enter a valid email address.';
  if (v.phone && !PHONE_RE.test(v.phone)) errors.phone = 'Enter a valid phone number.';
  if (form.get('edit') === '1') return { kind: 'render', status: 200, sectionId, state: { errors: {}, values: v } };
  if (Object.keys(errors).length) return fail(sectionId, { errors, values: v });
  if (form.get('confirm') !== '1') return { kind: 'render', status: 200, sectionId, state: { errors: {}, values: v }, extra: { step: 'review' } };
  if (!(await visitorLimit(ctx, 'booking', 6, 3600))) return fail(sectionId, { message: 'Too many bookings from this connection. Please contact us directly.', values: v }, 429);
  const limit = await checkModuleLimit(ctx.db, ctx.project.ownerId, ctx.project.id, 'booking_bookings_month');
  if (!limit.allowed) return fail(sectionId, { message: paused, values: v }, 409);

  const all = await services(ctx.db, ctx.project.id);
  const service = all.find((s) => s.slug === form.get('service'));
  const day = form.get('date') ?? '';
  const time = form.get('time') ?? '';
  if (!service) return fail(sectionId, { message: 'This service is no longer available. Please start again.', values: v }, 409);
  const staffAll = await staffFor(ctx.db, ctx.project.id, service);
  const wanted = form.get('staff') ?? 'any';
  const pool = wanted !== 'any' && staffAll.length ? staffAll.filter((p) => p.slug === wanted) : staffAll;
  if (staffAll.length && pool.length === 0) return fail(sectionId, { message: 'This person is no longer available. Please start again.', values: v }, 409);
  const reference = shortRef();
  const key = newVisitorToken();
  const created = await ctx.db.tx(async (t) => {
    // One booking decision at a time per website: the free-slot check and the insert cannot interleave with another request.
    await t.query('select pg_advisory_xact_lock(hashtext($1))', [`booking:${ctx.project.id}`]);
    const slot = (await daySlots(t, ctx.project.id, settings, service, pool, day, ctx.now)).find((s) => s.time === time);
    if (!slot) return null;
    const staffId = slot.staff[0] ?? null;
    const person = staffAll.find((p) => p.id === staffId);
    const end = new Date(slot.start.getTime() + (service.data.durationMin ?? 30) * 60_000);
    const status = settings.confirmation === 'auto' ? 'confirmed' : 'pending';
    await t.query(
      `insert into bookings (project_id, service_id, staff_id, service_title, staff_name, starts_at, ends_at, status, reference, access_hash, customer, notes)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12)`,
      [ctx.project.id, service.id, staffId, service.title, person?.title ?? null, slot.start, end, status, reference, hashToken(key), JSON.stringify({ name: v.name, email: v.email!.toLowerCase(), phone: v.phone ?? '' }), v.notes ?? ''],
    );
    return { start: slot.start, status, person: person?.title };
  });
  if (!created) return fail(sectionId, { message: 'Sorry, this time was just taken. Please choose another time.', values: v }, 409);
  const when = new Intl.DateTimeFormat(ctx.website.language, { dateStyle: 'full', timeStyle: 'short', timeZone: settings.timezone }).format(created.start);
  await notify(ctx, settings.notifyEmail || (await ownerEmail(ctx.db, ctx.project.id)), `New booking: ${service.title}`, [`${v.name} booked ${service.title}${created.person ? ` with ${created.person}` : ''} on ${when}.`, `Reference ${reference}. Status: ${created.status}.`, '', 'Open Saitlify to manage it.']);
  await notify(ctx, v.email!, created.status === 'confirmed' ? `Booking confirmed: ${service.title}` : `Booking request received: ${service.title}`, [`${service.title} on ${when}.`, `Reference ${reference}.`, created.status === 'pending' ? 'The business will confirm your appointment.' : '', settings.policy]);
  const q = new URLSearchParams({ booked: reference, k: key });
  return { kind: 'redirect', to: `${returnTo.path}?${q}#s-${sectionId}` };
}

/* ------------------------------------------------------------------ owner: appointments */

export type BookingRow = { id: string; reference: string; serviceTitle: string; staffName: string | null; staffId: string | null; serviceId: string | null; startsAt: string; endsAt: string; status: string; customer: { name: string; email: string; phone?: string }; notes: string; createdAt: string };
type Raw = { id: string; reference: string; service_title: string; staff_name: string | null; staff_id: string | null; service_id: string | null; starts_at: Date; ends_at: Date; status: string; customer: BookingRow['customer']; notes: string; created_at: Date };
const toRow = (r: Raw): BookingRow => ({ id: r.id, reference: r.reference, serviceTitle: r.service_title, staffName: r.staff_name, staffId: r.staff_id, serviceId: r.service_id, startsAt: new Date(r.starts_at).toISOString(), endsAt: new Date(r.ends_at).toISOString(), status: r.status, customer: r.customer, notes: r.notes, createdAt: new Date(r.created_at).toISOString() });

export async function listBookings(db: Db, ownerId: string, projectId: string, q: { from?: string; to?: string; status?: string; staff?: string; q?: string } = {}) {
  const project = await ownedProjectRow(db, ownerId, projectId);
  const settings = parseSettings('booking', (await db.query<{ settings: unknown }>(`select settings from project_modules where project_id = $1 and module_id = 'booking'`, [project.id]))[0]?.settings);
  const today = utcToZoned(new Date(), settings.timezone).day;
  const fromDay = q.from && /^\d{4}-\d{2}-\d{2}$/.test(q.from) ? q.from : today;
  const toDay = q.to && /^\d{4}-\d{2}-\d{2}$/.test(q.to) && q.to >= fromDay ? q.to : addDays(fromDay, 6);
  const w = ['project_id = $1', 'starts_at >= $2', 'starts_at < $3'];
  const p: unknown[] = [project.id, zonedToUtc(fromDay, 0, settings.timezone), zonedToUtc(addDays(toDay, 1), 0, settings.timezone)];
  if (q.status && ['pending', 'confirmed', 'cancelled', 'completed', 'no_show'].includes(q.status)) {
    p.push(q.status);
    w.push(`status = $${p.length}`);
  }
  if (q.staff && isUuid(q.staff)) {
    p.push(q.staff);
    w.push(`staff_id = $${p.length}`);
  }
  const text = (q.q ?? '').trim().slice(0, 100);
  if (text) {
    p.push(`%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
    w.push(`(reference ilike $${p.length} escape '\\' or customer->>'name' ilike $${p.length} escape '\\' or customer->>'email' ilike $${p.length} escape '\\')`);
  }
  const rows = await db.query<Raw>(`select * from bookings where ${w.join(' and ')} order by starts_at limit 500`, p);
  return { items: rows.map(toRow), from: fromDay, to: toDay, timezone: settings.timezone, pending: Number((await db.query<{ n: string }>(`select count(*) as n from bookings where project_id = $1 and status = 'pending' and starts_at > now()`, [project.id]))[0]?.n ?? 0) };
}

const NEXT: Record<string, string[]> = { pending: ['confirm', 'cancel', 'reschedule'], confirmed: ['cancel', 'complete', 'no_show', 'reschedule'], cancelled: [], completed: [], no_show: [] };
export const bookingActionsFor = (status: string) => NEXT[status] ?? [];

/** Free times for moving a booking (management "Reschedule" form). */
export async function rescheduleOptions(db: Db, ownerId: string, projectId: string, bookingId: string, day: string) {
  const project = await ownedProjectRow(db, ownerId, projectId);
  const settingsRaw = await assertModuleActive(db, project.id, 'booking');
  const settings = parseSettings('booking', settingsRaw);
  const b = (await db.query<Raw>('select * from bookings where id = $1 and project_id = $2', [bookingId, project.id]))[0];
  if (!b || !b.service_id) throw new ProjectError('not_found', 'Booking not found.');
  const service = (await services(db, project.id)).find((s) => s.id === b.service_id);
  if (!service) throw new ProjectError('invalid', 'This service is no longer active, so the booking cannot be moved.');
  const staff = await staffFor(db, project.id, service);
  const slots = await daySlots(db, project.id, { ...settings, minNoticeHours: 0 }, service, staff, day, new Date(), b.id);
  return slots.map((s) => ({ time: s.time, staff: s.staff.map((id) => ({ id, name: staff.find((p) => p.id === id)?.title ?? null })) }));
}

export async function updateBooking(db: Db, mailer: SiteCtx['mailer'], ownerId: string, projectId: string, id: string, input: { action?: unknown; date?: unknown; time?: unknown; staffId?: unknown }): Promise<BookingRow> {
  const project = await ownedProjectRow(db, ownerId, projectId);
  if (!isUuid(id)) throw new ProjectError('not_found', 'Booking not found.');
  const b = (await db.query<Raw>('select * from bookings where id = $1 and project_id = $2', [id, project.id]))[0];
  if (!b) throw new ProjectError('not_found', 'Booking not found.');
  const action = String(input.action ?? '');
  if (!bookingActionsFor(b.status).includes(action)) throw new ProjectError('invalid', `A ${b.status.replace('_', '-')} booking cannot be changed this way.`);
  const settings = parseSettings('booking', await assertModuleActive(db, project.id, 'booking'));
  if (action === 'reschedule') {
    const day = String(input.date ?? '');
    const time = String(input.time ?? '');
    const service = (await services(db, project.id)).find((s) => s.id === b.service_id);
    if (!service) throw new ProjectError('invalid', 'This service is no longer active, so the booking cannot be moved.');
    const staff = await staffFor(db, project.id, service);
    const moved = await db.tx(async (t) => {
      await t.query('select pg_advisory_xact_lock(hashtext($1))', [`booking:${project.id}`]);
      const pool = typeof input.staffId === 'string' && isUuid(input.staffId) ? staff.filter((p) => p.id === input.staffId) : staff;
      const slot = (await daySlots(t, project.id, { ...settings, minNoticeHours: 0 }, service, pool, day, new Date(), b.id)).find((s) => s.time === time);
      if (!slot) return false;
      const staffId = slot.staff.includes(b.staff_id) ? b.staff_id : (slot.staff[0] ?? null);
      await t.query(`update bookings set starts_at = $3, ends_at = $4, staff_id = $5, staff_name = $6, updated_at = now() where id = $1 and project_id = $2`, [id, project.id, slot.start, new Date(slot.start.getTime() + (service.data.durationMin ?? 30) * 60_000), staffId, staff.find((p) => p.id === staffId)?.title ?? null]);
      return true;
    });
    if (!moved) throw new ProjectError('conflict', 'That time is not free. Choose another time.');
  } else {
    const status = { confirm: 'confirmed', cancel: 'cancelled', complete: 'completed', no_show: 'no_show' }[action]!;
    const r = await db.query(`update bookings set status = $3, updated_at = now() where id = $1 and project_id = $2 and status = $4 returning id`, [id, project.id, status, b.status]);
    if (r.length !== 1) throw new ProjectError('conflict', 'This booking was changed somewhere else. Reload to see its current state.');
  }
  const after = toRow((await db.query<Raw>('select * from bookings where id = $1', [id]))[0]!);
  if (mailer.configured && ['confirm', 'cancel', 'reschedule'].includes(action)) {
    const when = new Intl.DateTimeFormat('en', { dateStyle: 'full', timeStyle: 'short', timeZone: settings.timezone }).format(new Date(after.startsAt));
    const text = action === 'confirm' ? `Your appointment (${after.serviceTitle}) on ${when} is confirmed.` : action === 'cancel' ? `Your appointment (${after.serviceTitle}) on ${when} was cancelled.` : `Your appointment (${after.serviceTitle}) was moved to ${when}.`;
    await mailer.send({ to: after.customer.email, subject: `Your appointment ${after.reference}`, text: `${text}\nReference ${after.reference}.` }).catch(() => undefined);
  }
  return after;
}
