/**
 * Demo: restaurant. The menu is the reusable `services` block: items carry an optional price, so no
 * restaurant-specific block (and no ordering module) is needed.
 */
export const restaurantDemo = {
  schemaVersion: 1,
  id: 'demo-restaurant',
  name: 'Casa Brașov',
  type: 'restaurant',
  language: 'en',
  status: 'draft',
  design: { palette: 'bold', style: 'premium' },
  settings: { contact: { email: 'table@casa.example', phone: '+40 700 111 222', address: '5 Piața Sfatului, Brașov' } },
  navigation: { items: [{ label: 'Home', page: 'home' }, { label: 'Menu', page: 'menu' }, { label: 'Find us', page: 'visit' }] },
  metadata: { title: 'Casa Brașov | Transylvanian kitchen', description: 'Seasonal Transylvanian dishes in the old town.' },
  regions: {
    header: { id: 'hdr', type: 'header', variant: 'minimal', content: { cta: { label: 'Call to reserve', href: 'tel:+40700111222' } } },
    footer: { id: 'ftr', type: 'footer', variant: 'columns', content: { description: 'Seasonal Transylvanian cooking.' } },
  },
  pages: [
    {
      id: 'p-home', name: 'Home', slug: 'home', type: 'home', order: 0,
      sections: [
        { id: 'hero', type: 'hero', variant: 'image', content: { badge: 'Old town', heading: 'Transylvanian cooking, by the fire', subtitle: 'Local ingredients, slow recipes, generous plates.', primaryCta: { label: 'See the menu', href: '/menu' }, backgroundImage: { src: 'placeholder:dining', alt: 'Dining room lit by candles' } } },
        { id: 'about', type: 'about', variant: 'image-left', content: { heading: 'A table for everyone', description: 'Our kitchen works with farms within an hour of the city.', image: { src: 'placeholder:kitchen', alt: 'Chef plating a dish' }, highlights: ['Seasonal menu', 'Vegetarian options'] } },
        { id: 'feat', type: 'features', variant: 'grid', content: { heading: 'The details', items: [
          { title: 'Wood-fired', description: 'Cooked over beech wood.', icon: 'sparkle' }, { title: 'Local', description: 'Producers we know by name.', icon: 'leaf' }, { title: 'Warm', description: 'Walk-ins welcome.', icon: 'heart' } ] } },
      ],
    },
    {
      id: 'p-menu', name: 'Menu', slug: 'menu', order: 1, title: 'Menu',
      sections: [
        { id: 'starters', type: 'services', variant: 'list', content: { eyebrow: 'Starters', heading: 'To begin', items: [
          { title: 'Zacuscă on toasted bread', description: 'Roasted aubergine and pepper spread.', price: '18 RON' }, { title: 'Ciorbă of the day', price: '22 RON' } ] } },
        { id: 'mains', type: 'services', variant: 'image-cards', style: { tone: 'surface' }, content: { eyebrow: 'Mains', heading: 'From the fire', items: [
          { title: 'Smoked pork knuckle', description: 'With sauerkraut and mustard.', price: '58 RON', image: { src: 'placeholder:pork', alt: 'Pork knuckle' } },
          { title: 'Trout with herbs', description: 'River trout, potatoes, dill.', price: '52 RON', image: { src: 'placeholder:trout', alt: 'Grilled trout' } } ] } },
      ],
    },
    {
      id: 'p-visit', name: 'Find us', slug: 'visit', order: 2, title: 'Find us',
      sections: [
        { id: 'loc', type: 'location', variant: 'stacked', content: { heading: 'Visit', address: '5 Piața Sfatului, Brașov', hours: [{ label: 'Tue–Sun', value: '12:00–23:00' }, { label: 'Mon', value: 'Closed' }] } },
        { id: 'faq', type: 'faq', variant: 'single', content: { heading: 'Good to know', items: [
          { q: 'Do I need a reservation?', a: 'Walk-ins are welcome; call to reserve for groups.' }, { q: 'Are there vegetarian dishes?', a: 'Yes, several. Ask your server.' } ] } },
      ],
    },
  ],
};
