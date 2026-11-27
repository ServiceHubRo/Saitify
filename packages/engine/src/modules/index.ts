export * from './data';
export { richBlockSchema, richContentSchema, richText, videoEmbed, RichContent, type RichBlock } from './content';
export { formBlock } from './form-block';
export { blogBlock } from './blog-block';
export { storeBlock, cartBlock } from './store-block';
export { bookingBlock } from './booking-block';
export { eventsBlock } from './events-block';
export { directoryBlock } from './directory-block';
export { memberAreaBlock, membersOnlyBlock } from './members-block';
export { coursesBlock } from './courses-block';

import { formBlock } from './form-block';
import { blogBlock } from './blog-block';
import { storeBlock, cartBlock } from './store-block';
import { bookingBlock } from './booking-block';
import { eventsBlock } from './events-block';
import { directoryBlock } from './directory-block';
import { memberAreaBlock, membersOnlyBlock } from './members-block';
import { coursesBlock } from './courses-block';

/** Blocks that show live data from a module. They are part of the one registry, tagged with their module. */
export const MODULE_BLOCKS = [formBlock, blogBlock, storeBlock, cartBlock, bookingBlock, eventsBlock, directoryBlock, memberAreaBlock, membersOnlyBlock, coursesBlock];
