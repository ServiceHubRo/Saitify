import type { Lang, PageKey } from './types';

type Dict = Record<string, string>;

const en: Dict = {
  'page.home': 'Home', 'page.about': 'About', 'page.services': 'Services', 'page.products': 'Products',
  'page.portfolio': 'Portfolio', 'page.gallery': 'Gallery', 'page.contact': 'Contact', 'page.faq': 'FAQ',
  'page.pricing': 'Pricing', 'page.testimonials': 'Testimonials', 'page.team': 'Team', 'page.locations': 'Locations',
  'page.menu': 'Menu', 'page.courses': 'Courses', 'page.events': 'Events', 'page.custom': 'New page',
  'cta.contact': 'Contact us',
  'cta.call': 'Call us',
  'contact.heading': 'Get in touch',
  'contact.text': 'We would love to hear from you.',
  'about.heading': 'About {name}',
  'items.business': 'What we do', 'items.landing': 'What you get', 'items.store': 'Product categories',
  'items.portfolio': 'Types of work', 'items.blog': 'Topics we cover', 'items.restaurant': 'From our kitchen',
  'items.booking': 'Services you can book', 'items.real-estate': 'What we handle', 'items.education': 'What you can learn',
  'items.events': 'What to expect', 'items.community': 'What members get', 'items.directory': 'What you will find',
  'items.other': 'What we offer',
  'cta.heading': 'Ready to get started?',
  'cta.text': 'Tell us about your project and we will get back to you.',
  'gallery.heading': 'Gallery',
  'portfolio.heading': 'Selected work',
  'testimonials.heading': 'What people say',
  'faq.heading': 'Frequently asked questions',
  'team.heading': 'Meet the team',
  'location.heading': 'Find us',
  'pricing.heading': 'Pricing',
  'pricing.text': 'Every project is different. Contact us for a quote that fits.',
  'ph.title': 'Item name',
  'ph.text': 'Write a short description here.',
  'ph.quote': 'Add a real customer quote here.',
  'ph.name': 'Customer name',
  'ph.question': 'Add a question',
  'ph.answer': 'Write the answer here.',
  'ph.member': 'Team member',
  'ph.role': 'Role and a short introduction.',
  'ph.page': 'Write the content of this page.',
  'ph.alt': 'Describe this picture',
  'gallery.image': 'Picture {n}',
  'mod.blog': 'Blog', 'mod.shop': 'Shop', 'mod.cart': 'Cart', 'mod.book': 'Book online', 'mod.events': 'Events', 'mod.directory': 'Directory',
  'mod.account': 'Account', 'mod.courses': 'Courses',
  'mod.blog.heading': 'Latest posts', 'mod.shop.heading': 'Shop', 'mod.cart.heading': 'Your cart', 'mod.book.heading': 'Book an appointment',
  'mod.events.heading': 'Upcoming events', 'mod.directory.heading': 'Directory', 'mod.account.heading': 'Members', 'mod.courses.heading': 'Courses',
  'mod.form.heading': 'Send us a message',
};

const ro: Dict = {
  'page.home': 'Acasă', 'page.about': 'Despre noi', 'page.services': 'Servicii', 'page.products': 'Produse',
  'page.portfolio': 'Portofoliu', 'page.gallery': 'Galerie', 'page.contact': 'Contact', 'page.faq': 'Întrebări frecvente',
  'page.pricing': 'Prețuri', 'page.testimonials': 'Recenzii', 'page.team': 'Echipa', 'page.locations': 'Locații',
  'page.menu': 'Meniu', 'page.courses': 'Cursuri', 'page.events': 'Evenimente', 'page.custom': 'Pagină nouă',
  'cta.contact': 'Contactează-ne',
  'cta.call': 'Sună-ne',
  'contact.heading': 'Intră în legătură',
  'contact.text': 'Ne face plăcere să auzim de la tine.',
  'about.heading': 'Despre {name}',
  'items.business': 'Ce facem', 'items.landing': 'Ce primești', 'items.store': 'Categorii de produse',
  'items.portfolio': 'Tipuri de lucrări', 'items.blog': 'Subiectele noastre', 'items.restaurant': 'Din bucătăria noastră',
  'items.booking': 'Servicii pe care le poți rezerva', 'items.real-estate': 'Cu ce ne ocupăm', 'items.education': 'Ce poți învăța',
  'items.events': 'La ce să te aștepți', 'items.community': 'Ce primesc membrii', 'items.directory': 'Ce vei găsi',
  'items.other': 'Ce oferim',
  'cta.heading': 'Gata să începem?',
  'cta.text': 'Spune-ne despre proiectul tău și revenim cu un răspuns.',
  'gallery.heading': 'Galerie',
  'portfolio.heading': 'Lucrări alese',
  'testimonials.heading': 'Ce spun oamenii',
  'faq.heading': 'Întrebări frecvente',
  'team.heading': 'Cunoaște echipa',
  'location.heading': 'Unde ne găsești',
  'pricing.heading': 'Prețuri',
  'pricing.text': 'Fiecare proiect e diferit. Contactează-ne pentru o ofertă potrivită.',
  'ph.title': 'Numele elementului',
  'ph.text': 'Scrie aici o scurtă descriere.',
  'ph.quote': 'Adaugă aici o recenzie reală.',
  'ph.name': 'Numele clientului',
  'ph.question': 'Adaugă o întrebare',
  'ph.answer': 'Scrie aici răspunsul.',
  'ph.member': 'Membru al echipei',
  'ph.role': 'Rol și o scurtă prezentare.',
  'ph.page': 'Scrie aici conținutul paginii.',
  'ph.alt': 'Descrie imaginea',
  'gallery.image': 'Imaginea {n}',
  'mod.blog': 'Blog', 'mod.shop': 'Magazin', 'mod.cart': 'Coș', 'mod.book': 'Programare online', 'mod.events': 'Evenimente', 'mod.directory': 'Director',
  'mod.account': 'Cont', 'mod.courses': 'Cursuri',
  'mod.blog.heading': 'Cele mai noi articole', 'mod.shop.heading': 'Magazin', 'mod.cart.heading': 'Coșul tău', 'mod.book.heading': 'Programează-te',
  'mod.events.heading': 'Evenimente viitoare', 'mod.directory.heading': 'Director', 'mod.account.heading': 'Membri', 'mod.courses.heading': 'Cursuri',
  'mod.form.heading': 'Trimite-ne un mesaj',
};

const DICTS: Record<Lang, Dict> = { en, ro };

/** Generated-content strings. Falls back to English, never to a raw key. */
export function t(lang: Lang, key: string, vars: Record<string, string> = {}): string {
  const raw = DICTS[lang]?.[key] ?? en[key] ?? key;
  return raw.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? '');
}

export function defaultPageName(lang: Lang, key: PageKey): string {
  return t(lang, `page.${key}`);
}
