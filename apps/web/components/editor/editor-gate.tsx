'use client';

import Link from 'next/link';
import { useState } from 'react';
import { call } from '../app/api-client';
import { Button, Notice, buttonClass } from '../app/primitives';
import { EditorShell, type EditorProject } from './editor-shell';

/**
 * If part of the stored website cannot be read, opening it normally would drop that part on the next save. The user is
 * told first and chooses: open what is readable, rebuild from their answers, or leave without changing anything.
 */
export function EditorGate({ project, issues }: { project: EditorProject; issues: string[] }) {
  const [ok, setOk] = useState(issues.length === 0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (ok) return <EditorShell project={project} />;
  return (
    <main className="grid min-h-dvh place-items-center bg-cloud p-6">
      <div className="w-full max-w-xl rounded-3xl bg-white p-8 shadow-xl">
        <h1 className="text-2xl font-semibold text-midnight">Part of this website cannot be read</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-midnight/80">{issues.length} {issues.length === 1 ? 'problem was' : 'problems were'} found in the saved website. Nothing has been changed. If you open the editor anyway, the unreadable parts are left out, and they are removed for good the next time it saves.</p>
        <ul className="mt-3 max-h-40 list-disc space-y-1 overflow-y-auto rounded-xl bg-cloud py-3 pl-8 pr-3 text-[13.5px] text-midnight/80">
          {issues.slice(0, 8).map((i) => <li key={i} className="[overflow-wrap:anywhere]">{i}</li>)}
          {issues.length > 8 ? <li>…and {issues.length - 8} more</li> : null}
        </ul>
        {error ? <Notice tone="error" className="mt-3">{error}</Notice> : null}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Button onClick={() => setOk(true)}>Open what can be read</Button>
          <Button
            variant="secondary"
            loading={busy}
            onClick={async () => {
              setBusy(true);
              const r = await call(`/api/projects/${project.id}/site/reset`, { body: { revision: project.revision } });
              setBusy(false);
              if (r.ok) window.location.reload();
              else setError(r.error.message);
            }}
          >
            Rebuild from my answers
          </Button>
          <Link href={`/dashboard/projects/${project.id}`} className={buttonClass('ghost')}>Leave</Link>
        </div>
      </div>
    </main>
  );
}
