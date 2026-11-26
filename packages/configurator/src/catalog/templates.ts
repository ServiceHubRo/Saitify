import type { CategoryId, Template } from './types';

/**
 * Starting designs. A template only chooses variants and a default look; the content always comes
 * from the user's answers, and every page and section stays editable. Previews are rendered by the
 * real engine from the user's own configuration with the template applied.
 */
export const TEMPLATES: Template[] = [
  {
    id: 'clean-business',
    name: 'Clean business',
    description: 'Bright and direct, with a clear first impression and room for services.',
    categories: ['business', 'landing', 'booking', 'education', 'real-estate', 'events', 'community', 'other'],
    design: { style: 'minimal', palette: 'modern' },
    variants: { header: 'classic', hero: 'split', about: 'image-left', services: 'cards', features: 'horizontal', cta: 'banner', faq: 'split', contact: 'split', location: 'split', testimonials: 'cards', gallery: 'grid', footer: 'columns' },
    stickyHeader: true,
  },
  {
    id: 'studio-portfolio',
    name: 'Studio portfolio',
    description: 'Elegant and image-led, built to show your work.',
    categories: ['portfolio', 'other'],
    design: { style: 'premium', palette: 'premium' },
    variants: { header: 'centered', hero: 'centered', about: 'image-right', services: 'list', features: 'grid', cta: 'split', faq: 'single', contact: 'cards', location: 'stacked', testimonials: 'compact', gallery: 'masonry', footer: 'centered' },
  },
  {
    id: 'table-restaurant',
    name: 'Table & menu',
    description: 'Atmospheric and warm, with a menu-style list and a strong location.',
    categories: ['restaurant', 'other'],
    design: { style: 'premium', palette: 'bold' },
    variants: { header: 'minimal', hero: 'image', about: 'image-left', services: 'list', features: 'grid', cta: 'centered', faq: 'single', contact: 'split', location: 'stacked', testimonials: 'cards', gallery: 'grid', footer: 'columns' },
  },
];

export const getTemplate = (id: string | null | undefined): Template | undefined =>
  id ? TEMPLATES.find((t) => t.id === id) : undefined;

export const templatesFor = (category: CategoryId | null): Template[] =>
  category ? TEMPLATES.filter((t) => t.categories.includes(category)) : [];
