import type { Metadata } from 'next';
import { LegalPage, LegalSection, Todo } from '../../../components/legal';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'Saitlify terms of service (draft pending legal review).',
  alternates: { canonical: '/terms' },
  openGraph: { url: '/terms', title: 'Terms of Service | Saitlify' },
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      intro="How Saitlify may be used. Saitlify is in beta; these terms are a draft until they have been reviewed."
    >
      <LegalSection title="1. Who we are">
        <p>
          Saitlify is operated by <Todo>legal company name</Todo>, registered at <Todo>registered address</Todo>, company number{' '}
          <Todo>registration number</Todo>, <Todo>VAT number, if applicable</Todo>.
        </p>
      </LegalSection>
      <LegalSection title="2. The service">
        <p>
          Saitlify lets you create, edit and publish websites with a guided creator and a visual editor, and optionally add modules such as a
          blog, forms, bookings, events, a directory, courses, memberships and a simple online store, depending on your plan. Published websites
          are served at a Saitlify address. The service is in beta and may change.
        </p>
        <p>
          <Todo>Final description of the service, availability commitments and its limits</Todo>
        </p>
      </LegalSection>
      <LegalSection title="3. Accounts">
        <p>
          You need an account to create or manage websites. You are responsible for keeping your password safe and for what happens under your
          account. You can change your password, export your data and delete your account from the account page.
        </p>
        <p>
          <Todo>Eligibility, account termination by Saitlify and related terms</Todo>
        </p>
      </LegalSection>
      <LegalSection title="4. Your content">
        <p>
          You keep what you create. You are responsible for the text, images and other material you publish, and for having the right to use it.
        </p>
        <p>
          <Todo>Licence granted to Saitlify to host and display your content, and your warranties</Todo>
        </p>
      </LegalSection>
      <LegalSection title="5. Acceptable use">
        <p>
          <Todo>Rules about what may not be published, and how reports of abuse are handled</Todo>
        </p>
      </LegalSection>
      <LegalSection title="6. Plans, billing and cancellation">
        <p>
          The Free plan needs no payment details. Paid plans are billed through Stripe, and their prices and limits are the ones shown on the
          Pricing page. You can cancel from the Billing page; paid features then stay available until the end of the period you paid for.
          Cancelling or changing plan never deletes your projects or published websites; new limits only apply to creating and publishing more.
          Deleting your account cancels an active subscription first.
        </p>
        <p>
          <Todo>Refund policy, taxes, price changes and payment failure terms</Todo>
        </p>
      </LegalSection>
      <LegalSection title="7. Online stores and other modules">
        <p>
          The online store records orders and stock for you; Saitlify does not process card payments for your customers. You are responsible
          for how you collect payment, for what you sell and for your obligations to your own customers.
        </p>
      </LegalSection>
      <LegalSection title="8. Liability and warranties">
        <p>
          <Todo>Limitations of liability and disclaimers, as reviewed by a lawyer</Todo>
        </p>
      </LegalSection>
      <LegalSection title="9. Changes to these terms">
        <p>
          <Todo>How and when changes are announced</Todo>
        </p>
      </LegalSection>
      <LegalSection title="10. Governing law and contact">
        <p>
          <Todo>Governing law and jurisdiction</Todo>
        </p>
        <p>Questions can be sent through the contact page.</p>
      </LegalSection>
    </LegalPage>
  );
}
