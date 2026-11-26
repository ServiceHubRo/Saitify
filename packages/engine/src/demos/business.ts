/** Demo: local service business (electrician). Exercises header, hero, services, stats, testimonials, FAQ, contact, location. */
export const businessDemo = {
  schemaVersion: 1,
  id: 'demo-business',
  name: 'Voltix Electric',
  type: 'business',
  language: 'en',
  status: 'draft',
  design: { palette: 'modern', style: 'minimal' },
  settings: {
    contact: { email: 'office@voltix.example', phone: '+40 700 000 000', address: '12 Example Street, Brașov' },
    social: [{ label: 'Facebook', href: 'https://facebook.com/' }],
  },
  navigation: {
    items: [
      { label: 'Home', page: 'home' },
      { label: 'Services', page: 'services' },
      { label: 'Contact', page: 'contact' },
    ],
  },
  metadata: { title: 'Voltix Electric | Licensed electricians', description: 'Residential and commercial electrical work.' },
  regions: {
    header: { id: 'hdr', type: 'header', variant: 'classic', content: { cta: { label: 'Get a quote', href: '/contact' }, sticky: true } },
    footer: { id: 'ftr', type: 'footer', content: { description: 'Safe, certified electrical work since 2012.', legalLinks: [{ label: 'Privacy', href: '/privacy' }] } },
  },
  pages: [
    {
      id: 'p-home', name: 'Home', slug: 'home', type: 'home', order: 0,
      sections: [
        { id: 'hero', type: 'hero', variant: 'split', content: {
          badge: 'Licensed & insured', heading: 'Electrical work done right, the first time',
          subtitle: 'Installations, repairs and inspections for homes and small businesses.',
          primaryCta: { label: 'Get a quote', href: '/contact' }, secondaryCta: { label: 'Our services', href: '/services' },
          image: { src: 'placeholder:electric', alt: 'Electrician working on a panel' }, decoration: 'glow' } },
        { id: 'stats', type: 'stats', variant: 'row', content: { items: [
          { value: '12+', label: 'Years of experience' }, { value: '800', label: 'Projects completed' }, { value: '24/7', label: 'Emergency line' } ] } },
        { id: 'svc', type: 'services', variant: 'cards', content: { eyebrow: 'What we do', heading: 'Services', items: [
          { title: 'Home wiring', description: 'New installations and full rewiring.', icon: 'home' },
          { title: 'Repairs', description: 'Fast diagnosis and safe fixes.', icon: 'tool' },
          { title: 'Inspections', description: 'Certified safety checks.', icon: 'shield' } ] } },
        { id: 'feat', type: 'features', variant: 'horizontal', style: { tone: 'surface' }, content: { heading: 'Why customers choose us', items: [
          { title: 'On time', description: 'We arrive when we say we will.', icon: 'clock' },
          { title: 'Fair pricing', description: 'Written quotes, no surprises.', icon: 'check' } ] } },
        { id: 'tst', type: 'testimonials', variant: 'cards', content: { heading: 'Customer stories', items: [
          { quote: 'Clean work and clear communication from start to finish.', name: 'Ana P.', role: 'Homeowner' },
          { quote: 'They fixed in an hour what others could not in a week.', name: 'Mihai D.', role: 'Shop owner' } ] } },
        { id: 'cta', type: 'cta', variant: 'banner', content: { heading: 'Need an electrician?', description: 'Tell us about your project.', primaryCta: { label: 'Request a quote', href: '/contact' } } },
      ],
    },
    {
      id: 'p-services', name: 'Services', slug: 'services', order: 1, title: 'Services',
      sections: [
        { id: 'svc-list', type: 'services', variant: 'list', content: { heading: 'Services and prices', items: [
          { title: 'Call-out and diagnosis', price: 'from 150 RON' }, { title: 'Socket or switch replacement', price: 'from 80 RON' }, { title: 'Full panel upgrade', price: 'quote' } ] } },
        { id: 'faq', type: 'faq', variant: 'split', content: { heading: 'Questions', items: [
          { q: 'Do you offer emergency service?', a: 'Yes, call our emergency line any time.' },
          { q: 'Are you insured?', a: 'Yes. Proof of insurance is available on request.' } ] } },
      ],
    },
    {
      id: 'p-contact', name: 'Contact', slug: 'contact', order: 2, title: 'Contact',
      sections: [
        { id: 'contact', type: 'contact', variant: 'split', content: { heading: 'Talk to us', description: 'We reply within one working day.', hours: [{ label: 'Mon–Fri', value: '08:00–18:00' }, { label: 'Sat', value: '09:00–13:00' }] } },
        { id: 'loc', type: 'location', variant: 'split', content: { heading: 'Visit the workshop', address: '12 Example Street, Brașov', hours: [{ label: 'Mon–Fri', value: '08:00–18:00' }] } },
      ],
    },
  ],
};
