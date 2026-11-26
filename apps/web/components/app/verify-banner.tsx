'use client';

import { useState } from 'react';
import { call } from './api-client';
import { Button, Notice } from './primitives';

/** Shown until the email is confirmed. Honest about what happens: we only say "sent" when the server did send. */
export function VerifyBanner({ email }: { email: string }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  async function resend() {
    if (busy) return;
    setBusy(true);
    const r = await call('/api/auth/resend-verification');
    setBusy(false);
    if (r.ok) setMsg({ tone: 'success', text: (r.data as { status?: string }).status === 'already_verified' ? 'Your email is already confirmed. Reload the page.' : `We sent a new link to ${email}.` });
    else setMsg({ tone: 'error', text: r.error.message });
  }
  return (
    <section aria-label="Email confirmation" className="mb-8 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-950 sm:p-5">
      <p className="font-semibold">Confirm your email address</p>
      <p className="mt-1 text-[15px] leading-relaxed">Your projects are saved, but <strong>{email}</strong> is not confirmed yet. Confirming lets us reach you about your account and is needed for features coming later. Open the link we sent, or ask for a new one.</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button variant="secondary" loading={busy} onClick={resend}>{busy ? 'Sending…' : 'Resend confirmation email'}</Button>
        {msg ? <Notice tone={msg.tone} className="!py-2">{msg.text}</Notice> : null}
      </div>
    </section>
  );
}
