import type { Db } from '../db/types';
import { recordHistory, syncSubscriptionIn } from './service';
import type { StripeSubscriptionView } from './stripe-api';

export type StripeEventLike = { id: string; type: string; created: number; data: { object: unknown } };
export type WebhookOutcome = 'processed' | 'duplicate' | 'ignored';

type Obj = Record<string, unknown>;
const o = (v: unknown): Obj => (typeof v === 'object' && v !== null ? (v as Obj) : {});
const s = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
const n = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const idOf = (v: unknown): string | null => s(v) ?? s(o(v).id);

/** Events we act on. Everything else is acknowledged and recorded, never processed. */
export const HANDLED_EVENTS = [
  'checkout.session.completed', 'customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted',
  'invoice.paid', 'invoice.payment_failed', 'invoice.payment_action_required', 'invoice.finalized', 'invoice.updated', 'payment_method.attached',
] as const;

/** Reads a Stripe subscription object (webhook payload) into the shape the synchronizer uses. Period dates may live on the item (newer API versions). */
export function subscriptionFromObject(raw: unknown): StripeSubscriptionView | null {
  const sub = o(raw);
  const id = s(sub.id);
  const customerId = idOf(sub.customer);
  const status = s(sub.status);
  if (!id || !customerId || !status) return null;
  const item = o(o(sub.items).data instanceof Array ? (o(sub.items).data as unknown[])[0] : undefined);
  return {
    id, status, customerId, priceId: s(o(item.price).id), itemId: s(item.id), cancelAtPeriodEnd: sub.cancel_at_period_end === true, canceledAt: n(sub.canceled_at),
    currentPeriodStart: n(sub.current_period_start) ?? n(item.current_period_start), currentPeriodEnd: n(sub.current_period_end) ?? n(item.current_period_end), trialEnd: n(sub.trial_end),
  };
}

/** Which account a Stripe customer belongs to. The customer row is written by us before checkout; metadata is only a verified fallback. */
async function userForCustomer(db: Db, customerId: string, metadataUserId: string | null): Promise<string | null> {
  const row = (await db.query<{ user_id: string }>('select user_id from stripe_customers where stripe_customer_id = $1', [customerId]))[0];
  if (row) return row.user_id;
  if (!metadataUserId || !/^[0-9a-f-]{36}$/i.test(metadataUserId)) return null;
  const u = (await db.query<{ id: string }>('select id from users where id = $1', [metadataUserId]))[0];
  if (!u) return null;
  const has = (await db.query('select 1 from stripe_customers where user_id = $1', [u.id]))[0];
  if (has) return null; // this account is already tied to a different Stripe customer: refuse to relink from a payload
  await db.query('insert into stripe_customers (user_id, stripe_customer_id) values ($1,$2) on conflict do nothing', [u.id, customerId]);
  return u.id;
}

async function upsertInvoice(db: Db, userId: string, inv: Obj, eventCreated: number): Promise<void> {
  const id = s(inv.id);
  const created = n(inv.created);
  if (!id || created === null) return;
  const line = o(o(inv.lines).data instanceof Array ? (o(inv.lines).data as unknown[])[0] : undefined);
  const period = o(line.period);
  const ps = n(period.start) ?? n(inv.period_start);
  const pe = n(period.end) ?? n(inv.period_end);
  await db.query(
    `insert into invoices (stripe_invoice_id, user_id, number, status, currency, amount_due, amount_paid, period_start, period_end, hosted_invoice_url, invoice_pdf, stripe_created, last_event_created)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     on conflict (stripe_invoice_id) do update set number=excluded.number, status=excluded.status, currency=excluded.currency, amount_due=excluded.amount_due, amount_paid=excluded.amount_paid,
       period_start=excluded.period_start, period_end=excluded.period_end, hosted_invoice_url=excluded.hosted_invoice_url, invoice_pdf=excluded.invoice_pdf, last_event_created=excluded.last_event_created, updated_at=now()
     where invoices.last_event_created <= excluded.last_event_created`,
    [id, userId, s(inv.number), s(inv.status) ?? 'draft', (s(inv.currency) ?? 'usd').toLowerCase(), n(inv.amount_due) ?? 0, n(inv.amount_paid) ?? 0,
     ps === null ? null : new Date(ps * 1000), pe === null ? null : new Date(pe * 1000), s(inv.hosted_invoice_url), s(inv.invoice_pdf), new Date(created * 1000), eventCreated],
  );
}

async function handle(db: Db, ev: StripeEventLike): Promise<WebhookOutcome> {
  const obj = o(ev.data.object);
  switch (ev.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const v = subscriptionFromObject(obj);
      if (!v) return 'ignored';
      const userId = await userForCustomer(db, v.customerId, s(o(obj.metadata).user_id));
      if (!userId) return 'ignored';
      const r = await syncSubscriptionIn(db, userId, ev.type === 'customer.subscription.deleted' ? { ...v, status: 'canceled' } : v, { eventCreated: ev.created, stripeEventId: ev.id });
      return r.result === 'applied' ? 'processed' : 'ignored';
    }
    case 'checkout.session.completed': {
      if (obj.mode !== 'subscription') return 'ignored';
      const customerId = idOf(obj.customer);
      const ref = s(obj.client_reference_id) ?? s(o(obj.metadata).user_id);
      if (!customerId) return 'ignored';
      const userId = await userForCustomer(db, customerId, ref);
      if (!userId) return 'ignored';
      // This does not grant anything: the plan comes from the subscription events, which Stripe also sends.
      await recordHistory(db, userId, 'checkout_completed', { stripeEventId: ev.id });
      return 'processed';
    }
    case 'invoice.paid':
    case 'invoice.payment_failed':
    case 'invoice.payment_action_required':
    case 'invoice.finalized':
    case 'invoice.updated': {
      const customerId = idOf(obj.customer);
      if (!customerId) return 'ignored';
      const userId = await userForCustomer(db, customerId, null);
      if (!userId) return 'ignored';
      await upsertInvoice(db, userId, obj, ev.created);
      if (ev.type === 'invoice.paid') await recordHistory(db, userId, 'payment_succeeded', { stripeEventId: ev.id });
      if (ev.type === 'invoice.payment_failed') await recordHistory(db, userId, 'payment_failed', { stripeEventId: ev.id });
      if (ev.type === 'invoice.payment_action_required') await recordHistory(db, userId, 'payment_action_required', { stripeEventId: ev.id });
      return 'processed';
    }
    case 'payment_method.attached': {
      const customerId = idOf(obj.customer);
      const userId = customerId ? await userForCustomer(db, customerId, null) : null;
      if (!userId) return 'ignored';
      await recordHistory(db, userId, 'payment_method_added', { stripeEventId: ev.id });
      return 'processed';
    }
    default:
      return 'ignored';
  }
}

const STALE_PROCESSING_MS = 2 * 60_000;

/**
 * Processes one VERIFIED Stripe event exactly once.
 *  - The event id is the primary key of `billing_events`, so duplicates and concurrent deliveries cannot both run.
 *  - A failure rolls the work back and marks the event `failed`; Stripe's retry runs it again.
 *  - Handlers use stored state plus the event timestamp, so events arriving out of order cannot move state backwards.
 */
export async function processWebhookEvent(db: Db, ev: StripeEventLike): Promise<WebhookOutcome> {
  try {
    return await db.tx(async (t) => {
      const ins = await t.query<{ stripe_event_id: string }>('insert into billing_events (stripe_event_id, type) values ($1,$2) on conflict (stripe_event_id) do nothing returning stripe_event_id', [ev.id, ev.type]);
      if (ins.length === 0) {
        const prev = (await t.query<{ status: string; received_at: Date }>('select status, received_at from billing_events where stripe_event_id = $1 for update', [ev.id]))[0];
        if (prev && (prev.status === 'processed' || prev.status === 'ignored')) return 'duplicate' as const;
        if (prev?.status === 'processing' && Date.now() - prev.received_at.getTime() < STALE_PROCESSING_MS) throw new Error('event is being processed');
        await t.query("update billing_events set status = 'processing', error = null, received_at = now() where stripe_event_id = $1", [ev.id]);
      }
      const outcome = await handle(t, ev);
      await t.query('update billing_events set status = $2, processed_at = now() where stripe_event_id = $1', [ev.id, outcome === 'processed' ? 'processed' : 'ignored']);
      return outcome;
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message.slice(0, 200) : 'error';
    await db.query(
      `insert into billing_events (stripe_event_id, type, status, error) values ($1,$2,'failed',$3)
       on conflict (stripe_event_id) do update set status = 'failed', error = excluded.error where billing_events.status not in ('processed','ignored')`,
      [ev.id, ev.type, msg],
    ).catch(() => undefined);
    console.error('[saitify] billing webhook failed:', ev.type, e instanceof Error ? e.name : 'unknown');
    throw e;
  }
}
