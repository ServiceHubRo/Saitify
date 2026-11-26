'use client';

import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { LIMITS, validateContact, type ContactErrors } from '../lib/contact';

type Status = 'idle' | 'submitting' | 'success' | 'error';

const inputClass =
  'mt-2 block w-full rounded-xl border border-midnight/20 bg-white px-4 py-3 text-base text-midnight placeholder:text-midnight/40 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-violet aria-[invalid=true]:border-red-600';

function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="text-sm font-semibold text-midnight">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-sm font-medium text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function ContactForm({ initialSubject = '' }: { initialSubject?: string }) {
  const [status, setStatus] = useState<Status>('idle');
  const [errors, setErrors] = useState<ContactErrors>({});
  const [serverMessage, setServerMessage] = useState('');
  const startedAt = useRef<number | null>(null);

  const describe = (field: keyof ContactErrors) =>
    errors[field] ? { 'aria-invalid': true, 'aria-describedby': `${field}-error` } : {};

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const payload = {
      name: String(data.get('name') ?? ''),
      email: String(data.get('email') ?? ''),
      subject: String(data.get('subject') ?? ''),
      message: String(data.get('message') ?? ''),
      website: String(data.get('website') ?? ''),
      elapsed: startedAt.current === null ? 0 : Date.now() - startedAt.current,
    };

    const found = validateContact(payload);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      setStatus('idle');
      const first = (['name', 'email', 'subject', 'message'] as const).find((f) => found[f]);
      if (first) form.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
      return;
    }

    setStatus('submitting');
    setServerMessage('');
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setStatus('success');
        form.reset();
        return;
      }
      const body = (await res.json().catch(() => ({}))) as { error?: string; fields?: ContactErrors };
      if (res.status === 422 && body.fields) {
        setErrors(body.fields);
        setStatus('idle');
        return;
      }
      setServerMessage(
        body.error === 'not_configured'
          ? 'Your message was not sent: this form is not connected to email yet. Please try again later.'
          : 'Your message was not sent. Please check your details and try again in a moment.',
      );
      setStatus('error');
    } catch {
      setServerMessage('Your message was not sent because of a network problem. Please try again.');
      setStatus('error');
    }
  }

  if (status === 'success') {
    return (
      <div role="status" className="rounded-2xl border border-blue/30 bg-blue/5 p-8">
        <h2 className="text-2xl font-semibold text-midnight">Message sent</h2>
        <p className="mt-3 text-base leading-relaxed text-midnight/75">
          Thank you. We received your message and will reply by email.
        </p>
        <button
          type="button"
          onClick={() => setStatus('idle')}
          className="mt-6 rounded-full border border-midnight/15 px-5 py-2.5 text-sm font-semibold text-midnight hover:border-violet hover:text-violet"
        >
          Send another message
        </button>
      </div>
    );
  }

  return (
    <form
      noValidate
      onSubmit={onSubmit}
      onFocus={() => {
        if (startedAt.current === null) startedAt.current = Date.now();
      }}
      className="space-y-5"
    >
      <Field id="name" label="Name" error={errors.name}>
        <input
          id="name"
          name="name"
          type="text"
          autoComplete="name"
          maxLength={LIMITS.name.max}
          className={inputClass}
          {...describe('name')}
        />
      </Field>
      <Field id="email" label="Email" error={errors.email}>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          maxLength={LIMITS.email.max}
          className={inputClass}
          {...describe('email')}
        />
      </Field>
      <Field id="subject" label="Subject" error={errors.subject}>
        <input
          id="subject"
          name="subject"
          type="text"
          defaultValue={initialSubject}
          maxLength={LIMITS.subject.max}
          className={inputClass}
          {...describe('subject')}
        />
      </Field>
      <Field id="message" label="Message" error={errors.message}>
        <textarea
          id="message"
          name="message"
          rows={6}
          maxLength={LIMITS.message.max}
          className={inputClass}
          {...describe('message')}
        />
      </Field>

      {/* Honeypot: hidden from people and assistive technology. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="website">Website</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      {status === 'error' ? (
        <p role="alert" className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm font-medium text-red-800">
          {serverMessage}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={status === 'submitting'}
        className="inline-flex min-h-12 w-full items-center justify-center rounded-full bg-gradient-to-r from-violet to-blue px-8 text-base font-semibold text-white shadow-lg shadow-violet/25 transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet disabled:opacity-60 sm:w-auto"
      >
        {status === 'submitting' ? 'Sending…' : 'Send message'}
      </button>
    </form>
  );
}
