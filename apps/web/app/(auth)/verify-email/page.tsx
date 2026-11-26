import type { Metadata } from 'next';
import { AuthShell } from '../../../components/auth/auth-shell';
import { TokenAction } from '../../../components/auth/forms';

export const metadata: Metadata = { title: 'Confirm your email', referrer: 'no-referrer' };

export default function VerifyPage() {
  return (
    <AuthShell title="Confirm your email">
      <TokenAction endpoint="/api/auth/verify-email" kind="verify" />
    </AuthShell>
  );
}
