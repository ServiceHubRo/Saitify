import { requireSession } from '../../../lib/server/session';
import { SaveDraft } from '../../../components/configurator/save-draft';

export const dynamic = 'force-dynamic';

/** Landing point after sign-up or sign-in from the configurator: moves the guest draft into the account. */
export default async function SavePage() {
  await requireSession('/create/save');
  return <SaveDraft />;
}
