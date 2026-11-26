'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { call } from '../app/api-client';
import { Dialog } from '../app/dialog';
import { Button, Notice } from '../app/primitives';
import { Icon } from './icons';

/* Shapes returned by the publishing API (kept in sync with packages/platform/src/publishing/service.ts). */
export type FixTarget = { kind: 'page' | 'section' | 'site' | 'seo' | 'menu'; pageId?: string; sectionId?: string };
type Finding = { code: string; message: string; where?: string; fix?: FixTarget };
export type DeploymentLite = { id: string; version: number; status: string; reachability: 'unchecked' | 'verified' | 'unreachable'; failure: { stage: string; message: string } | null; finishedAt: string | null };
export type SiteStateLite = {
  status: 'draft' | 'publishing' | 'published' | 'unpublished';
  subdomain: string | null;
  url: string | null;
  active: DeploymentLite | null;
  lastAttempt: DeploymentLite | null;
  hasUnpublishedChanges: boolean;
  inFlight: boolean;
  subdomainLocked: boolean;
};
type Preflight = {
  report: { blocking: Finding[]; warnings: Finding[]; passed: string[]; canPublish: boolean };
  suggestedSubdomain: string;
  state: SiteStateLite;
  address: { prefix: string; suffix: string };
};
type Availability = { ok: true; value: string; own: boolean } | { ok: false; code: string; message: string; suggestions: string[] };
type Phase = 'loading' | 'ready' | 'publishing' | 'done' | 'failed' | 'error';
type Reach = 'idle' | 'checking' | 'verified' | 'unreachable';

export type PublishFlush = { flushNow: () => Promise<void>; isSaved: () => boolean };

const plural = (n: number, a: string, b: string) => `${n} ${n === 1 ? a : b}`;

function Collapsible({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <details className="group rounded-2xl border border-midnight/10">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-2xl px-4 text-[14.5px] font-semibold focus-visible:outline-2 focus-visible:outline-violet">
        <span>{title} <span className="font-normal text-midnight/60">({count})</span></span>
        <Icon name="down" className="size-4 transition group-open:rotate-180" />
      </summary>
      <div className="border-t border-midnight/10 px-4 py-3">{children}</div>
    </details>
  );
}

/**
 * The one place a website is published. It checks the saved website, lets the person choose an address, publishes, and then
 * reports what actually happened. Everything that is fixed is fixed in the editor itself: each problem links there.
 */
export function PublishDialog({
  open, onClose, projectId, flush, saveBlocked, onFix, onState,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  flush: PublishFlush;
  /** The editor cannot save right now (conflict, signed out, …): publishing would use an outdated website. */
  saveBlocked: boolean;
  onFix: (t: FixTarget) => void;
  onState: (s: SiteStateLite) => void;
}) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [pre, setPre] = useState<Preflight | null>(null);
  const [name, setName] = useState('');
  const [avail, setAvail] = useState<Availability | 'checking' | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [limit, setLimit] = useState<{ used: number; max: number | null } | null>(null);
  const [result, setResult] = useState<{ state: SiteStateLite; deployment: DeploymentLite } | null>(null);
  const [reach, setReach] = useState<{ status: Reach; why: string | null }>({ status: 'idle', why: null });
  const seq = useRef(0);
  // Parents pass fresh objects on every render; the dialog must only reload when it opens, so keep them behind refs.
  const flushRef = useRef(flush);
  flushRef.current = flush;
  const onStateRef = useRef(onState);
  onStateRef.current = onState;

  const load = useCallback(async () => {
    setPhase('loading');
    setMessage(null);
    setLimit(null);
    setFieldError(null);
    await flushRef.current.flushNow();
    if (!flushRef.current.isSaved()) {
      setMessage('Your latest changes could not be saved yet, so they cannot be published. Resolve the save problem first.');
      setPhase('error');
      return;
    }
    const r = await call<Preflight>(`/api/projects/${projectId}/publish`, { method: 'GET' });
    if (!r.ok) {
      setMessage(r.status === 429 ? 'You are doing that too quickly. Wait a moment and try again.' : r.status === 404 ? 'This project no longer exists.' : 'We could not check your website. Please try again.');
      setPhase('error');
      return;
    }
    setPre(r.data);
    onStateRef.current(r.data.state);
    setName(r.data.state.subdomain ?? r.data.suggestedSubdomain);
    setAvail(null);
    setPhase('ready');
  }, [projectId]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  // Live availability while typing. The server is the authority; this is only feedback.
  useEffect(() => {
    if (phase !== 'ready' || !pre || pre.state.subdomainLocked) return;
    const mine = ++seq.current;
    if (!name.trim()) {
      setAvail(null);
      return;
    }
    setAvail('checking');
    setFieldError(null);
    const t = window.setTimeout(async () => {
      const r = await call<Availability>(`/api/projects/${projectId}/publish/subdomain?name=${encodeURIComponent(name.trim())}`, { method: 'GET' });
      if (mine !== seq.current) return;
      setAvail(r.ok ? r.data : { ok: false, code: 'error', message: 'Could not check this address right now.', suggestions: [] });
    }, 350);
    return () => window.clearTimeout(t);
  }, [name, phase, pre, projectId]);

  const verify = useCallback(
    async (attempt = 0) => {
      setReach({ status: 'checking', why: null });
      const r = await call<{ reachable: boolean; explanation: string | null; state: SiteStateLite }>(`/api/projects/${projectId}/publish/verify`, { method: 'POST', body: {} });
      if (!r.ok) return setReach({ status: 'unreachable', why: 'We could not check the address right now.' });
      onStateRef.current(r.data.state);
      if (r.data.reachable) return setReach({ status: 'verified', why: null });
      // A fresh certificate or DNS change can take a moment: retry a few times before saying so.
      if (attempt < 2 && /minute|cache/i.test(r.data.explanation ?? '')) {
        await new Promise((res) => setTimeout(res, 3000));
        return verify(attempt + 1);
      }
      setReach({ status: 'unreachable', why: r.data.explanation });
    },
    [projectId],
  );

  async function submit() {
    if (!pre) return;
    setPhase('publishing');
    setMessage(null);
    const r = await call<{ deployment: DeploymentLite; state: SiteStateLite }>(`/api/projects/${projectId}/publish`, { method: 'POST', body: { subdomain: pre.state.subdomain ?? name.trim() } });
    if (!r.ok) {
      const d = r.error.details as { blocking?: Finding[]; warnings?: Finding[] } | undefined;
      if (r.status === 422 && d?.blocking) {
        setPre({ ...pre, report: { ...pre.report, blocking: d.blocking, warnings: d.warnings ?? [], canPublish: false } });
        setPhase('ready');
        return;
      }
      if (r.error.code !== 'limit' && (r.error.fields?.subdomain || r.status === 409)) {
        setFieldError(r.error.fields?.subdomain ?? r.error.message);
        setPhase('ready');
        return;
      }
      setMessage(r.status === 429 ? 'You have published a lot in the last hour. Please wait a little.' : r.error.message);
      setLimit(r.error.code === 'limit' && r.error.details?.billing === true ? { used: Number(r.error.details.used), max: r.error.details.max === null ? null : Number(r.error.details.max) } : null);
      setPhase('ready');
      return;
    }
    onStateRef.current(r.data.state);
    setResult(r.data);
    if (r.data.deployment.status !== 'succeeded') {
      setPhase('failed');
      return;
    }
    setPhase('done');
    void verify();
  }

  const locked = pre?.state.subdomainLocked ?? false;
  const canSubmit = !!pre && pre.report.canPublish && !saveBlocked && (locked || (avail !== null && avail !== 'checking' && avail.ok)) && (!locked || pre.state.hasUnpublishedChanges);
  const published = pre?.state.status === 'published';

  return (
    <Dialog open={open} onClose={onClose} title={published ? 'Publish changes' : 'Publish your website'} size="lg">
      <div className="mt-4 space-y-4" aria-live="polite">
        {phase === 'loading' ? <p className="flex items-center gap-2 py-8 text-[15px] text-midnight/70"><span className="size-4 animate-spin rounded-full border-2 border-violet border-t-transparent" aria-hidden="true" /> Checking your website…</p> : null}

        {phase === 'error' ? (
          <>
            <Notice tone="error">{message}</Notice>
            <div className="flex justify-end gap-3"><Button variant="secondary" onClick={onClose}>Close</Button><Button onClick={() => void load()}>Try again</Button></div>
          </>
        ) : null}

        {phase === 'publishing' ? (
          <div className="py-6" role="status">
            <p className="flex items-center gap-3 text-[16px] font-semibold"><span className="size-5 animate-spin rounded-full border-2 border-violet border-t-transparent" aria-hidden="true" /> Publishing…</p>
            <p className="mt-2 text-[15px] text-midnight/75">We are checking, building and verifying every page. Your current website stays online until the new version is ready. This usually takes a few seconds.</p>
          </div>
        ) : null}

        {phase === 'ready' && pre ? (
          <>
            {message ? <Notice tone="error">{message}{limit ? <> <a href="/billing" className="font-semibold underline">See plans</a>. Your existing websites stay online.</> : null}</Notice> : null}
            {saveBlocked ? <Notice tone="warning">Your latest changes are not saved, so they cannot be published yet. Resolve the save problem shown at the top of the editor.</Notice> : null}

            <section aria-labelledby="pub-check">
              <h3 id="pub-check" className="text-[15px] font-semibold">
                {pre.report.blocking.length > 0 ? `${plural(pre.report.blocking.length, 'problem', 'problems')} to fix before publishing` : 'Your website is ready to publish'}
              </h3>
              {pre.report.blocking.length > 0 ? (
                <ul className="mt-2 space-y-2">
                  {pre.report.blocking.map((f, i) => (
                    <li key={`${f.code}-${i}`} className="flex items-start justify-between gap-3 rounded-2xl bg-red-50 px-4 py-3 text-[14.5px] text-red-950">
                      <span className="min-w-0">{f.where ? <strong className="block">{f.where}</strong> : null}{f.message}</span>
                      {f.fix ? <button type="button" onClick={() => { onClose(); onFix(f.fix!); }} className="min-h-9 shrink-0 rounded-lg px-3 font-semibold text-violet underline focus-visible:outline-2 focus-visible:outline-violet">Fix</button> : null}
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className="mt-3 space-y-2">
                {pre.report.warnings.length > 0 ? (
                  <Collapsible title="Suggestions" count={pre.report.warnings.length}>
                    <p className="mb-2 text-[13.5px] text-midnight/70">These do not stop you from publishing.</p>
                    <ul className="space-y-2">
                      {pre.report.warnings.map((f, i) => (
                        <li key={`${f.code}-${i}`} className="flex items-start justify-between gap-3 text-[14.5px]">
                          <span className="min-w-0">{f.where ? <strong className="block">{f.where}</strong> : null}{f.message}</span>
                          {f.fix ? <button type="button" onClick={() => { onClose(); onFix(f.fix!); }} className="min-h-9 shrink-0 rounded-lg px-3 font-semibold text-violet underline focus-visible:outline-2 focus-visible:outline-violet">Fix</button> : null}
                        </li>
                      ))}
                    </ul>
                  </Collapsible>
                ) : null}
                {pre.report.passed.length > 0 ? (
                  <Collapsible title="Checks passed" count={pre.report.passed.length}>
                    <ul className="space-y-1 text-[14.5px]">{pre.report.passed.map((p) => <li key={p} className="flex items-center gap-2"><Icon name="check" className="size-4 text-emerald-700" /> {p}</li>)}</ul>
                  </Collapsible>
                ) : null}
              </div>
            </section>

            <section aria-labelledby="pub-address">
              <h3 id="pub-address" className="text-[15px] font-semibold">Website address</h3>
              {locked ? (
                <p className="mt-1 break-all text-[15px]">
                  <a className="font-semibold text-violet underline" href={pre.state.url ?? undefined} target="_blank" rel="noreferrer">{pre.state.url}</a>
                  <span className="mt-1 block text-[13.5px] text-midnight/70">The address cannot change while your website is online. To use another one, unpublish it from the project page first.</span>
                </p>
              ) : (
                <>
                  <div className="mt-2 flex min-h-12 items-stretch overflow-hidden rounded-xl border border-midnight/25 focus-within:outline-2 focus-within:outline-violet">
                    <span className="hidden items-center bg-cloud px-3 text-[14px] text-midnight/70 sm:flex">{pre.address.prefix}</span>
                    <input
                      aria-label="Website address"
                      aria-describedby="pub-address-status"
                      aria-invalid={avail !== null && avail !== 'checking' && !avail.ok ? true : undefined}
                      value={name}
                      onChange={(e) => setName(e.target.value.toLowerCase())}
                      maxLength={40}
                      spellCheck={false}
                      autoCapitalize="none"
                      autoComplete="off"
                      className="min-w-0 flex-1 px-3 text-[16px] outline-none"
                    />
                    {pre.address.suffix ? <span className="flex items-center bg-cloud px-3 text-[14px] text-midnight/70">{pre.address.suffix}</span> : null}
                  </div>
                  <p id="pub-address-status" className="mt-1.5 min-h-5 text-[13.5px]" role="status">
                    {avail === 'checking' ? <span className="text-midnight/70">Checking…</span> : null}
                    {avail && avail !== 'checking' && avail.ok ? <span className="font-medium text-emerald-800">{avail.own ? 'This is your address.' : 'Available'}</span> : null}
                    {avail && avail !== 'checking' && !avail.ok ? <span className="text-red-800">{avail.message}</span> : null}
                    {fieldError ? <span className="text-red-800">{fieldError}</span> : null}
                  </p>
                  {avail && avail !== 'checking' && !avail.ok && avail.suggestions.length > 0 ? (
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-[13.5px]">
                      Try:
                      {avail.suggestions.map((s) => <button key={s} type="button" onClick={() => setName(s)} className="min-h-9 rounded-full border border-midnight/20 px-3 font-medium hover:border-violet focus-visible:outline-2 focus-visible:outline-violet">{s}</button>)}
                    </p>
                  ) : null}
                </>
              )}
            </section>

            {published && !pre.state.hasUnpublishedChanges ? <Notice tone="success">Your website is up to date. Make changes in the editor to publish a new version.</Notice> : null}
            {published && pre.state.hasUnpublishedChanges ? <Notice tone="info">The version online will not change until the new one is built and verified.</Notice> : null}

            <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
              <Button variant="secondary" onClick={onClose}>Close</Button>
              <Button onClick={() => void submit()} disabled={!canSubmit}>{published ? 'Publish changes' : 'Publish website'}</Button>
            </div>
          </>
        ) : null}

        {phase === 'done' && result ? (
          <div className="space-y-4">
            <Notice tone="success"><strong>Version {result.deployment.version} is published.</strong></Notice>
            <p className="break-all text-[16px]"><a className="font-semibold text-violet underline" href={result.state.url ?? undefined} target="_blank" rel="noreferrer">{result.state.url}</a></p>
            <div role="status" className="rounded-2xl bg-cloud px-4 py-3 text-[14.5px]">
              {reach.status === 'checking' || reach.status === 'idle' ? <span className="flex items-center gap-2"><span className="size-4 animate-spin rounded-full border-2 border-violet border-t-transparent" aria-hidden="true" /> Checking that the address answers…</span> : null}
              {reach.status === 'verified' ? <span className="flex items-center gap-2 font-medium text-emerald-900"><Icon name="check" className="size-4" /> Confirmed: your website is reachable at this address.</span> : null}
              {reach.status === 'unreachable' ? (
                <span className="block text-amber-950">
                  <strong>Published, but this address does not answer yet.</strong> {reach.why}
                  <button type="button" onClick={() => void verify()} className="mt-2 block min-h-9 rounded-lg font-semibold text-violet underline focus-visible:outline-2 focus-visible:outline-violet">Check again</button>
                </span>
              ) : null}
            </div>
            <div className="flex justify-end"><Button onClick={onClose}>Done</Button></div>
          </div>
        ) : null}

        {phase === 'failed' && result ? (
          <div className="space-y-4">
            <Notice tone="error"><strong>Publishing did not complete.</strong> {result.deployment.failure?.message ?? 'Something went wrong.'}</Notice>
            <p className="text-[14.5px] text-midnight/75">{result.state.status === 'published' ? 'The version that was already online is unchanged.' : 'Nothing was published.'}</p>
            <div className="flex justify-end gap-3"><Button variant="secondary" onClick={onClose}>Close</Button><Button onClick={() => void load()}>Try again</Button></div>
          </div>
        ) : null}
      </div>
    </Dialog>
  );
}
