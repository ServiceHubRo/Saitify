'use client';

import { useCallback, useEffect, useState } from 'react';
import { call } from '../app/api-client';
import { Dialog } from '../app/dialog';
import { Button, Notice } from '../app/primitives';
import { useToast } from '../app/toast';
import { base, Empty, money, Pager, smallInput, StatusChip, statusLabel, when } from './shared';

type Summary = { id: string; number: number; status: string; paymentStatus: string; paymentMethod: string; currency: string; total: number; customer: { name: string; email: string; phone?: string }; itemCount: number; createdAt: string };
type Detail = Summary & { subtotal: number; shipping: number; delivery: Record<string, string> | null; notes: string; items: { title: string; variantTitle: string | null; sku: string | null; unit: number; quantity: number; line: number }[]; nextStatuses: string[]; nextPayment: string[] };
const ACTION: Record<string, string> = { processing: 'Mark as processing', shipped: 'Mark as shipped', completed: 'Mark as completed', canceled: 'Cancel order', paid: 'Mark as paid', refunded: 'Mark as refunded' };

export function Orders({ projectId }: { projectId: string }) {
  const toast = useToast();
  const [data, setData] = useState<{ items: Summary[]; total: number; page: number; pageSize: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState({ status: '', payment: '', q: '', page: 1 });
  const [open, setOpen] = useState<Detail | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const p = new URLSearchParams({ page: String(f.page) });
    if (f.status) p.set('status', f.status);
    if (f.payment) p.set('payment', f.payment);
    if (f.q.trim()) p.set('q', f.q.trim());
    const r = await call<NonNullable<typeof data>>(`${base(projectId)}/store/orders?${p}`, { method: 'GET' });
    if (r.ok) setData(r.data);
    else setError(r.error.message);
  }, [projectId, f]);
  useEffect(() => {
    const t = window.setTimeout(() => void load(), f.q ? 250 : 0);
    return () => window.clearTimeout(t);
  }, [load, f.q]);

  async function show(id: string) {
    setActionError(null);
    const r = await call<{ order: Detail }>(`${base(projectId)}/store/orders/${id}`, { method: 'GET' });
    if (r.ok) setOpen(r.data.order);
    else toast('error', r.error.message);
  }
  async function change(body: Record<string, string>) {
    if (!open) return;
    setBusy(true);
    setActionError(null);
    const r = await call<{ order: Detail }>(`${base(projectId)}/store/orders/${open.id}`, { method: 'PATCH', body });
    setBusy(false);
    if (r.ok) {
      setOpen(r.data.order);
      toast('success', `Order #${r.data.order.number} updated.`);
      void load();
    } else setActionError(r.error.message);
  }

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <input type="search" aria-label="Search orders" placeholder="Order number, name or email…" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value, page: 1 })} className={`${smallInput} w-full sm:max-w-xs`} />
        <select aria-label="Order status" className={smallInput} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value, page: 1 })}>
          <option value="">All statuses</option>
          {['pending', 'processing', 'shipped', 'completed', 'canceled'].map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
        </select>
        <select aria-label="Payment" className={smallInput} value={f.payment} onChange={(e) => setF({ ...f, payment: e.target.value, page: 1 })}>
          <option value="">Any payment</option>
          <option value="awaiting">Awaiting payment</option><option value="paid">Paid</option><option value="refunded">Refunded</option>
        </select>
      </div>
      {error ? <Notice tone="error" className="mt-4">{error}</Notice> : null}
      <div className="mt-4">
        {!data ? <p role="status" className="py-8 text-center text-midnight/60">Loading…</p> : data.items.length === 0 ? (
          <Empty title={f.q || f.status || f.payment ? 'No orders match.' : 'No orders yet.'}>Orders placed on your published website appear here.</Empty>
        ) : (
          <ul className="divide-y divide-midnight/10 overflow-hidden rounded-2xl border border-midnight/10 bg-white">
            {data.items.map((o) => (
              <li key={o.id}>
                <button type="button" onClick={() => void show(o.id)} className="flex w-full flex-col gap-1.5 p-4 text-left hover:bg-cloud/60 focus-visible:outline-2 focus-visible:outline-violet sm:flex-row sm:items-center sm:gap-4">
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-midnight">#{o.number} · {o.customer.name}</span>
                    <span className="block truncate text-sm text-midnight/65">{when(o.createdAt)} · {o.itemCount} {o.itemCount === 1 ? 'item' : 'items'} · {o.paymentMethod}</span>
                  </span>
                  <span className="flex flex-wrap items-center gap-2"><StatusChip status={o.status} /><StatusChip status={o.paymentStatus} /><span className="font-semibold">{money(o.total, o.currency)}</span></span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {data ? <Pager page={data.page} total={data.total} pageSize={data.pageSize} onPage={(n) => setF({ ...f, page: n })} /> : null}
      </div>
      <Dialog open={open !== null} onClose={() => setOpen(null)} title={open ? `Order #${open.number}` : 'Order'} size="lg">
        {open ? (
          <div className="mt-4 space-y-5 text-[15px]">
            <p className="flex flex-wrap items-center gap-2"><StatusChip status={open.status} /><StatusChip status={open.paymentStatus} /><span className="text-midnight/65">{when(open.createdAt)}</span></p>
            {actionError ? <Notice tone="error">{actionError}</Notice> : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <div><p className="text-sm font-semibold text-midnight/60">Customer</p><p>{open.customer.name}</p><p className="[overflow-wrap:anywhere]"><a className="text-violet underline" href={`mailto:${open.customer.email}`}>{open.customer.email}</a></p>{open.customer.phone ? <p>{open.customer.phone}</p> : null}</div>
              <div><p className="text-sm font-semibold text-midnight/60">Delivery</p>{open.delivery ? <p className="whitespace-pre-line">{[open.delivery.address, [open.delivery.postcode, open.delivery.city].filter(Boolean).join(' '), open.delivery.country].filter(Boolean).join('\n')}</p> : <p>No delivery address</p>}<p className="mt-1 text-midnight/70">Payment: {open.paymentMethod}</p></div>
            </div>
            {open.notes ? <p className="rounded-xl bg-cloud p-3"><span className="font-semibold">Notes: </span>{open.notes}</p> : null}
            <table className="w-full text-left text-[15px]">
              <thead className="text-sm text-midnight/60"><tr><th className="py-1.5 font-semibold">Item</th><th className="py-1.5 text-right font-semibold">Qty</th><th className="py-1.5 text-right font-semibold">Total</th></tr></thead>
              <tbody className="divide-y divide-midnight/10">
                {open.items.map((i, k) => <tr key={k}><td className="py-2 pr-2">{i.title}{i.variantTitle ? <span className="text-midnight/65"> · {i.variantTitle}</span> : null}{i.sku ? <span className="block text-xs text-midnight/55">SKU {i.sku}</span> : null}</td><td className="py-2 text-right">{i.quantity}</td><td className="py-2 text-right">{money(i.line, open.currency)}</td></tr>)}
              </tbody>
              <tfoot className="text-midnight/80">
                <tr><td colSpan={2} className="pt-2">Subtotal</td><td className="pt-2 text-right">{money(open.subtotal, open.currency)}</td></tr>
                <tr><td colSpan={2}>Delivery</td><td className="text-right">{money(open.shipping, open.currency)}</td></tr>
                <tr className="font-semibold text-midnight"><td colSpan={2} className="pt-1">Total</td><td className="pt-1 text-right">{money(open.total, open.currency)}</td></tr>
              </tfoot>
            </table>
            {open.nextStatuses.length || open.nextPayment.length ? (
              <div className="flex flex-wrap gap-2 border-t border-midnight/10 pt-4">
                {open.nextPayment.map((p) => <Button key={p} variant="primary" loading={busy} onClick={() => void change({ paymentStatus: p })}>{ACTION[p]}</Button>)}
                {open.nextStatuses.map((s) => <Button key={s} variant={s === 'canceled' ? 'danger' : 'secondary'} loading={busy} onClick={() => { if (s !== 'canceled' || window.confirm('Cancel this order? Items that were not shipped go back into stock.')) void change({ status: s }); }}>{ACTION[s]}</Button>)}
              </div>
            ) : <p className="text-midnight/65">This order is closed.</p>}
            <p className="text-sm text-midnight/60">Saitlify does not take card payments for your store. Mark an order as paid when you have received the money.</p>
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}
