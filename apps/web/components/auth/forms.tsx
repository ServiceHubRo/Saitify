'use client';

import { passwordRules } from '@saitify/platform/client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { call } from '../app/api-client';
import { Button, Notice } from '../app/primitives';
import { Field, TextInput, inputClass } from '../configurator/fields';

type Errors = Record<string, string>;

export function PasswordField({ id, label, value, onChange, error, autoComplete, help, rules }: { id: string; label: string; value: string; onChange: (v: string) => void; error?: string; autoComplete: string; help?: string; rules?: { id: string; label: string; ok: boolean }[] }) {
  const [shown, setShown] = useState(false);
  return (
    <div>
      <Field id={id} label={label} help={help} error={error}>
        <div className="relative">
          <input id={id} name={id} type={shown ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} maxLength={128} aria-invalid={error ? true : undefined} aria-describedby={[help ? `${id}-help` : '', error ? `${id}-error` : '', rules ? `${id}-rules` : ''].filter(Boolean).join(' ') || undefined} className={`${inputClass} pr-24`} />
          <button type="button" onClick={() => setShown((s) => !s)} aria-pressed={shown} className="absolute inset-y-0 right-1 my-auto h-11 min-w-20 rounded-lg px-3 text-sm font-semibold text-violet hover:bg-violet/10 focus-visible:outline-2 focus-visible:outline-violet">
            {shown ? 'Hide' : 'Show'}<span className="sr-only"> password</span>
          </button>
        </div>
      </Field>
      {rules && value ? (
        <ul id={`${id}-rules`} className="mt-2 space-y-1 text-sm" aria-label="Password requirements">
          {rules.map((r) => (
            <li key={r.id} className={r.ok ? 'text-emerald-800' : 'text-midnight/70'}>
              <span aria-hidden="true">{r.ok ? '✓ ' : '• '}</span>{r.label}<span className="sr-only">{r.ok ? ' (met)' : ' (not met yet)'}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function useSubmit() {
  const [submitting, setSubmitting] = useState(false);
  const lock = useRef(false);
  /** Ignores a second submit while the first is running (double click, Enter + click). */
  const run = async (fn: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true;
    setSubmitting(true);
    try {
      await fn();
    } finally {
      lock.current = false;
      setSubmitting(false);
    }
  };
  return { submitting, run };
}

function focusFirstError(root: HTMLFormElement | null) {
  window.setTimeout(() => (root?.querySelector('[aria-invalid="true"]') as HTMLElement | null)?.focus(), 0);
}

const withNext = (path: string, next: string) => (next && next !== '/dashboard' ? `${path}?next=${encodeURIComponent(next)}` : path);

/* ------------------------------------------------------------------ login */

export function LoginForm({ next, notice }: { next: string; notice?: string }) {
  const router = useRouter();
  const { submitting, run } = useSubmit();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const alertRef = useRef<HTMLDivElement>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      setError(null);
      const r = await call('/api/auth/login', { body: { email, password, remember } });
      if (r.ok) {
        router.replace(next);
        router.refresh();
        return;
      }
      setError(r.error.message);
      window.setTimeout(() => alertRef.current?.focus(), 0);
    });
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-5" aria-label="Sign in">
      {notice ? <Notice tone="success">{notice}</Notice> : null}
      {error ? <Notice tone="error" innerRef={alertRef}>{error}</Notice> : null}
      <TextInput id="email" label="Email" type="email" name="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      <PasswordField id="password" label="Password" autoComplete="current-password" value={password} onChange={setPassword} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex min-h-11 items-center gap-2.5 text-[15px] text-midnight">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="size-5 accent-violet" />
          Keep me signed in
        </label>
        <Link href="/forgot-password" className="inline-flex min-h-11 items-center rounded px-1 text-[15px] font-semibold text-violet underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-violet">Forgot password?</Link>
      </div>
      <Button type="submit" loading={submitting} className="w-full">{submitting ? 'Signing in…' : 'Sign in'}</Button>
    </form>
  );
}

/* --------------------------------------------------------------- register */

export function RegisterForm({ next }: { next: string }) {
  const router = useRouter();
  const { submitting, run } = useSubmit();
  const formRef = useRef<HTMLFormElement>(null);
  const [v, setV] = useState({ name: '', email: '', password: '', confirm: '' });
  const [terms, setTerms] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ email: string; delivery: string } | null>(null);
  const [unsent, setUnsent] = useState<'unavailable' | 'failed' | null>(null);
  const set = (k: keyof typeof v) => (value: string) => setV((s) => ({ ...s, [k]: value }));
  const rules = passwordRules(v.password, { email: v.email, name: v.name });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      setErrors({});
      setFormError(null);
      const r = await call<{ signedIn: boolean; delivery: string }>('/api/auth/register', { body: { ...v, acceptTerms: terms } });
      if (r.ok) {
        if (r.data.signedIn) {
          // Only go straight on when the confirmation email really went out; otherwise say so (and keep the account: it is ready).
          if (r.data.delivery === 'sent') {
            router.replace(next);
            router.refresh();
          } else setUnsent(r.data.delivery === 'failed' ? 'failed' : 'unavailable');
        } else setSent({ email: v.email, delivery: r.data.delivery });
        return;
      }
      if (r.error.fields) {
        setErrors(r.error.fields);
        focusFirstError(formRef.current);
      } else setFormError(r.error.message);
    });
  };

  if (unsent) {
    return (
      <div className="space-y-5" data-testid="register-email-unsent">
        <Notice tone="warning">
          <p className="font-semibold">Your account is ready, but we could not send the confirmation email</p>
          <p className="mt-1">
            {unsent === 'failed' ? 'The email service did not accept the message just now. ' : 'Email delivery is not set up on this site yet. '}
            You are signed in and your work will be saved. You can ask for the email again from your dashboard once email is working.
          </p>
        </Notice>
        <Button onClick={() => { router.replace(next); router.refresh(); }}>Continue to my account</Button>
      </div>
    );
  }
  if (sent) {
    return (
      <div className="space-y-5" data-testid="register-check-email">
        <Notice tone="success">
          <p className="font-semibold">Check your inbox</p>
          <p className="mt-1">If {sent.email} can be used for a new account, we sent a message to it. If you already have an account with that address, <Link href={withNext('/login', next)} className="font-semibold underline underline-offset-4">sign in</Link> or <Link href="/forgot-password" className="font-semibold underline underline-offset-4">reset your password</Link>.</p>
          {sent.delivery === 'unavailable' ? <p className="mt-2">Email delivery is not set up on this site yet, so no message could be sent.</p> : null}
        </Notice>
      </div>
    );
  }

  return (
    <form ref={formRef} onSubmit={submit} noValidate className="space-y-5" aria-label="Create account">
      {formError ? <Notice tone="error">{formError}</Notice> : null}
      <TextInput id="name" label="Your name" name="name" autoComplete="name" value={v.name} onChange={(e) => set('name')(e.target.value)} error={errors.name} maxLength={100} />
      <TextInput id="email" label="Email" type="email" name="email" autoComplete="email" inputMode="email" value={v.email} onChange={(e) => set('email')(e.target.value)} error={errors.email} />
      <PasswordField id="password" label="Password" autoComplete="new-password" value={v.password} onChange={set('password')} error={errors.password} rules={rules} />
      <PasswordField id="confirm" label="Confirm password" autoComplete="new-password" value={v.confirm} onChange={set('confirm')} error={errors.confirm} />
      <div>
        <label className="flex items-start gap-3 text-[15px] leading-relaxed text-midnight">
          <input type="checkbox" id="acceptTerms" checked={terms} onChange={(e) => setTerms(e.target.checked)} aria-invalid={errors.acceptTerms ? true : undefined} aria-describedby={errors.acceptTerms ? 'acceptTerms-error' : undefined} className="mt-0.5 size-5 shrink-0 accent-violet" />
          <span>
            I accept the <Link href="/terms" target="_blank" rel="noopener" className="font-semibold text-violet underline underline-offset-4">Terms of Service</Link> and the <Link href="/privacy" target="_blank" rel="noopener" className="font-semibold text-violet underline underline-offset-4">Privacy Policy</Link>.
          </span>
        </label>
        {errors.acceptTerms ? <p id="acceptTerms-error" className="mt-1.5 text-sm font-medium text-red-700">{errors.acceptTerms}</p> : null}
      </div>
      <Button type="submit" loading={submitting} className="w-full">{submitting ? 'Creating your account…' : 'Create account'}</Button>
    </form>
  );
}

/* ------------------------------------------------------- forgot / reset */

export function ForgotForm() {
  const { submitting, run } = useSubmit();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string>();
  const [done, setDone] = useState(false);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      setError(null);
      setFieldError(undefined);
      const r = await call('/api/auth/forgot-password', { body: { email } });
      if (r.ok) setDone(true);
      else if (r.error.fields?.email) setFieldError(r.error.fields.email);
      else setError(r.error.message);
    });
  };
  if (done) {
    return (
      <Notice tone="success">
        <p className="font-semibold">Check your inbox</p>
        <p className="mt-1">If an account exists for {email}, we sent a link to choose a new password. It works for one hour.</p>
      </Notice>
    );
  }
  return (
    <form onSubmit={submit} noValidate className="space-y-5" aria-label="Reset password">
      {error ? <Notice tone="error">{error}</Notice> : null}
      <TextInput id="email" label="Email" type="email" name="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} error={fieldError} />
      <Button type="submit" loading={submitting} className="w-full">{submitting ? 'Sending…' : 'Send reset link'}</Button>
    </form>
  );
}

/** Reads a one-time token from the URL fragment, then removes it from the address bar so it cannot leak through history or Referer. */
export function useFragmentToken(): string | null | undefined {
  const [token, setToken] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    const m = /(?:^#|&)token=([A-Za-z0-9_-]+)/.exec(window.location.hash);
    setToken(m?.[1] ?? null);
    if (m) window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }, []);
  return token;
}

export function ResetForm() {
  const token = useFragmentToken();
  const { submitting, run } = useSubmit();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, setState] = useState<'checking' | 'valid' | 'expired' | 'invalid' | 'done'>('checking');
  const [v, setV] = useState({ password: '', confirm: '' });
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const savedToken = useRef<string | null>(null);

  useEffect(() => {
    if (token === undefined) return;
    if (token === null) {
      setState('invalid');
      return;
    }
    savedToken.current = token;
    void call<{ status: 'valid' | 'expired' | 'invalid' }>('/api/auth/check-reset', { body: { token } }).then((r) => setState(r.ok ? r.data.status : 'valid'));
  }, [token]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      setErrors({});
      setFormError(null);
      const r = await call('/api/auth/reset-password', { body: { token: savedToken.current, ...v } });
      if (r.ok) return setState('done');
      if (r.error.fields) {
        setErrors(r.error.fields);
        focusFirstError(formRef.current);
      } else if (r.error.code === 'expired') setState('expired');
      else if (r.error.code === 'invalid_token') setState('invalid');
      else setFormError(r.error.message);
    });
  };

  if (state === 'checking') return <p role="status" className="text-midnight/70">Checking your link…</p>;
  if (state === 'done') {
    return (
      <div className="space-y-5">
        <Notice tone="success">Your password was changed and you were signed out everywhere. Sign in with your new password.</Notice>
        <Link href="/login" className="inline-flex min-h-12 w-full items-center justify-center rounded-full bg-gradient-to-r from-violet to-blue px-6 font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet">Go to sign in</Link>
      </div>
    );
  }
  if (state === 'expired' || state === 'invalid') {
    return (
      <div className="space-y-5">
        <Notice tone="error">{state === 'expired' ? 'This reset link has expired.' : 'This reset link is not valid, or it was already used.'} Request a new one to continue.</Notice>
        <Link href="/forgot-password" className="inline-flex min-h-12 w-full items-center justify-center rounded-full bg-gradient-to-r from-violet to-blue px-6 font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet">Request a new link</Link>
        <p className="text-center"><Link href="/login" className="font-semibold text-violet underline underline-offset-4">Back to sign in</Link></p>
      </div>
    );
  }
  return (
    <form ref={formRef} onSubmit={submit} noValidate className="space-y-5" aria-label="Choose a new password">
      {formError ? <Notice tone="error">{formError}</Notice> : null}
      <PasswordField id="password" label="New password" autoComplete="new-password" value={v.password} onChange={(x) => setV((s) => ({ ...s, password: x }))} error={errors.password} rules={passwordRules(v.password)} />
      <PasswordField id="confirm" label="Confirm new password" autoComplete="new-password" value={v.confirm} onChange={(x) => setV((s) => ({ ...s, confirm: x }))} error={errors.confirm} />
      <Button type="submit" loading={submitting} className="w-full">{submitting ? 'Saving…' : 'Change password'}</Button>
    </form>
  );
}

/* ------------------------------------------- verify email / confirm email */

type TokenState = 'working' | 'verified' | 'already_verified' | 'changed' | 'expired' | 'invalid' | 'taken' | 'network';

export function TokenAction({ endpoint, kind }: { endpoint: string; kind: 'verify' | 'email-change' }) {
  const token = useFragmentToken();
  const [state, setState] = useState<TokenState>('working');
  const [message, setMessage] = useState('');
  const started = useRef(false);

  useEffect(() => {
    if (token === undefined || started.current) return;
    if (token === null) return setState('invalid');
    started.current = true;
    void call<{ status: string }>(endpoint, { body: { token } }).then((r) => {
      if (r.ok) setState(r.data.status as TokenState);
      else if (r.error.code === 'expired') setState('expired');
      else if (r.error.code === 'taken') {
        setState('taken');
        setMessage(r.error.message);
      } else if (r.error.code === 'network') {
        started.current = false;
        setState('network');
      } else setState('invalid');
    });
  }, [token, endpoint]);

  const go = <Link href="/dashboard" className="inline-flex min-h-12 w-full items-center justify-center rounded-full bg-gradient-to-r from-violet to-blue px-6 font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet">Continue to your dashboard</Link>;

  if (state === 'working') return <p role="status" className="text-midnight/70">Confirming…</p>;
  if (state === 'verified' || state === 'already_verified' || state === 'changed')
    return (
      <div className="space-y-5" data-testid="token-success">
        <Notice tone="success">{state === 'changed' ? 'Your email address was changed and confirmed.' : state === 'already_verified' ? 'This email address was already confirmed.' : 'Thank you! Your email address is confirmed.'}</Notice>
        {go}
      </div>
    );
  if (state === 'network') return <Notice tone="error">We could not reach Saitlify. Reload this page to try again.</Notice>;
  return (
    <div className="space-y-5" data-testid="token-failure">
      <Notice tone="error">{state === 'taken' ? message : state === 'expired' ? 'This link has expired.' : 'This link is not valid, or it was already used.'}</Notice>
      {kind === 'verify' && (state === 'expired' || state === 'invalid') ? <ResendByEmail /> : <Link href="/account" className="font-semibold text-violet underline underline-offset-4">Go to account settings</Link>}
    </div>
  );
}

function ResendByEmail() {
  const { submitting, run } = useSubmit();
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [fieldError, setFieldError] = useState<string>();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      setMsg(null);
      setFieldError(undefined);
      const r = await call('/api/auth/resend-verification', { body: { email } });
      if (r.ok) setMsg({ tone: 'success', text: `If ${email} has an account that still needs confirming, we sent a new link.` });
      else if (r.error.fields?.email) setFieldError(r.error.fields.email);
      else setMsg({ tone: 'error', text: r.error.message });
    });
  };
  return (
    <form onSubmit={submit} noValidate className="space-y-4" aria-label="Send a new confirmation link">
      <p className="text-[15px] text-midnight/75">Enter your email and we will send a new confirmation link.</p>
      {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
      <TextInput id="email" label="Email" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} error={fieldError} />
      <Button type="submit" loading={submitting} variant="secondary" className="w-full">{submitting ? 'Sending…' : 'Send a new link'}</Button>
    </form>
  );
}
