import type { Metadata } from 'next';
import { LegalPage, LegalSection, Todo } from '../../../components/legal';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'How this Saitify website handles personal data (draft structure, pending legal review).',
  alternates: { canonical: '/privacy' },
  openGraph: { url: '/privacy', title: 'Privacy Policy | Saitify' },
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro="What this website collects today, and what still has to be completed before launch."
    >
      <LegalSection title="1. Who is responsible">
        <p>
          The data controller is <Todo>legal company name</Todo>, <Todo>registered address</Todo>.
          Privacy contact: <Todo>privacy contact email</Todo>.
        </p>
      </LegalSection>
      <LegalSection title="2. What this website collects today">
        <p>
          When you use the contact form, the website receives the name, email address, subject and
          message you type. Nothing else is asked for.
        </p>
        <p>
          The website does not currently set advertising or analytics cookies, and there are no user
          accounts.
        </p>
        <p>
          <Todo>Confirm this list against the final launch configuration, including hosting logs and any analytics</Todo>
        </p>
      </LegalSection>
      <LegalSection title="3. Why and on what basis">
        <p>
          Contact form details are used to reply to your message.{' '}
          <Todo>Legal basis, as determined with a lawyer</Todo>
        </p>
      </LegalSection>
      <LegalSection title="4. Who receives your data">
        <p>
          <Todo>Email delivery provider and hosting provider, once chosen</Todo>
        </p>
      </LegalSection>
      <LegalSection title="5. How long we keep it">
        <p>
          <Todo>Retention period for contact messages</Todo>
        </p>
      </LegalSection>
      <LegalSection title="6. Your rights">
        <p>
          <Todo>Your rights and how to exercise them, as reviewed by a lawyer</Todo>
        </p>
      </LegalSection>
      <LegalSection title="7. Changes and contact">
        <p>
          <Todo>How changes are announced</Todo>
        </p>
        <p>Questions can be sent through the contact page.</p>
      </LegalSection>
    </LegalPage>
  );
}
