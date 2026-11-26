export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://saitify.ro';

export const SITE = {
  name: 'Saitlify',
  tagline: 'Your idea. Your website.',
  description:
    'Create a beautiful, professional website for your business without coding or complicated tools.',
} as const;

export const CTA_HREF = '/create';

export const NAV = [
  { label: 'Features', href: '/features' },
  { label: 'Templates', href: '/templates' },
  { label: 'How it works', href: '/how-it-works' },
  { label: 'Pricing', href: '/pricing' },
] as const;

export const FOOTER_GROUPS = [
  {
    title: 'Product',
    links: [
      { label: 'Features', href: '/features' },
      { label: 'Templates', href: '/templates' },
      { label: 'How it works', href: '/how-it-works' },
      { label: 'Pricing', href: '/pricing' },
    ],
  },
  {
    title: 'Support',
    links: [
      { label: 'FAQ', href: '/faq' },
      { label: 'Contact', href: '/contact' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Terms', href: '/terms' },
      { label: 'Privacy', href: '/privacy' },
    ],
  },
] as const;

/** Every public route, used by the sitemap. */
export const ROUTES = [
  '/',
  '/features',
  '/how-it-works',
  '/templates',
  '/pricing',
  '/faq',
  '/contact',
  '/terms',
  '/privacy',
] as const;

export const HOME_STEPS = [
  { title: 'Tell us about your business', text: 'Share what you do and who you do it for.' },
  { title: 'Choose your design', text: 'Pick a look from a curated set of professional designs.' },
  { title: 'Customize your website', text: 'Make it yours with your own words, logo and images.' },
  { title: 'Publish it online', text: 'Put your website live and share it with your customers.' },
] as const;

export const JOURNEY = [
  {
    title: 'Choose the type of website',
    text: 'Start from what you are building: a business presence, a portfolio, a service page or something else. This tells Saitlify which structure fits you best.',
  },
  {
    title: 'Tell us about your business',
    text: 'Add your business name, what you offer and how people can reach you. This becomes the starting content of your website.',
  },
  {
    title: 'Choose the visual design',
    text: 'Browse a curated set of designs and pick the one that feels right. Colors and style are adjustable later.',
  },
  {
    title: 'Choose pages and features',
    text: 'Select the pages you need, such as Home, About, Services and Contact, and the sections that go on each.',
  },
  {
    title: 'Preview and customize',
    text: 'See your website take shape, then adjust text, images and design settings until it looks right on desktop and mobile.',
  },
  {
    title: 'Publish',
    text: 'When you are happy, publish. Your website goes online at an address you can share.',
  },
] as const;

export type TemplateVariant =
  | 'beauty'
  | 'construction'
  | 'photography'
  | 'consulting'
  | 'fitness'
  | 'restaurant';

export const TEMPLATES: ReadonlyArray<{
  id: TemplateVariant;
  name: string;
  category: string;
  description: string;
}> = [
  {
    id: 'beauty',
    name: 'Atelier',
    category: 'Beauty',
    description: 'Soft, airy and elegant. For salons, studios and wellness practices.',
  },
  {
    id: 'construction',
    name: 'Foundry',
    category: 'Construction',
    description: 'Solid and confident. For builders, installers and trades.',
  },
  {
    id: 'photography',
    name: 'Aperture',
    category: 'Photography',
    description: 'Image-first and quiet. Lets a portfolio do the talking.',
  },
  {
    id: 'consulting',
    name: 'Meridian',
    category: 'Consulting',
    description: 'Clear and credible. For advisors, coaches and independent experts.',
  },
  {
    id: 'fitness',
    name: 'Pulse',
    category: 'Fitness',
    description: 'Bold and energetic. For trainers, gyms and studios.',
  },
  {
    id: 'restaurant',
    name: 'Saffron',
    category: 'Restaurant and cafe',
    description: 'Warm and inviting. For restaurants, cafes and bakeries.',
  },
];

export const FAQ_GROUPS: ReadonlyArray<{
  title: string;
  items: ReadonlyArray<{ q: string; a: string }>;
}> = [
  {
    title: 'Getting started',
    items: [
      {
        q: 'How do I create my website?',
        a: 'Saitlify is being built so that you answer a few questions about your business, pick a design, customize it and publish. The website creator is still in development. You can request early access on the contact page and we will let you know when it opens.',
      },
      {
        q: 'Is Saitlify available today?',
        a: 'Not yet. This website presents the product we are building. Nothing you see in the previews is a working editor yet.',
      },
    ],
  },
  {
    title: 'Coding',
    items: [
      {
        q: 'Do I need coding experience?',
        a: 'No. Saitlify is designed for people with no technical background. You work with text, images and design choices, never code.',
      },
    ],
  },
  {
    title: 'Editing and templates',
    items: [
      {
        q: 'Can I edit my website later?',
        a: 'Yes, that is the plan. You will be able to return and change text, images and design whenever you like. This is part of the product we are building and is not available yet.',
      },
      {
        q: 'Can I use my own logo and images?',
        a: 'Yes, that is planned. Your own logo and images are a core part of making a website yours.',
      },
      {
        q: 'Can I create multiple websites?',
        a: 'The Free plan includes one published website. Paid plans can include more, and each plan lists exactly how many on the Pricing page.',
      },
      {
        q: 'Can I choose a template?',
        a: 'You can browse design previews on the Templates page today. Choosing and applying a template comes with the website creator and is not available yet.',
      },
    ],
  },
  {
    title: 'Mobile',
    items: [
      {
        q: 'Will my website work on mobile?',
        a: 'Yes. Websites created with Saitlify are designed to work well on phones, tablets and desktop screens.',
      },
    ],
  },
  {
    title: 'Publishing and domains',
    items: [
      {
        q: 'How do I publish?',
        a: 'Publishing is planned as a single step: when you are ready, you publish and your website goes online. It is not available yet.',
      },
      {
        q: 'Can I use my own domain?',
        a: 'Connecting your own domain is something we want to support, but the details are not decided yet. We will confirm it before launch.',
      },
    ],
  },
  {
    title: 'Pricing and subscription',
    items: [
      {
        q: 'How much does Saitlify cost?',
        a: 'You can start on the Free plan without a card. Paid plans, when available, are listed with their real prices on the Pricing page.',
      },
      {
        q: 'What happens if I cancel?',
        a: 'You can cancel any time from the Billing page and keep your paid features until the period you paid for ends. Your projects and websites are never deleted because of cancellation or a plan change; new limits only apply to creating and publishing more.',
      },
    ],
  },
  {
    title: 'Support',
    items: [
      {
        q: 'How can I reach you?',
        a: 'Use the contact form. Messages cannot be delivered until our email connection is configured, so if you see an error, please try again later.',
      },
    ],
  },
];
