'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Button, LinkButton, Notice } from '../app/primitives';
import { Logo } from '../logo';
import { clearGuestDraft, destinationFor, readGuestDraft, saveDraftToAccount } from './draft-storage';

type View = { kind: 'working' } | { kind: 'empty'; expired: boolean } | { kind: 'error'; message: string };

export function SaveDraft() {
  const router = useRouter();
  const [view, setView] = useState<View>({ kind: 'working' });
  const started = useRef(false);

  const run = async () => {
    setView({ kind: 'working' });
    let found: ReturnType<typeof readGuestDraft>;
    try {
      found = readGuestDraft();
    } catch {
      return setView({ kind: 'empty', expired: false });
    }
    if (!found.draft) return setView({ kind: 'empty', expired: found.expired });
    const r = await saveDraftToAccount(found.draft.state);
    if (r.ok) {
      clearGuestDraft();
      router.replace(destinationFor(r.id, r.status));
      return;
    }
    // The draft is left untouched so it can be retried: nothing is lost on failure.
    setView({ kind: 'error', message: r.unauthenticated ? 'Your session ended before we could save. Sign in again and we will finish saving.' : r.message });
  };

  useEffect(() => {
    if (started.current) return; // React strict mode runs effects twice in development; the server also de-duplicates by key
    started.current = true;
    void run();
  }, []);

  return (
    <div className="min-h-screen bg-cloud">
      <header className="border-b border-midnight/10 bg-white px-5 py-3 sm:px-8"><Logo /></header>
      <main id="main" className="mx-auto max-w-xl px-5 py-16">
        {view.kind === 'working' ? (
          <div role="status" aria-live="polite">
            <h1 className="text-3xl font-semibold tracking-tight text-midnight">Saving your website…</h1>
            <p className="mt-3 text-midnight/70">We are moving your draft into your account.</p>
          </div>
        ) : null}
        {view.kind === 'empty' ? (
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-midnight">{view.expired ? 'Your draft expired' : 'No draft to save'}</h1>
            <p className="mt-3 text-midnight/70">{view.expired ? 'A draft on this device is kept for 30 days, and this one was older, so it was cleared.' : 'There is no website draft in this browser. Drafts live on the device where you started, so if you began on another device or browser, open Saitlify there. If you already saved it, you will find it in your projects.'}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <LinkButton href="/dashboard">Go to my projects</LinkButton>
              <LinkButton href="/create" variant="secondary">Start a new website</LinkButton>
            </div>
          </div>
        ) : null}
        {view.kind === 'error' ? (
          <div className="space-y-4">
            <h1 className="text-3xl font-semibold tracking-tight text-midnight">We could not save it yet</h1>
            <Notice tone="error">{view.message}{view.message.includes('Open Billing') ? <> <a href="/billing" className="font-semibold underline">Go to Billing</a>.</> : null}</Notice>
            <p className="text-midnight/70">Your answers are still safe on this device.</p>
            <div className="flex flex-wrap gap-3">
              <Button onClick={() => void run()}>Try again</Button>
              <Link href="/create" className="inline-flex min-h-11 items-center font-semibold text-violet underline underline-offset-4">Back to the configurator</Link>
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}
