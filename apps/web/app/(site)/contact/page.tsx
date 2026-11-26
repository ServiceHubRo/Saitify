import type { Metadata } from 'next';
import Link from 'next/link';
import { ContactForm } from '../../../components/contact-form';
import { Badge, Container } from '../../../components/ui';
import { subjectForTopic } from '../../../lib/contact';

export const metadata: Metadata = {
  title: 'Contact',
  description: 'Get in touch with Saitify or request early access.',
  alternates: { canonical: '/contact' },
  openGraph: { url: '/contact', title: 'Contact | Saitify' },
};

export default async function ContactPage({
  searchParams,
}: {
  searchParams: Promise<{ topic?: string | string[] }>;
}) {
  const { topic } = await searchParams;
  const topicValue = Array.isArray(topic) ? topic[0] : topic;
  const earlyAccess = topicValue === 'early-access';
  const pricing = topicValue === 'pricing';

  return (
    <section className="bg-cloud py-14 sm:py-20">
      <Container>
        <div className="grid gap-10 lg:grid-cols-[1fr_1.2fr] lg:gap-16">
          <div>
            <Badge>{earlyAccess ? 'Early access' : pricing ? 'Pricing' : 'Contact'}</Badge>
            <h1 className="mt-5 text-4xl font-semibold tracking-tight text-midnight sm:text-5xl [text-wrap:balance]">
              {earlyAccess ? 'Get early access' : pricing ? 'Tell us you are interested' : 'Get in touch'}
            </h1>
            <p className="mt-5 text-lg leading-relaxed text-midnight/70">
              {earlyAccess
                ? 'The Saitify website creator is in development. Leave your details and we will let you know when you can create your website.'
                : pricing
                  ? 'Pricing has not been announced yet. Leave your details and we will contact you when it is ready.'
                  : 'Questions, feedback or ideas? Send us a message and we will reply by email.'}
            </p>
            <p className="mt-6 rounded-2xl bg-white p-5 text-sm leading-relaxed text-midnight/65">
              We only use your details to reply to your message. See the{' '}
              <Link href="/privacy" className="font-semibold text-violet hover:underline">
                privacy page
              </Link>{' '}
              for what this website collects.
            </p>
          </div>
          <div className="relative rounded-3xl border border-midnight/10 bg-white p-6 shadow-xl shadow-midnight/5 sm:p-9">
            <ContactForm initialSubject={subjectForTopic(topicValue)} />
          </div>
        </div>
      </Container>
    </section>
  );
}
