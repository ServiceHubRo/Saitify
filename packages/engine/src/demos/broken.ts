/** Deliberately invalid configuration. Used by tests and the playground to prove failures are safe. */
export const brokenDemo = {
  schemaVersion: 1,
  id: 'demo-broken',
  name: 'Broken demo',
  type: 'business',
  language: 'en',
  design: { palette: 'neon', style: 'minimal' },
  navigation: { items: [{ label: 'Ghost', page: 'missing' }, { label: 'Both', page: 'home', href: '/x' }] },
  regions: { header: { id: 'hdr', type: 'footer', content: {} } },
  pages: [
    {
      id: 'p-home', name: 'Home', slug: 'home', type: 'home',
      sections: [
        { id: 'ok', type: 'text', content: { heading: 'This section is valid', body: 'It renders even though others fail.' } },
        { id: 'unknown', type: 'carousel-3d', content: {} },
        { id: 'variant', type: 'hero', variant: 'nope', content: { heading: 'Invalid variant falls back to the default' } },
        { id: 'content', type: 'services', content: { heading: 'No items' } },
        { id: 'ok', type: 'text', content: { body: 'Duplicate id' } },
        { id: 'xss', type: 'text', content: { heading: '<script>alert(1)</script>', body: '<img src=x onerror=alert(1)>' } },
      ],
    },
    { id: 'p-home', name: 'Duplicate', slug: 'dup', sections: [] },
    'not a page',
  ],
};
