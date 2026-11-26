import { createRegistry } from '../registry/registry';
import { aboutBlock } from './about';
import { contactBlock } from './contact';
import { ctaBlock } from './cta';
import { faqBlock } from './faq';
import { featuresBlock } from './features';
import { footerBlock } from './footer';
import { galleryBlock } from './gallery';
import { headerBlock } from './header';
import { heroBlock } from './hero';
import { locationBlock } from './location';
import { servicesBlock } from './services';
import { statsBlock } from './stats';
import { testimonialsBlock } from './testimonials';
import { textBlock } from './text';

export const INITIAL_BLOCKS = [
  headerBlock,
  heroBlock,
  textBlock,
  aboutBlock,
  servicesBlock,
  featuresBlock,
  galleryBlock,
  testimonialsBlock,
  statsBlock,
  ctaBlock,
  faqBlock,
  contactBlock,
  locationBlock,
  footerBlock,
];

/** Registry with the initial block library. New blocks: `defaultRegistry.register(myBlock)`. */
export const defaultRegistry = createRegistry(INITIAL_BLOCKS);
