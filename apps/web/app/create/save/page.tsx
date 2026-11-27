import { redirect } from 'next/navigation';

/** Retired entry point of the old guest flow. Drafts kept in this browser are restored by the configurator itself. */
export default function SavePage() {
  redirect('/create');
}
