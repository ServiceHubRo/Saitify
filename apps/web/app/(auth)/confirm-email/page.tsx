import type { Metadata } from 'next';
import { AuthShell } from '../../../components/auth/auth-shell';
import { TokenAction } from '../../../components/auth/forms';

export const metadata: Metadata = { title: 'Confirm your new email', referrer: 'no-referrer' };

export default function ConfirmEmailPage() {
  return (
    <AuthShell title="Confirm your new email">
      <TokenAction endpoint="/api/account/confirm-email" kind="email-change" />
    </AuthShell>
  );
}
