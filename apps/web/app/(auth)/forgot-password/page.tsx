import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthShell } from '../../../components/auth/auth-shell';
import { ForgotForm } from '../../../components/auth/forms';

export const metadata: Metadata = { title: 'Reset your password' };

export default function ForgotPage() {
  return (
    <AuthShell
      title="Reset your password"
      intro="Enter the email you used to sign up and we will send you a link to choose a new password."
      footer={<Link href="/login" className="font-semibold text-violet underline underline-offset-4">Back to sign in</Link>}
    >
      <ForgotForm />
    </AuthShell>
  );
}
