import type { ReactNode } from 'react';
import type { BlockContext } from '../registry/types';
import type { Cta, IconName, ImageRef } from '../schema/common';
import { Icon } from './icons';

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

/** Splits plain text on blank lines. Content is always rendered as text, never as HTML. */
export function paragraphs(input: string | undefined): string[] {
  if (!input) return [];
  return input
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
}

export function Paragraphs({ text, className }: { text?: string; className?: string }) {
  return (
    <>
      {paragraphs(text).map((p, i) => (
        <p key={i} className={className}>
          {p}
        </p>
      ))}
    </>
  );
}

export function SectionShell({
  ctx,
  block,
  as: Tag = 'section',
  before,
  children,
  label,
}: {
  ctx: BlockContext;
  block: string;
  as?: 'section' | 'header' | 'footer';
  before?: ReactNode;
  children: ReactNode;
  label?: string;
}) {
  return (
    <Tag
      id={`s-${ctx.id}`}
      className={cx(
        'sf-section',
        `sf-tone-${ctx.tone}`,
        `sf-space-${ctx.style.spacing}`,
        `sf-${block}`,
        `sf-${block}--${ctx.variant}`,
      )}
      data-align={ctx.style.align}
      aria-label={label}
    >
      {before}
      <div className="sf-container">{children}</div>
    </Tag>
  );
}

export function Intro({
  eyebrow,
  heading,
  description,
  level = 2,
  className,
}: {
  eyebrow?: string;
  heading?: string;
  description?: string;
  level?: 1 | 2;
  className?: string;
}) {
  if (!eyebrow && !heading && !description) return null;
  const H = level === 1 ? 'h1' : 'h2';
  return (
    <div className={cx('sf-intro', className)}>
      {eyebrow ? <p className="sf-eyebrow">{eyebrow}</p> : null}
      {heading ? <H className={level === 1 ? 'sf-h1' : 'sf-h2'}>{heading}</H> : null}
      {description ? <p className="sf-lead">{description}</p> : null}
    </div>
  );
}

export function ButtonLink({
  href,
  kind = 'primary',
  children,
}: {
  href: string;
  kind?: 'primary' | 'secondary';
  children: ReactNode;
}) {
  return (
    <a className={cx('sf-btn', `sf-btn--${kind}`)} href={href}>
      {children}
    </a>
  );
}

export function Actions({ primary, secondary }: { primary?: Cta; secondary?: Cta }) {
  if (!primary && !secondary) return null;
  return (
    <div className="sf-actions">
      {primary ? <ButtonLink href={primary.href}>{primary.label}</ButtonLink> : null}
      {secondary ? (
        <ButtonLink href={secondary.href} kind="secondary">
          {secondary.label}
        </ButtonLink>
      ) : null}
    </div>
  );
}

function hash(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) h = (h * 31 + input.charCodeAt(i)) >>> 0;
  return h;
}

export type Ratio = 'square' | 'landscape' | 'portrait' | 'wide';

/** Image. `placeholder:<name>` renders a gradient from the site's own palette (not a real photo). */
export function Img({
  image,
  ratio = 'landscape',
  className,
  eager = false,
}: {
  image: ImageRef;
  ratio?: Ratio;
  className?: string;
  eager?: boolean;
}) {
  const classes = cx('sf-media', `sf-ratio-${ratio}`, className);
  if (image.src.startsWith('placeholder:')) {
    const variant = hash(image.src) % 6;
    return (
      <div
        className={classes}
        data-ph={variant}
        role={image.alt ? 'img' : undefined}
        aria-label={image.alt || undefined}
        aria-hidden={image.alt ? undefined : true}
      />
    );
  }
  return (
    <img
      className={classes}
      src={image.src}
      alt={image.alt}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
    />
  );
}

export function IconBubble({ name }: { name?: IconName }) {
  if (!name) return null;
  return (
    <span className="sf-icon-bubble">
      <Icon name={name} />
    </span>
  );
}

/** `tel:` links must contain only digits and a leading plus. */
export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^+0-9]/g, '')}`;
}

export function mapHref(query: string): string {
  return `https://www.openstreetmap.org/search?query=${encodeURIComponent(query)}`;
}
