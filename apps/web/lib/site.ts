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

export const JOURNEY = [
  { title: 'Create a free account', text: 'An account keeps your work saved and private. You do not need a card to start.' },
  { title: 'Choose a template or start from scratch', text: 'Pick one of the starting designs, or tell us what kind of website you are building and we choose the structure.' },
  { title: 'Tell us about your business', text: 'Your name, what you offer and how people can reach you. This becomes the first draft of your website.' },
  { title: 'Review the generated website', text: 'Pages, sections and design are generated from your answers. You see exactly what will be created before it is saved.' },
  { title: 'Edit and preview', text: 'Change text, colours, style and sections in the visual editor, and check desktop, tablet and mobile views.' },
  { title: 'Publish', text: 'When you are happy, publish. Saitlify checks your website and puts it online at a free address you can share. Edit and publish again whenever you like.' },
] as const;

export const FAQ_GROUPS: ReadonlyArray<{
  title: string;
  items: ReadonlyArray<{ q: string; a: string }>;
}> = [
  {
    title: 'Getting started',
    items: [
      {
        q: 'How do I create my website?',
        a: 'Create a free account, choose a template or start from scratch, answer a few questions about your business and review the generated website. Then edit it in the visual editor and publish it.',
      },
      {
        q: 'Is Saitlify finished?',
        a: 'Saitlify is in beta. The creator, editor, publishing and optional modules work today, and we are still improving them. If something does not work as you expect, please tell us on the contact page.',
      },
    ],
  },
  {
    title: 'Coding',
    items: [
      {
        q: 'Do I need coding experience?',
        a: 'No. You work with text, colours and sections, never code.',
      },
    ],
  },
  {
    title: 'Editing and templates',
    items: [
      {
        q: 'Can I edit my website later?',
        a: 'Yes. Open your project from the dashboard, change text, colours, layout and sections in the visual editor, and publish again when you are ready.',
      },
      {
        q: 'Can I use my own logo and images?',
        a: 'You can add images and a logo by their web address (a link). Uploading files from your computer is not available yet.',
      },
      {
        q: 'Can I create multiple websites?',
        a: 'The Free plan includes one published website. Paid plans can include more, and each plan lists exactly how many on the Pricing page.',
      },
      {
        q: 'Can I choose a template?',
        a: 'Yes. Browse the Templates page and choose "Use this template", or pick one inside the creator. You can also start without a template.',
      },
    ],
  },
  {
    title: 'Mobile',
    items: [
      {
        q: 'Will my website work on mobile?',
        a: 'Yes. Websites are designed to work on phones, tablets and desktops, and you can preview each size in the editor before publishing.',
      },
    ],
  },
  {
    title: 'Publishing and domains',
    items: [
      {
        q: 'How do I publish?',
        a: 'Press Publish in your project. Saitlify checks the website first and tells you plainly if something needs fixing, then puts it online. Earlier published versions can be restored.',
      },
      {
        q: 'Can I use my own domain?',
        a: 'Not yet. Your website is published at a free Saitlify address. Custom domains are something we want to support but they are not available today.',
      },
    ],
  },
  {
    title: 'Pricing and subscription',
    items: [
      {
        q: 'How much does Saitlify cost?',
        a: 'You can start on the Free plan without a card. Paid plans are listed with their real prices and limits on the Pricing page.',
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
        a: 'Use the contact form and we will reply by email. If you see an error when sending, please try again a little later.',
      },
    ],
  },
];
