/** Demo: photographer portfolio. Exercises gallery (grid + masonry), about, text, centered header, premium style. */
export const portfolioDemo = {
  schemaVersion: 1,
  id: 'demo-portfolio',
  name: 'Lena Moraru',
  type: 'portfolio',
  language: 'en',
  status: 'draft',
  design: { palette: 'premium', style: 'premium' },
  settings: { contact: { email: 'hello@lena.example' }, social: [{ label: 'Instagram', href: 'https://instagram.com/' }] },
  navigation: { items: [{ label: 'Work', page: 'work' }, { label: 'About', page: 'about' }, { label: 'Contact', page: 'contact' }] },
  metadata: { title: 'Lena Moraru | Photographer', description: 'Portrait and travel photography.' },
  regions: {
    header: { id: 'hdr', type: 'header', variant: 'centered', content: { cta: { label: 'Book a session', href: '/contact' } } },
    footer: { id: 'ftr', type: 'footer', variant: 'centered', content: { showContact: true } },
  },
  pages: [
    {
      id: 'p-home', name: 'Work', slug: 'work', type: 'home', order: 0,
      sections: [
        { id: 'hero', type: 'hero', variant: 'centered', content: { heading: 'Photography with a quiet eye', subtitle: 'Portraits, travel and stories told in natural light.', primaryCta: { label: 'See the work', href: '#s-gal' }, decoration: 'none' } },
        { id: 'gal', type: 'gallery', variant: 'masonry', content: { heading: 'Selected work', images: [
          { src: 'placeholder:one', alt: 'Portrait in window light', ratio: 'portrait', caption: 'Window light' },
          { src: 'placeholder:two', alt: 'Mountain road at dawn', ratio: 'landscape' },
          { src: 'placeholder:three', alt: 'Detail of a hand', ratio: 'square' },
          { src: 'placeholder:four', alt: 'Market in the morning', ratio: 'landscape', caption: 'Morning market' },
          { src: 'placeholder:five', alt: 'Silhouette on a pier', ratio: 'portrait' },
          { src: 'placeholder:six', alt: 'Street at dusk', ratio: 'square' } ] } },
        { id: 'quote', type: 'testimonials', variant: 'compact', content: { items: [{ quote: 'Lena made us feel at ease, and the photos still take our breath away.', name: 'Irina & Paul' }] } },
      ],
    },
    {
      id: 'p-about', name: 'About', slug: 'about', order: 1, title: 'About',
      sections: [
        { id: 'about', type: 'about', variant: 'image-right', content: { eyebrow: 'About', heading: 'Hello, I am Lena', description: 'I have photographed people and places for ten years.\n\nI believe the best pictures happen when nobody is performing.', image: { src: 'placeholder:lena', alt: 'Portrait of Lena' }, highlights: ['Based in Brașov', 'Available for travel'] } },
        { id: 'gal2', type: 'gallery', variant: 'grid', style: { tone: 'surface' }, content: { heading: 'Behind the scenes', images: [
          { src: 'placeholder:b1', alt: 'Camera bag' }, { src: 'placeholder:b2', alt: 'Editing desk' }, { src: 'placeholder:b3', alt: 'Location scouting' } ] } },
      ],
    },
    {
      id: 'p-contact', name: 'Contact', slug: 'contact', order: 2, title: 'Contact',
      sections: [
        { id: 'contact', type: 'contact', variant: 'cards', content: { heading: 'Book a session', description: 'Tell me what you have in mind.' } },
        { id: 'cta', type: 'cta', variant: 'split', content: { heading: 'Prefer email?', primaryCta: { label: 'Write to Lena', href: 'mailto:hello@lena.example' } } },
      ],
    },
  ],
};
