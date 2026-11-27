import { z } from 'zod';
import { hrefSchema, imageSchema, text } from '../schema/common';
import { Img, paragraphs } from '../render/parts';

/**
 * Rich content for posts and lessons: a list of simple, typed blocks. Everything is rendered as text (never as HTML), links
 * use the engine's safe-link rule and videos are limited to YouTube and Vimeo, embedded through their privacy-friendly players.
 */
const VIDEO = /^https:\/\/(www\.)?(youtube\.com\/watch\?v=[\w-]{6,20}|youtu\.be\/[\w-]{6,20}|vimeo\.com\/\d{4,12})([?&#].*)?$/i;

export const richBlockSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('paragraph'), text: text(5000).min(1) }),
  z.object({ type: z.literal('heading'), text: text(200).min(1), level: z.union([z.literal(2), z.literal(3)]).default(2) }),
  z.object({ type: z.literal('image'), image: imageSchema, caption: text(300).optional() }),
  z.object({ type: z.literal('list'), items: z.array(text(500).min(1)).min(1).max(50), ordered: z.boolean().default(false) }),
  z.object({ type: z.literal('quote'), text: text(1000).min(1), cite: text(120).optional() }),
  z.object({ type: z.literal('video'), url: z.string().trim().max(300).regex(VIDEO, 'Use a YouTube or Vimeo link') }),
  z.object({ type: z.literal('cta'), label: text(60).min(1), href: hrefSchema }),
]);
export const richContentSchema = z.array(richBlockSchema).max(200).default([]);
export type RichBlock = z.output<typeof richBlockSchema>;

/** The embeddable player address for a YouTube or Vimeo link, or null. */
export function videoEmbed(url: string): string | null {
  const yt = /(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{6,20})/i.exec(url);
  if (yt) return `https://www.youtube-nocookie.com/embed/${yt[1]}`;
  const vm = /vimeo\.com\/(\d{4,12})/i.exec(url);
  if (vm) return `https://player.vimeo.com/video/${vm[1]}`;
  return null;
}

/** Plain text of rich content, for excerpts and search descriptions. */
export function richText(blocks: readonly RichBlock[]): string {
  return blocks
    .map((b) => (b.type === 'paragraph' || b.type === 'heading' || b.type === 'quote' ? b.text : b.type === 'list' ? b.items.join(' ') : ''))
    .filter(Boolean)
    .join(' ');
}

export function RichContent({ blocks, title }: { blocks: readonly RichBlock[]; title?: string }) {
  return (
    <div className="sf-rich">
      {blocks.map((b, i) => {
        switch (b.type) {
          case 'paragraph':
            return paragraphs(b.text).map((p, j) => <p key={`${i}-${j}`}>{p}</p>);
          case 'heading':
            return b.level === 3 ? <h3 key={i} className="sf-h3">{b.text}</h3> : <h2 key={i} className="sf-h3 sf-rich-h2">{b.text}</h2>;
          case 'image':
            return (
              <figure key={i}>
                <Img image={b.image} ratio="landscape" />
                {b.caption ? <figcaption className="sf-muted">{b.caption}</figcaption> : null}
              </figure>
            );
          case 'list': {
            const L = b.ordered ? 'ol' : 'ul';
            return (
              <L key={i} className={b.ordered ? 'sf-rich-ol' : 'sf-rich-ul'}>
                {b.items.map((it, j) => (
                  <li key={j}>{it}</li>
                ))}
              </L>
            );
          }
          case 'quote':
            return (
              <blockquote key={i} className="sf-rich-quote">
                <p>{b.text}</p>
                {b.cite ? <cite>{b.cite}</cite> : null}
              </blockquote>
            );
          case 'video': {
            const src = videoEmbed(b.url);
            return src ? (
              <div key={i} className="sf-video">
                <iframe src={src} title={title ? `Video: ${title}` : 'Video'} loading="lazy" allow="encrypted-media; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
              </div>
            ) : null;
          }
          case 'cta':
            return (
              <p key={i}>
                <a className="sf-btn sf-btn--primary" href={b.href}>
                  {b.label}
                </a>
              </p>
            );
        }
      })}
    </div>
  );
}
