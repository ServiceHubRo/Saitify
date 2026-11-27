'use client';

import type { Plan } from '@saitify/platform';
import { useState } from 'react';
import { call } from '../app/api-client';
import { Button, Notice } from '../app/primitives';
import { useToast } from '../app/toast';
import { LIMIT_LABELS, MODULES, MODULE_LIMIT_KEYS, type ModuleLimitKey } from '@saitify/platform/client';
import { money } from './format';

const FLAGS = ['advanced_editor', 'export', 'premium_modules', 'priority_publishing'] as const;
const LIMITS = [['projects', 'Projects'], ['published_sites', 'Published websites'], ['custom_domains', 'Custom domains']] as const;
type LimitKey = (typeof LIMITS)[number][0];

const input = 'mt-1 min-h-11 w-full rounded-xl border border-midnight/25 px-3 text-[16px] focus-visible:outline-2 focus-visible:outline-violet';

function PlanForm({ plan, isNew, onSaved, mode }: { plan: Plan | null; isNew: boolean; onSaved: (p: Plan) => void; mode: 'test' | 'live' | null }) {
  const toast = useToast();
  const [id, setId] = useState(plan?.id ?? '');
  const [name, setName] = useState(plan?.name ?? '');
  const [description, setDescription] = useState(plan?.description ?? '');
  const [features, setFeatures] = useState((plan?.features ?? []).join('\n'));
  const [priority, setPriority] = useState(String(plan?.priority ?? 10));
  const [support, setSupport] = useState(plan?.supportLevel ?? 'email');
  const [active, setActive] = useState(plan?.active ?? false);
  const [pub, setPub] = useState(plan?.public ?? false);
  const [recommended, setRecommended] = useState(plan?.recommended ?? false);
  const [limits, setLimits] = useState<Record<LimitKey, string>>({
    projects: plan?.limits.projects === null ? '' : String(plan?.limits.projects ?? 0),
    published_sites: plan?.limits.published_sites === null ? '' : String(plan?.limits.published_sites ?? 0),
    custom_domains: plan?.limits.custom_domains === null ? '' : String(plan?.limits.custom_domains ?? 0),
  });
  const [flags, setFlags] = useState<string[]>(plan?.limits.flags ?? []);
  // Modules (Phase 8). "All modules" is the default and what plans without a list mean; ticking specific modules limits the plan to them.
  const [allModules, setAllModules] = useState(plan?.limits.modules === undefined);
  const [modules, setModules] = useState<string[]>(plan?.limits.modules ?? []);
  const [modLimits, setModLimits] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const k of MODULE_LIMIT_KEYS) {
      const v = plan?.limits[k];
      out[k] = v === undefined ? 'default' : v === null ? '' : String(v);
    }
    return out;
  });
  const [pm, setPm] = useState(plan?.stripePriceMonthly ?? '');
  const [py, setPy] = useState(plan?.stripePriceYearly ?? '');
  const [prod, setProd] = useState(plan?.stripeProductId ?? '');
  const [busy, setBusy] = useState<'save' | 'sync' | null>(null);
  const [error, setError] = useState<{ message: string; field?: string } | null>(null);
  const free = plan?.id === 'free';

  function body() {
    const l: Record<string, unknown> = { flags };
    for (const [k] of LIMITS) l[k] = limits[k].trim() === '' ? null : Number(limits[k]);
    if (!allModules) l.modules = modules;
    // 'default' = not set (the platform fair-use cap applies); empty = unlimited; a number = that cap.
    for (const k of MODULE_LIMIT_KEYS) {
      const v = modLimits[k] ?? 'default';
      if (v !== 'default') l[k] = v.trim() === '' ? null : Number(v);
    }
    return {
      name, description, active, public: pub, recommended, priority: Number(priority), supportLevel: support,
      features: features.split('\n').map((f) => f.trim()).filter(Boolean), limits: l,
      ...(free ? {} : { stripeProductId: prod.trim() || null, stripePriceMonthly: pm.trim() || null, stripePriceYearly: py.trim() || null }),
    };
  }
  async function save() {
    setBusy('save');
    setError(null);
    const r = isNew ? await call<{ plan: Plan }>('/api/admin/plans', { body: { id, ...body() } }) : await call<{ plan: Plan }>(`/api/admin/plans/${plan!.id}`, { method: 'PATCH', body: body() });
    setBusy(null);
    if (!r.ok) return setError({ message: r.error.message, field: r.error.fields ? Object.keys(r.error.fields)[0] : undefined });
    toast('success', 'Plan saved. Existing subscriptions are unchanged.');
    onSaved(r.data.plan);
  }
  async function sync() {
    setBusy('sync');
    setError(null);
    const r = await call<{ plan: Plan }>(`/api/admin/plans/${plan!.id}/sync`, { body: {} });
    setBusy(null);
    if (!r.ok) return setError({ message: r.error.message });
    toast('success', 'Prices read from Stripe.');
    onSaved(r.data.plan);
  }
  const label = 'block text-[14px] font-medium text-midnight';
  return (
    <form onSubmit={(e) => { e.preventDefault(); void save(); }} className="grid gap-4" noValidate>
      {error ? <div role="alert"><Notice tone="error">{error.message}</Notice></div> : null}
      {isNew ? <label className={label}>Plan id (lowercase, permanent)<input className={input} value={id} onChange={(e) => setId(e.target.value.toLowerCase())} maxLength={32} autoCapitalize="none" /></label> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={label}>Name<input className={input} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} /></label>
        <label className={label}>Priority (higher = better plan)<input className={input} inputMode="numeric" value={priority} onChange={(e) => setPriority(e.target.value)} /></label>
      </div>
      <label className={label}>Description<textarea className={`${input} min-h-20 py-2`} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={400} /></label>
      <label className={label}>Features (one per line)<textarea className={`${input} min-h-24 py-2`} value={features} onChange={(e) => setFeatures(e.target.value)} /></label>
      <fieldset className="grid gap-3 sm:grid-cols-3">
        <legend className={label}>Limits (leave empty for unlimited)</legend>
        {LIMITS.map(([k, l]) => <label key={k} className="text-[14px]">{l}<input className={input} inputMode="numeric" placeholder="Unlimited" value={limits[k]} onChange={(e) => setLimits({ ...limits, [k]: e.target.value })} /></label>)}
      </fieldset>
      <details className="rounded-2xl border border-midnight/12 p-4" open={!allModules || MODULE_LIMIT_KEYS.some((k) => modLimits[k] !== 'default')}>
        <summary className="min-h-11 cursor-pointer text-[15px] font-semibold text-midnight">Modules (store, bookings, blog …)</summary>
        <div className="mt-3 grid gap-4">
          <fieldset>
            <legend className={label}>Modules included</legend>
            <label className="inline-flex min-h-11 items-center gap-2 text-[15px]"><input type="checkbox" className="size-5" checked={allModules} onChange={(e) => setAllModules(e.target.checked)} />All modules</label>
            {!allModules ? (
              <div className="flex flex-wrap gap-x-6">
                {MODULES.map((m) => <label key={m.id} className="inline-flex min-h-11 items-center gap-2 text-[15px]"><input type="checkbox" className="size-5" checked={modules.includes(m.id)} onChange={(e) => setModules(e.target.checked ? [...modules, m.id] : modules.filter((x) => x !== m.id))} />{m.name}</label>)}
              </div>
            ) : null}
          </fieldset>
          <fieldset className="grid gap-3 sm:grid-cols-2">
            <legend className={label}>Caps per website (“Fair use” = platform default, empty = unlimited)</legend>
            {MODULE_LIMIT_KEYS.map((k: ModuleLimitKey) => (
              <label key={k} className="text-[14px]">{LIMIT_LABELS[k][1]}
                <span className="mt-1 flex gap-2">
                  <select className={`${input} !mt-0 w-36 shrink-0`} aria-label={`${LIMIT_LABELS[k][1]} mode`} value={modLimits[k] === 'default' ? 'default' : modLimits[k] === '' ? 'unlimited' : 'cap'} onChange={(e) => setModLimits({ ...modLimits, [k]: e.target.value === 'default' ? 'default' : e.target.value === 'unlimited' ? '' : '100' })}>
                    <option value="default">Fair use</option><option value="cap">Cap</option><option value="unlimited">Unlimited</option>
                  </select>
                  {modLimits[k] !== 'default' && modLimits[k] !== '' ? <input className={`${input} !mt-0`} inputMode="numeric" aria-label={`${LIMIT_LABELS[k][1]} cap`} value={modLimits[k]} onChange={(e) => setModLimits({ ...modLimits, [k]: e.target.value })} /> : null}
                </span>
              </label>
            ))}
          </fieldset>
        </div>
      </details>
      <fieldset className="flex flex-wrap gap-x-6 gap-y-1">
        <legend className={label}>Feature flags</legend>
        {FLAGS.map((f) => <label key={f} className="inline-flex min-h-11 items-center gap-2 text-[15px]"><input type="checkbox" className="size-5" checked={flags.includes(f)} onChange={(e) => setFlags(e.target.checked ? [...flags, f] : flags.filter((x) => x !== f))} />{f.replace('_', ' ')}</label>)}
      </fieldset>
      <label className={label}>Support level<input className={input} value={support} onChange={(e) => setSupport(e.target.value)} maxLength={30} /></label>
      {!free ? (
        <fieldset className="grid gap-4 rounded-2xl bg-cloud p-4 sm:grid-cols-3">
          <legend className="px-1 text-[14px] font-semibold text-midnight">Stripe {mode ? `(${mode} mode)` : '(not configured)'}</legend>
          <label className="text-[14px]">Product id<input className={input} value={prod} onChange={(e) => setProd(e.target.value)} placeholder="prod_…" spellCheck={false} /></label>
          <label className="text-[14px]">Monthly price id<input className={input} value={pm} onChange={(e) => setPm(e.target.value)} placeholder="price_…" spellCheck={false} /></label>
          <label className="text-[14px]">Yearly price id<input className={input} value={py} onChange={(e) => setPy(e.target.value)} placeholder="price_…" spellCheck={false} /></label>
          {!isNew ? (
            <p className="text-[14px] text-midnight/75 sm:col-span-3">
              Amounts shown to customers: {plan?.currency && plan.monthlyAmount !== null ? `${money(plan.monthlyAmount, plan.currency)} / month` : 'monthly not synchronized'} · {plan?.currency && plan.yearlyAmount !== null ? `${money(plan.yearlyAmount, plan.currency)} / year` : 'yearly not synchronized'}. They are read from Stripe, never typed here.
            </p>
          ) : null}
        </fieldset>
      ) : null}
      <fieldset className="flex flex-wrap gap-x-6">
        <legend className="sr-only">Visibility</legend>
        {!free ? <label className="inline-flex min-h-11 items-center gap-2 text-[15px]"><input type="checkbox" className="size-5" checked={active} onChange={(e) => setActive(e.target.checked)} />Active (can be bought)</label> : null}
        {!free ? <label className="inline-flex min-h-11 items-center gap-2 text-[15px]"><input type="checkbox" className="size-5" checked={pub} onChange={(e) => setPub(e.target.checked)} />Public (shown on Pricing)</label> : null}
        <label className="inline-flex min-h-11 items-center gap-2 text-[15px]"><input type="checkbox" className="size-5" checked={recommended} onChange={(e) => setRecommended(e.target.checked)} />Recommended</label>
      </fieldset>
      <div className="flex flex-wrap gap-3">
        <Button type="submit" loading={busy === 'save'}>{isNew ? 'Create plan' : 'Save plan'}</Button>
        {!isNew && !free ? <Button type="button" variant="secondary" loading={busy === 'sync'} disabled={!mode} onClick={() => void sync()}>Read prices from Stripe</Button> : null}
      </div>
    </form>
  );
}

export function AdminPlans({ initial, mode }: { initial: Plan[]; mode: 'test' | 'live' | null }) {
  const [plans, setPlans] = useState(initial);
  const [adding, setAdding] = useState(false);
  const upsert = (p: Plan) => { setPlans((cur) => (cur.some((c) => c.id === p.id) ? cur.map((c) => (c.id === p.id ? p : c)) : [...cur, p]).sort((a, b) => a.priority - b.priority)); setAdding(false); };
  return (
    <div className="mt-8 grid max-w-4xl gap-4">
      <Notice tone="info">Changes here never alter existing subscriptions: customers keep the plan they bought. Prices are read from Stripe.</Notice>
      {plans.map((p) => (
        <details key={p.id} className="rounded-3xl border border-midnight/10 bg-white px-6 py-4" data-plan-admin={p.id}>
          <summary className="flex min-h-11 cursor-pointer flex-wrap items-center gap-x-3 text-[17px] font-semibold text-midnight focus-visible:outline-2 focus-visible:outline-violet">
            {p.name} <span className="text-sm font-normal text-midnight/60">{p.id}</span>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${p.active ? 'bg-emerald-100 text-emerald-950' : 'bg-slate-200 text-slate-800'}`}>{p.active ? 'Active' : 'Inactive'}</span>
            {p.public ? null : <span className="rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-semibold text-slate-800">Hidden</span>}
          </summary>
          <div className="mt-4 border-t border-midnight/10 pt-4"><PlanForm plan={p} isNew={false} onSaved={upsert} mode={mode} /></div>
        </details>
      ))}
      {adding ? (
        <div className="rounded-3xl border border-midnight/10 bg-white p-6"><h2 className="mb-4 text-lg font-semibold">New plan</h2><PlanForm plan={null} isNew onSaved={upsert} mode={mode} /></div>
      ) : (
        <div><Button variant="secondary" onClick={() => setAdding(true)}>Add a plan</Button></div>
      )}
    </div>
  );
}
