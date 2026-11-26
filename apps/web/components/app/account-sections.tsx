'use client';

import { passwordRules } from '@saitify/platform/client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { call } from './api-client';
import { Dialog } from './dialog';
import { Badge, Button, Notice, buttonClass } from './primitives';
import { PasswordField } from '../auth/forms';
import { TextInput } from '../configurator/fields';
import { useToast } from './toast';

type Fields = Record<string, string>;

function Card({ id, title, intro, children }: { id: string; title: string; intro?: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="rounded-3xl border border-midnight/10 bg-white p-5 sm:p-7">
      <h2 id={id} className="text-xl font-semibold tracking-tight text-midnight">{title}</h2>
      {intro ? <p className="mt-1.5 max-w-2xl text-[15px] leading-relaxed text-midnight/70">{intro}</p> : null}
      <div className="mt-5">{children}</div>
    </section>
  );
}

function useAction() {
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const run = async (fn: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      await fn();
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return { busy, run };
}

export function ProfileSection({ name, email, verified }: { name: string; email: string; verified: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const { busy, run } = useAction();
  const [v, setV] = useState(name);
  const [err, setErr] = useState<string>();
  const [formErr, setFormErr] = useState<string>();
  const [resend, setResend] = useState<string | null>(null);

  const save = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      setErr(undefined);
      setFormErr(undefined);
      const r = await call('/api/account', { method: 'PATCH', body: { name: v } });
      if (r.ok) {
        toast('success', 'Your name was updated.');
        router.refresh();
      } else if (r.error.fields?.name) setErr(r.error.fields.name);
      else setFormErr(r.error.message);
    });
  };
  const resendLink = () =>
    void run(async () => {
      const r = await call('/api/auth/resend-verification');
      setResend(r.ok ? `We sent a new link to ${email}.` : r.error.message);
    });

  return (
    <Card id="profile-title" title="Profile">
      <form onSubmit={save} noValidate className="max-w-md space-y-4" aria-label="Update your name">
        {formErr ? <Notice tone="error">{formErr}</Notice> : null}
        <TextInput id="acc-name" label="Display name" value={v} maxLength={100} autoComplete="name" onChange={(e) => setV(e.target.value)} error={err} />
        <Button type="submit" loading={busy} disabled={v.trim() === name}>Save name</Button>
      </form>
      <div className="mt-6 border-t border-midnight/10 pt-5">
        <p className="text-sm font-semibold text-midnight">Email address</p>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-midnight">
          <span className="[overflow-wrap:anywhere]">{email}</span>
          <Badge tone={verified ? 'verified' : 'unverified'}>{verified ? 'Confirmed' : 'Not confirmed'}</Badge>
        </p>
        {!verified ? (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button variant="secondary" onClick={resendLink} loading={busy}>Resend confirmation email</Button>
            {resend ? <p role="status" className="text-sm text-midnight/75">{resend}</p> : null}
          </div>
        ) : null}
      </div>
    </Card>
  );
}

export function EmailSection({ available }: { available: boolean }) {
  const { busy, run } = useAction();
  const [v, setV] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState<Fields>({});
  const [msg, setMsg] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      setErrors({});
      setMsg(null);
      const r = await call('/api/account/email', { body: v });
      if (r.ok) {
        setMsg({ tone: 'success', text: `We sent a confirmation link to ${v.email}. Your email changes only after you open it.` });
        setV({ email: '', password: '' });
      } else if (r.error.fields) setErrors(r.error.fields);
      else setMsg({ tone: 'error', text: r.error.message });
    });
  };
  return (
    <Card id="email-title" title="Change email" intro="We send a confirmation link to the new address. Your email only changes after you confirm it, and we ask for your password first.">
      {!available ? (
        <Notice tone="warning">Email delivery is not set up on this site yet, so the address cannot be changed right now.</Notice>
      ) : (
        <form onSubmit={submit} noValidate className="max-w-md space-y-4" aria-label="Change email address">
          {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
          <TextInput id="new-email" label="New email address" type="email" autoComplete="email" inputMode="email" value={v.email} onChange={(e) => setV((s) => ({ ...s, email: e.target.value }))} error={errors.email} />
          <PasswordField id="email-password" label="Current password" autoComplete="current-password" value={v.password} onChange={(x) => setV((s) => ({ ...s, password: x }))} error={errors.password} />
          <Button type="submit" loading={busy}>Send confirmation link</Button>
        </form>
      )}
    </Card>
  );
}

export function PasswordSection() {
  const { busy, run } = useAction();
  const toast = useToast();
  const [v, setV] = useState({ current: '', next: '', confirm: '' });
  const [errors, setErrors] = useState<Fields>({});
  const [formErr, setFormErr] = useState<string>();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      setErrors({});
      setFormErr(undefined);
      const r = await call('/api/account/password', { body: v });
      if (r.ok) {
        toast('success', 'Password changed. Your other devices were signed out.');
        setV({ current: '', next: '', confirm: '' });
      } else if (r.error.fields) setErrors(r.error.fields);
      else setFormErr(r.error.message);
    });
  };
  return (
    <Card id="password-title" title="Password" intro="Changing your password signs you out on every other device.">
      <form onSubmit={submit} noValidate className="max-w-md space-y-4" aria-label="Change password">
        {formErr ? <Notice tone="error">{formErr}</Notice> : null}
        <PasswordField id="pw-current" label="Current password" autoComplete="current-password" value={v.current} onChange={(x) => setV((s) => ({ ...s, current: x }))} error={errors.current} />
        <PasswordField id="pw-next" label="New password" autoComplete="new-password" value={v.next} onChange={(x) => setV((s) => ({ ...s, next: x }))} error={errors.next} rules={passwordRules(v.next)} />
        <PasswordField id="pw-confirm" label="Confirm new password" autoComplete="new-password" value={v.confirm} onChange={(x) => setV((s) => ({ ...s, confirm: x }))} error={errors.confirm} />
        <Button type="submit" loading={busy}>Change password</Button>
      </form>
    </Card>
  );
}

export function SessionSection() {
  const router = useRouter();
  const { busy, run } = useAction();
  const [err, setErr] = useState<string>();
  return (
    <Card id="session-title" title="Sessions" intro="Sign out here, or sign out of every browser and device where you are signed in.">
      {err ? <Notice tone="error" className="mb-3">{err}</Notice> : null}
      <div className="flex flex-wrap gap-3">
        <Button variant="secondary" loading={busy} onClick={() => void run(async () => { await call('/api/auth/logout'); router.replace('/login'); router.refresh(); })}>Sign out</Button>
        <Button variant="secondary" loading={busy} onClick={() => void run(async () => { const r = await call('/api/auth/logout-all'); if (r.ok) { router.replace('/login'); router.refresh(); } else setErr(r.error.message); })}>Sign out everywhere</Button>
      </div>
    </Card>
  );
}

export function PrivacySection() {
  const router = useRouter();
  const { busy, run } = useAction();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ password: '', confirmText: '' });
  const [errors, setErrors] = useState<Fields>({});
  const [formErr, setFormErr] = useState<string>();

  const del = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      setErrors({});
      setFormErr(undefined);
      const r = await call('/api/account', { method: 'DELETE', body: v });
      if (r.ok) {
        router.replace('/login?notice=deleted');
        router.refresh();
      } else if (r.error.fields) setErrors(r.error.fields);
      else setFormErr(r.error.message);
    });
  };

  return (
    <>
      <Card id="privacy-title" title="Your data" intro="You can download everything we store about your account and projects.">
        <div className="flex flex-wrap gap-3">
          <a href="/api/account/export" download className={buttonClass('secondary')}>Download my data (JSON)</a>
          <Link href="/terms" target="_blank" rel="noopener" className={buttonClass('ghost')}>Terms of Service</Link>
          <Link href="/privacy" target="_blank" rel="noopener" className={buttonClass('ghost')}>Privacy Policy</Link>
        </div>
      </Card>
      <section aria-labelledby="danger-title" className="rounded-3xl border border-red-200 bg-red-50/60 p-5 sm:p-7">
        <h2 id="danger-title" className="text-xl font-semibold tracking-tight text-red-900">Delete account</h2>
        <p className="mt-1.5 max-w-2xl text-[15px] leading-relaxed text-red-950/80">This permanently deletes your account, your sign-in sessions and <strong>all of your projects</strong>. We cannot recover them afterwards. Download your data first if you want a copy. Copies in the database provider’s backups are removed when those backups expire.</p>
        <Button variant="danger" className="mt-5" onClick={() => { setV({ password: '', confirmText: '' }); setErrors({}); setFormErr(undefined); setOpen(true); }}>Delete my account…</Button>
      </section>

      <Dialog open={open} onClose={() => setOpen(false)} title="Delete your account?">
        <form onSubmit={del} noValidate aria-label="Confirm account deletion" className="mt-3 space-y-4">
          <p className="text-[15px] leading-relaxed text-midnight/75">All projects will be deleted with it. To confirm, enter your password and type <strong>DELETE</strong>.</p>
          {formErr ? <Notice tone="error">{formErr}</Notice> : null}
          <PasswordField id="del-password" label="Password" autoComplete="current-password" value={v.password} onChange={(x) => setV((s) => ({ ...s, password: x }))} error={errors.password} />
          <TextInput id="del-confirm" label="Type DELETE" autoComplete="off" autoCapitalize="characters" value={v.confirmText} onChange={(e) => setV((s) => ({ ...s, confirmText: e.target.value }))} error={errors.confirmText} />
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" variant="danger" loading={busy} disabled={v.confirmText !== 'DELETE' || !v.password}>Delete everything</Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
