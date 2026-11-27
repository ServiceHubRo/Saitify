import type { Metadata } from 'next';
import { LegalPage, LegalSection, Todo } from '../../../components/legal';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'What Saitlify collects, why, who receives it and how to export or delete it (draft pending legal review).',
  alternates: { canonical: '/privacy' },
  openGraph: { url: '/privacy', title: 'Privacy Policy | Saitlify' },
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro="What Saitlify collects and does with it today. Legal details are still to be completed and reviewed."
    >
      <LegalSection title="1. Who is responsible">
        <p>
          The data controller is <Todo>legal company name</Todo>, <Todo>registered address</Todo>. Privacy contact:{' '}
          <Todo>privacy contact email</Todo>.
        </p>
      </LegalSection>
      <LegalSection title="2. What we collect">
        <ul className="list-disc space-y-2 pl-6">
          <li>
            <strong>Account:</strong> your name, email address and a password stored only as a salted hash. We cannot read your password.
          </li>
          <li>
            <strong>Your websites:</strong> the answers you give in the creator, the websites you build and publish, their versions, and the data
            of any modules you switch on (for example form messages, orders or bookings your visitors send to your website).
          </li>
          <li>
            <strong>Billing:</strong> your plan and subscription status. Card details are entered on Stripe&apos;s pages and never reach Saitlify.
          </li>
          <li>
            <strong>Contact form:</strong> the name, email, subject and message you type. The message is sent by email to the Saitlify team.
          </li>
          <li>
            <strong>Error reports (only when error monitoring is switched on):</strong> when something breaks, a short technical report can be sent to an error-monitoring
            provider: the kind of error, the part of the program where it happened and the page address without its numbers and parameters. Reports do not contain
            messages, emails, passwords or cookies.
          </li>
          <li>
            <strong>Technical:</strong> abuse protection keeps counters keyed by a one-way hash of an IP address or email, not the address
            itself. Hosting providers may keep their own server logs.
          </li>
        </ul>
        <p>
          <Todo>Confirm this list against the final launch configuration, including hosting logs and any analytics added later</Todo>
        </p>
      </LegalSection>
      <LegalSection title="3. Cookies">
        <p>
          Saitlify sets one essential cookie when you sign in, to keep you signed in. It is not used for advertising or tracking. There are no
          analytics or advertising cookies on this website today.
        </p>
      </LegalSection>
      <LegalSection title="4. Why we use it and on what basis">
        <p>
          We use account and website data to provide the service you asked for, billing data to charge for paid plans, and contact messages to
          reply to you.
        </p>
        <p>
          <Todo>Legal basis for each purpose, as determined with a lawyer</Todo>
        </p>
      </LegalSection>
      <LegalSection title="5. Who receives your data">
        <p>
          Saitlify uses service providers to run: a hosting provider (Netlify), a database provider, Stripe for payments, Resend for sending
          email and, when switched on, an error-monitoring provider. Each receives only what it needs for its job.
        </p>
        <p>
          <Todo>Final list of providers, their locations and the transfer safeguards that apply</Todo>
        </p>
      </LegalSection>
      <LegalSection title="6. How long we keep it">
        <p>
          Your data is kept while your account exists. Deleting your account removes your profile, projects, published websites and their data.
        </p>
        <p>
          <Todo>Retention periods for backups, billing records required by law, and contact messages</Todo>
        </p>
      </LegalSection>
      <LegalSection title="7. Your rights and controls">
        <p>
          From the account page you can download a copy of your data, change your name, email and password, and delete your account.
        </p>
        <p>
          <Todo>Your legal rights and how to exercise them, as reviewed by a lawyer</Todo>
        </p>
      </LegalSection>
      <LegalSection title="8. Changes and contact">
        <p>
          <Todo>How changes are announced</Todo>
        </p>
        <p>Questions can be sent through the contact page.</p>
      </LegalSection>
    </LegalPage>
  );
}
