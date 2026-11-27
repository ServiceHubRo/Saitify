'use client';

import type { BillingStatus, BillingView, InvoiceView } from '@saitify/platform';
import { classifyChange } from '@saitify/platform/client';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { call } from '../app/api-client';
import { Dialog } from '../app/dialog';
import { Button, Notice } from '../app/primitives';
import { useToast } from '../app/toast';
import { dateLabel, LIMIT_LABEL, money, type Interval } from './format';
import { IntervalToggle, PlanCard } from './plan-card';

type Payload = { billing: BillingView; available: boolean; mode: 'test' | 'live' | null };
type Props = { initial: Payload; intent: { plan: string; interval: Interval } | null; checkout: 'success' | 'canceled' | null };
type Pending = { kind: 'cancel' } | { kind: 'upgrade'; planId: string; interval: Interval };

const STATUS_CHIP: Record<BillingStatus, { label: string; cls: string }> = {
  free: { label: 'Free plan', cls: 'bg-slate-200 text-slate-800' },
  active: { label: 'Active', cls: 'bg-emerald-100 text-emerald-950' },
  trialing: { label: 'Trial', cls: 'bg-blue-100 text-blue-950' },
  canceling: { label: 'Ends soon', cls: 'bg-amber-100 text-amber-950' },
  past_due: { label: 'Payment overdue', cls: 'bg-red-100 text-red-900' },
  canceled: { label: 'Canceled', cls: 'bg-slate-200 text-slate-800' },
  expired: { label: 'Payment overdue, access ended', cls: 'bg-red-100 text-red-900' },
  incomplete: { label: 'Not completed', cls: 'bg-slate-200 text-slate-800' },
  payment_pending: { label: 'Payment pending', cls: 'bg-amber-100 text-amber-950' },
};

const EVENT_LABEL: Record<string, string> = {
  subscription_started: 'Subscription started', subscription_changed: 'Subscription updated', checkout_started: 'Checkout started', checkout_completed: 'Checkout completed',
  payment_succeeded: 'Payment received', payment_failed: 'Payment failed', payment_action_required: 'Payment needs your confirmation', payment_method_added: 'Payment method added',
  plan_change_requested: 'Plan changed', cancellation_requested: 'Cancellation scheduled', reactivated: 'Subscription kept', canceled_immediately: 'Subscription canceled', duplicate_subscription_ignored: 'Duplicate subscription ignored',
};

export function BillingPanel({ initial, intent, checkout }: Props) {
  const toast = useToast();
  const [data, setData] = useState<Payload>(initial);
  const b = data.billing;
  const [interval, setInterval_] = useState<Interval>(intent?.interval ?? b.interval ?? 'month');
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<'idle' | 'waiting' | 'slow'>(checkout === 'success' && initial.billing.status === 'free' ? 'waiting' : 'idle');
  const [invoices, setInvoices] = useState<{ items: InvoiceView[]; total: number; page: number; pageSize: number } | null>(null);
  const [invPage, setInvPage] = useState(1);
  const [invBusy, setInvBusy] = useState(false);
  const polls = useRef(0);

  const refresh = useCallback(async () => {
    const r = await call<Payload>('/api/billing', { method: 'GET' });
    if (r.ok) setData(r.data);
    return r.ok ? r.data : null;
  }, []);

  // After Stripe sends the person back we wait for the verified webhook; the page only ever shows what the server has stored.
  useEffect(() => {
    if (confirming !== 'waiting') return;
    const t = window.setInterval(async () => {
      polls.current += 1;
      const d = await refresh();
      if (d && d.billing.status !== 'free' && d.billing.status !== 'payment_pending') {
        setConfirming('idle');
        toast('success', `Your ${d.billing.plan.name} plan is active.`);
      } else if (polls.current >= 15) setConfirming('slow');
    }, 3000);
    return () => window.clearInterval(t);
  }, [confirming, refresh, toast]);

  const loadInvoices = useCallback(async () => {
    setInvBusy(true);
    const r = await call<NonNullable<typeof invoices>>(`/api/billing/invoices?page=${invPage}&pageSize=6`, { method: 'GET' });
    setInvBusy(false);
    if (r.ok) setInvoices(r.data);
  }, [invPage]);
  useEffect(() => void loadInvoices(), [loadInvoices]);

  const paidLive = b.status === 'active' || b.status === 'trialing' || b.status === 'canceling';
  const current = b.plan;
  const currentPrice = b.interval && current.currency ? (b.interval === 'month' ? current.monthlyAmount : current.yearlyAmount) : null;
  const chip = STATUS_CHIP[b.status];

  async function go(key: string, url: string, body: Record<string, unknown>) {
    setBusy(key);
    setError(null);
    const r = await call<{ url?: string; kind?: string; message?: string }>(url, { body });
    if (!r.ok) {
      setBusy(null);
      setError(r.error.message);
      return null;
    }
    if (r.data.url) {
      window.location.assign(r.data.url); // Stripe Checkout or the Billing Portal
      return r.data;
    }
    setBusy(null);
    return r.data;
  }

  async function confirmPending() {
    if (!pending) return;
    if (pending.kind === 'cancel') {
      const r = await go('cancel', '/api/billing/cancel', { cancel: true });
      if (r) {
        toast('success', r.message ?? 'Your subscription will end at the end of the period.');
        setPending(null);
        await refresh();
      }
    } else {
      const r = await go('change', '/api/billing/change', { plan: pending.planId, interval: pending.interval });
      if (r && !r.url) {
        toast('success', r.message ?? 'Plan updated.');
        setPending(null);
        await refresh();
      }
    }
  }

  async function keep() {
    const r = await go('keep', '/api/billing/cancel', { cancel: false });
    if (r) {
      toast('success', r.message ?? 'Your subscription will renew as usual.');
      await refresh();
    }
  }

  const portalLabel = b.status === 'past_due' || b.status === 'expired' ? 'Update payment method' : 'Manage payment and invoices';
  const targetName = pending?.kind === 'upgrade' ? (b.plans.find((p) => p.id === pending.planId)?.name ?? '') : '';

  return (
    <div className="mt-8 grid gap-8">
      {checkout === 'canceled' ? <Notice tone="info">Checkout was canceled and you were not charged. You can choose a plan again whenever you like.</Notice> : null}
      {confirming === 'waiting' ? <div role="status"><Notice tone="info"><strong>Confirming your payment…</strong> This usually takes a few seconds. Your plan appears here once our payment provider confirms it.</Notice></div> : null}
      {confirming === 'slow' ? <Notice tone="warning"><strong>Still waiting for confirmation.</strong> Payments can take a minute to arrive. You will not be charged twice. Check back shortly, or reload this page.</Notice> : null}
      {b.status === 'past_due' ? (
        <Notice tone="warning"><strong>We could not take your last payment.</strong> Your {current.name} features stay available until {dateLabel(b.graceEndsAt)}. After that the Free plan limits apply. Nothing is deleted. Update your payment method to keep your plan.</Notice>
      ) : null}
      {b.status === 'expired' ? (
        <Notice tone="error"><strong>Your paid access has ended because payment was not received.</strong> Free plan limits apply to creating and publishing. Everything you built is still here, and every website that is online stays online. Update your payment method to restore your plan.</Notice>
      ) : null}
      {b.status === 'payment_pending' ? <Notice tone="warning">Your payment needs another step before the plan can start. Open the billing portal to finish it.</Notice> : null}
      {!data.available && b.plans.some((p) => p.id !== 'free') ? <Notice tone="info">Online payments are not available yet, so paid plans cannot be purchased right now. The Free plan works as usual.</Notice> : null}
      {data.mode === 'test' ? <Notice tone="warning">Test mode: no real money moves. Use Stripe test cards only.</Notice> : null}
      {error ? <div role="alert"><Notice tone="error">{error}</Notice></div> : null}

      <section aria-labelledby="current-plan" className="rounded-3xl border border-midnight/10 bg-white p-6 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="current-plan" className="text-xl font-semibold text-midnight">Your plan</h2>
          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${chip.cls}`} data-testid="billing-status">{chip.label}</span>
        </div>
        <p className="mt-3 text-2xl font-semibold tracking-tight text-midnight" data-testid="current-plan-name">{current.name}</p>
        <dl className="mt-3 grid gap-x-8 gap-y-2 text-[15px] sm:grid-cols-2">
          {currentPrice !== null && current.currency && b.interval ? <div><dt className="text-midnight/60">Price</dt><dd className="font-medium">{money(currentPrice, current.currency)} / {b.interval === 'month' ? 'month' : 'year'}</dd></div> : null}
          {b.renewsAt ? <div><dt className="text-midnight/60">Next payment</dt><dd className="font-medium">{dateLabel(b.renewsAt)}</dd></div> : null}
          {b.endsAt ? <div><dt className="text-midnight/60">Paid access ends</dt><dd className="font-medium">{dateLabel(b.endsAt)}</dd></div> : null}
          {b.status === 'free' ? <div className="sm:col-span-2"><dt className="sr-only">Details</dt><dd className="text-midnight/75">No payment needed. Upgrade below when you need more.</dd></div> : null}
        </dl>
        {b.status === 'canceling' ? <p className="mt-3 text-[15px] text-midnight/80">Your subscription will not renew. You keep {current.name} until {dateLabel(b.endsAt)}, then the Free plan applies. Your projects and websites are not deleted.</p> : null}
        <div className="mt-5 flex flex-wrap gap-3">
          {b.hasBillingAccount ? <Button variant={b.status === 'past_due' || b.status === 'expired' || b.status === 'payment_pending' ? 'primary' : 'secondary'} loading={busy === 'portal'} disabled={!data.available} onClick={() => void go('portal', '/api/billing/portal', {})}>{portalLabel}</Button> : null}
          {b.status === 'active' || b.status === 'trialing' ? <Button variant="ghost" onClick={() => { setError(null); setPending({ kind: 'cancel' }); }}>Cancel subscription</Button> : null}
          {b.status === 'canceling' ? <Button loading={busy === 'keep'} onClick={() => void keep()}>Keep my subscription</Button> : null}
        </div>
      </section>

      <section aria-labelledby="usage-title" className="rounded-3xl border border-midnight/10 bg-white p-6 sm:p-7">
        <h2 id="usage-title" className="text-xl font-semibold text-midnight">Usage</h2>
        <ul className="mt-4 grid gap-5 sm:grid-cols-2">
          {(Object.keys(LIMIT_LABEL) as (keyof typeof LIMIT_LABEL)[]).filter((k) => b.usage[k].limit !== 0 || b.usage[k].used > 0).map((k) => {
            const u = b.usage[k];
            const pct = u.limit === null ? 0 : u.limit === 0 ? 100 : Math.min(100, Math.round((u.used / u.limit) * 100));
            const full = u.limit !== null && u.used >= u.limit;
            return (
              <li key={k} data-usage={k}>
                <div className="flex items-baseline justify-between gap-3 text-[15px]">
                  <span className="font-medium text-midnight">{LIMIT_LABEL[k]}</span>
                  <span className={full ? 'font-semibold text-amber-900' : 'text-midnight/75'}>{u.used} of {u.limit === null ? 'unlimited' : u.limit}</span>
                </div>
                <div role="progressbar" aria-label={`${LIMIT_LABEL[k]} used`} aria-valuemin={0} aria-valuemax={u.limit ?? undefined} aria-valuenow={u.used} className="mt-2 h-2 overflow-hidden rounded-full bg-midnight/10">
                  <div className={`h-full rounded-full ${full ? 'bg-amber-500' : 'bg-violet'}`} style={{ width: `${u.limit === null ? Math.min(100, u.used * 4) : pct}%` }} />
                </div>
                {full ? <p className="mt-1.5 text-sm text-midnight/70">You have reached this limit. Nothing is removed; you just cannot add more until you free one up or change plan.</p> : null}
              </li>
            );
          })}
        </ul>
      </section>

      {b.plans.length > 1 ? (
        <section aria-labelledby="plans-title">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="plans-title" className="text-xl font-semibold text-midnight">Plans</h2>
            {b.plans.some((p) => p.canBuyMonthly) && b.plans.some((p) => p.canBuyYearly) ? <IntervalToggle value={interval} onChange={setInterval_} /> : null}
          </div>
          {intent && b.plans.some((p) => p.id === intent.plan && p.id !== b.plan.id) && b.status === 'free' ? <div className="mt-3"><Notice tone="info">You chose <strong>{b.plans.find((p) => p.id === intent.plan)?.name}</strong>. Review it below and continue to payment.</Notice></div> : null}
          <div className="mt-4 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {b.plans.map((p) => {
              const isCurrent = p.id === b.plan.id && (p.id === 'free' || b.interval === interval);
              const buyable = interval === 'month' ? p.canBuyMonthly : p.canBuyYearly;
              let action: React.ReactNode;
              if (p.id === 'free') {
                action = b.status === 'free' ? <p className="text-center text-sm font-medium text-midnight/70">This is your plan</p> : paidLive ? <p className="text-sm text-midnight/65">To return to Free, cancel your subscription above. You keep your paid features until the period ends.</p> : null;
              } else if (isCurrent && paidLive) {
                action = <p className="text-center text-sm font-medium text-midnight/70">This is your plan</p>;
              } else if (!buyable || !data.available) {
                action = <p className="rounded-xl bg-cloud px-4 py-3 text-center text-sm text-midnight/70">{!data.available ? 'Purchases open soon.' : 'Not available for this billing period.'}</p>;
              } else if (paidLive && b.interval) {
                const kind = classifyChange({ planId: b.plan.id, priority: b.plan.priority, interval: b.interval }, { planId: p.id, priority: p.priority, interval });
                action = kind === 'upgrade'
                  ? <Button className="w-full" loading={busy === 'change'} onClick={() => { setError(null); setPending({ kind: 'upgrade', planId: p.id, interval }); }}>Upgrade to {p.name}</Button>
                  : <Button variant="secondary" className="w-full" loading={busy === `portal-${p.id}`} onClick={() => void go(`portal-${p.id}`, '/api/billing/change', { plan: p.id, interval })}>Change in billing portal</Button>;
              } else if (b.status === 'past_due') {
                action = <p className="rounded-xl bg-cloud px-4 py-3 text-center text-sm text-midnight/70">Resolve your payment first.</p>;
              } else {
                action = <Button className="w-full" loading={busy === `buy-${p.id}`} onClick={() => void go(`buy-${p.id}`, '/api/billing/checkout', { plan: p.id, interval })}>Continue to payment</Button>;
              }
              return (
                <div key={p.id} className={intent?.plan === p.id && !isCurrent ? 'rounded-3xl ring-2 ring-violet ring-offset-2' : ''}>
                  <PlanCard plan={p} interval={interval} badge={isCurrent ? 'Current' : undefined}>{action}</PlanCard>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      <section aria-labelledby="invoices-title" className="rounded-3xl border border-midnight/10 bg-white p-6 sm:p-7">
        <h2 id="invoices-title" className="text-xl font-semibold text-midnight">Billing history</h2>
        {invoices && invoices.items.length === 0 ? <p className="mt-3 text-[15px] text-midnight/70">{b.hasBillingAccount ? 'No invoices yet. They appear here after your first payment.' : 'No invoices. You are on the Free plan, so nothing has been billed.'}</p> : null}
        {invoices && invoices.items.length > 0 ? (
          <ul className="mt-3 divide-y divide-midnight/10" aria-busy={invBusy}>
            {invoices.items.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3 text-[15px]">
                <div className="min-w-0">
                  <p className="font-medium text-midnight">{i.number ?? 'Invoice'}<span className="ml-2 font-normal text-midnight/60">{dateLabel(i.date)}</span></p>
                  {i.periodStart && i.periodEnd ? <p className="text-sm text-midnight/65">Period: {dateLabel(i.periodStart)} to {dateLabel(i.periodEnd)}</p> : null}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-medium">{money(i.status === 'paid' ? i.amountPaid : i.amountDue, i.currency)}</span>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${i.status === 'paid' ? 'bg-emerald-100 text-emerald-950' : i.status === 'open' ? 'bg-amber-100 text-amber-950' : 'bg-slate-200 text-slate-800'}`}>{i.status === 'paid' ? 'Paid' : i.status === 'open' ? 'Unpaid' : i.status === 'void' ? 'Void' : i.status === 'uncollectible' ? 'Uncollectible' : 'Draft'}</span>
                  {i.viewUrl ? <a href={i.viewUrl} target="_blank" rel="noreferrer noopener" className="inline-flex min-h-11 items-center font-semibold text-violet underline">View<span className="sr-only"> invoice {i.number}</span></a> : null}
                  {i.pdfUrl ? <a href={i.pdfUrl} target="_blank" rel="noreferrer noopener" className="inline-flex min-h-11 items-center font-semibold text-violet underline">PDF<span className="sr-only"> for invoice {i.number}</span></a> : null}
                </div>
              </li>
            ))}
          </ul>
        ) : null}
        {invoices && invoices.total > invoices.pageSize ? (
          <div className="mt-2 flex items-center justify-between text-[14px]">
            <Button variant="ghost" disabled={invPage <= 1 || invBusy} onClick={() => setInvPage((p) => p - 1)}>Previous</Button>
            <span className="text-midnight/70">Page {invoices.page} of {Math.ceil(invoices.total / invoices.pageSize)}</span>
            <Button variant="ghost" disabled={invPage >= Math.ceil(invoices.total / invoices.pageSize) || invBusy} onClick={() => setInvPage((p) => p + 1)}>Next</Button>
          </div>
        ) : null}
      </section>

      {b.history.length > 0 ? (
        <details className="rounded-3xl border border-midnight/10 bg-white px-6 py-4 sm:px-7">
          <summary className="min-h-11 cursor-pointer text-[16px] font-semibold text-midnight focus-visible:outline-2 focus-visible:outline-violet">Subscription activity</summary>
          <ul className="mt-2 divide-y divide-midnight/10 text-[15px]">
            {b.history.map((h, i) => (
              <li key={`${h.at}-${i}`} className="flex flex-wrap justify-between gap-2 py-2.5">
                <span>{EVENT_LABEL[h.event] ?? h.event.replace(/_/g, ' ')}</span>
                <time dateTime={h.at} className="text-midnight/65">{dateLabel(h.at)}</time>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <p className="text-sm text-midnight/65">Payments are handled securely by Stripe; Saitlify never sees your card. Questions about billing? <Link href="/contact?topic=billing" className="font-semibold text-violet hover:underline">Contact us</Link>.</p>

      <Dialog open={pending !== null} onClose={() => (busy ? undefined : setPending(null))} title={pending?.kind === 'cancel' ? 'Cancel your subscription?' : `Upgrade to ${targetName}?`}>
        {pending?.kind === 'cancel' ? (
          <p className="mt-3 text-[15px] leading-relaxed text-midnight/80">Your subscription will not renew. <strong>You keep {current.name} until {dateLabel(b.renewsAt ?? b.endsAt ?? null) || 'the end of the period you paid for'}</strong>, then the Free plan limits apply. Your projects and websites are not deleted, and websites that are online stay online.</p>
        ) : pending?.kind === 'upgrade' ? (
          <p className="mt-3 text-[15px] leading-relaxed text-midnight/80">The upgrade starts <strong>now</strong>. Stripe charges only the prorated difference for the rest of your current period, and your new price applies from your next renewal.</p>
        ) : null}
        {error ? <div className="mt-3" role="alert"><Notice tone="error">{error}</Notice></div> : null}
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="secondary" disabled={busy !== null} onClick={() => setPending(null)}>{pending?.kind === 'cancel' ? 'Keep my plan' : 'Not now'}</Button>
          <Button variant={pending?.kind === 'cancel' ? 'danger' : 'primary'} loading={busy === 'cancel' || busy === 'change'} onClick={() => void confirmPending()}>{pending?.kind === 'cancel' ? 'Cancel at period end' : 'Confirm upgrade'}</Button>
        </div>
      </Dialog>
    </div>
  );
}
