import { loginUrlFor } from '@saitify/platform/client';
import { redirect } from 'next/navigation';
import { Wizard } from '../../components/configurator/wizard';
import { currentSession } from '../../lib/server/session';

export const dynamic = 'force-dynamic';

/**
 * Creating a website needs an account. The edge proxy already sends visitors without a session cookie to sign in; this check
 * validates the session itself, so an expired or forged cookie cannot open the configurator either. The visitor returns here
 * afterwards, with the template they chose (`?template=`) when they came from the templates page.
 */
export default async function CreatePage({ searchParams }: { searchParams: Promise<{ template?: string }> }) {
  const sp = await searchParams;
  const template = typeof sp.template === 'string' && /^[a-z0-9-]{1,40}$/.test(sp.template) ? sp.template : undefined;
  if (!(await currentSession())) redirect(loginUrlFor('/create', template ? `?template=${template}` : ''));
  return <Wizard initialTemplate={template} />;
}
