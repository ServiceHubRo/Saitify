import { z } from 'zod';
import { defineBlock } from '../registry/types';
import { Img, telHref } from '../render/parts';
import { text } from '../schema/common';
import type { DirectoryData, ListingCard } from './data';
import { Chips, Empty, ModuleSection, Pager, SearchBar, withQuery } from './ui';

function Card({ l, href }: { l: ListingCard; href: string }) {
  return (
    <li className="sf-card sf-listing-card">
      {l.image ? <Img image={l.image} ratio="landscape" /> : null}
      <div className="sf-item-body">
        <p className="sf-meta">
          {l.category?.name ?? ''}
          {l.featured ? <span className="sf-pill">Featured</span> : null}
        </p>
        <h3 className="sf-h3">
          <a href={href}>{l.title}</a>
        </h3>
        {l.location ? <p className="sf-muted">{l.location}</p> : null}
        {l.summary ? <p className="sf-muted">{l.summary}</p> : null}
      </div>
    </li>
  );
}

export const directoryBlock = defineBlock({
  type: 'directory',
  name: 'Directory',
  description: 'Searchable listings (businesses, places, professionals) with categories, sorting and a page per listing.',
  category: 'content',
  region: 'page',
  module: 'directory',
  detail: true,
  variants: [{ id: 'cards', name: 'Cards', description: 'Listing cards in a grid.' }],
  defaultVariant: 'cards',
  defaultTone: 'default',
  contentSchema: z.object({ heading: text(160).optional(), description: text(600).optional(), listingsPerPage: z.number().int().min(4).max(48).default(12), showSearch: z.boolean().default(true) }),
  defaultContent: { heading: 'Directory' },
  render(ctx) {
    const c = ctx.content;
    const r = ctx.route;
    const isEntry = (ctx.data as DirectoryData | undefined)?.mode === 'listing';
    return (
      <ModuleSection<DirectoryData> ctx={ctx} block="directory" heading={isEntry ? undefined : c.heading} description={isEntry ? undefined : c.description}>
        {(d) => {
          if (d.mode === 'listing') {
            const l = d.listing;
            return (
              <article className="sf-article">
                <p>
                  <a className="sf-back" href={r.pageHref}>
                    ← All listings
                  </a>
                </p>
                <h1 className="sf-h1">{l.title}</h1>
                <p className="sf-meta">
                  {l.category ? <a href={withQuery(r.pageHref, { category: l.category.slug })}>{l.category.name}</a> : null}
                  {l.location ? <span> · {l.location}</span> : null}
                </p>
                {l.images.length ? (
                  <div className="sf-gallery-stack sf-gallery-stack--row">
                    {l.images.map((img, i) => (
                      <Img key={`${img.src}-${i}`} image={img} ratio="landscape" eager={i === 0} />
                    ))}
                  </div>
                ) : null}
                {l.description ? (
                  <div className="sf-prose">
                    {l.description.split(/\n{2,}/).map((p, i) => (
                      <p key={i}>{p}</p>
                    ))}
                  </div>
                ) : null}
                <dl className="sf-review">
                  {l.phone ? (
                    <div>
                      <dt>Phone</dt>
                      <dd>
                        <a href={telHref(l.phone)}>{l.phone}</a>
                      </dd>
                    </div>
                  ) : null}
                  {l.email ? (
                    <div>
                      <dt>Email</dt>
                      <dd>
                        <a href={`mailto:${l.email}`}>{l.email}</a>
                      </dd>
                    </div>
                  ) : null}
                  {l.website ? (
                    <div>
                      <dt>Website</dt>
                      <dd>
                        <a href={l.website} rel="nofollow noopener">
                          {l.website.replace(/^https?:\/\//, '')}
                        </a>
                      </dd>
                    </div>
                  ) : null}
                  {l.fields.map((f) => (
                    <div key={f.label}>
                      <dt>{f.label}</dt>
                      <dd>{f.value}</dd>
                    </div>
                  ))}
                </dl>
              </article>
            );
          }
          const keep = { category: d.category, q: d.q, sort: d.sort === 'featured' ? undefined : d.sort };
          return (
            <>
              <div className="sf-toolbar">
                <Chips items={d.categories} active={d.category} href={(s) => withQuery(r.pageHref, { category: s, q: d.q })} />
                <div className="sf-toolbar-row">
                  {c.showSearch ? <SearchBar scope={ctx.id} action={r.pageHref} q={d.q} keep={{ category: d.category, sort: keep.sort }} label="Search listings" /> : null}
                  <form method="get" action={r.pageHref} className="sf-sort">
                    {d.category ? <input type="hidden" name="category" value={d.category} /> : null}
                    {d.q ? <input type="hidden" name="q" value={d.q} /> : null}
                    <label htmlFor={`sort-${ctx.id}`}>Sort</label>
                    <select id={`sort-${ctx.id}`} name="sort" defaultValue={d.sort}>
                      <option value="featured">Featured first</option>
                      <option value="name">Name</option>
                      <option value="newest">Newest</option>
                    </select>
                    <button type="submit" className="sf-btn sf-btn--secondary">
                      Apply
                    </button>
                  </form>
                </div>
              </div>
              {d.listings.length === 0 ? (
                <Empty>{d.q || d.category ? 'No listings match your search.' : 'No listings yet.'}</Empty>
              ) : (
                <ul className="sf-grid sf-grid--3">
                  {d.listings.map((l) => (
                    <Card key={l.slug} l={l} href={`${r.detailBase}/${l.slug}`} />
                  ))}
                </ul>
              )}
              <Pager paging={d.paging} href={(n) => withQuery(r.pageHref, { ...keep, page: n > 1 ? n : undefined })} />
            </>
          );
        }}
      </ModuleSection>
    );
  },
});
