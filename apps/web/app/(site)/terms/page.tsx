import type { Metadata } from 'next';
import { LegalPage, LegalSection, Todo } from '../../../components/legal';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'Saitify terms of service (draft structure, pending legal review).',
  alternates: { canonical: '/terms' },
  openGraph: { url: '/terms', title: 'Terms of Service | Saitify' },
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      intro="These terms will describe how Saitify may be used. The product is still in development."
    >
      <LegalSection title="1. Who we are">
        <p>
          Saitify is operated by <Todo>legal company name</Todo>, registered at{' '}
          <Todo>registered address</Todo>, company number <Todo>registration number</Todo>,{' '}
          <Todo>VAT number, if applicable</Todo>.
        </p>
      </LegalSection>
      <LegalSection title="2. The service">
        <p>
          Saitify is intended to let you create and publish a website. The website creator is not
          available yet. This website currently only presents the product and accepts contact
          messages.
        </p>
        <p>
          <Todo>Final description of the service and its limits</Todo>
        </p>
      </LegalSection>
      <LegalSection title="3. Accounts">
        <p>
          <Todo>Account terms. Accounts do not exist yet.</Todo>
        </p>
      </LegalSection>
      <LegalSection title="4. Your content">
        <p>
          <Todo>Ownership of content you upload, licence granted to Saitify, and your responsibilities</Todo>
        </p>
      </LegalSection>
      <LegalSection title="5. Acceptable use">
        <p>
          <Todo>Rules about what may not be published</Todo>
        </p>
      </LegalSection>
      <LegalSection title="6. Pricing, billing and cancellation">
        <p>Pricing has not been announced. Billing does not exist yet.</p>
        <p>
          <Todo>Plans, billing terms, refunds and what happens to a website on cancellation</Todo>
        </p>
      </LegalSection>
      <LegalSection title="7. Liability and warranties">
        <p>
          <Todo>Limitations of liability and disclaimers, as reviewed by a lawyer</Todo>
        </p>
      </LegalSection>
      <LegalSection title="8. Changes to these terms">
        <p>
          <Todo>How and when changes are announced</Todo>
        </p>
      </LegalSection>
      <LegalSection title="9. Governing law and contact">
        <p>
          <Todo>Governing law and jurisdiction</Todo>
        </p>
        <p>Questions can be sent through the contact page.</p>
      </LegalSection>
    </LegalPage>
  );
}
