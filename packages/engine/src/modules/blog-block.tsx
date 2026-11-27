import { z } from 'zod';
import { defineBlock } from '../registry/types';
import { Img } from '../render/parts';
import { text } from '../schema/common';
import { RichContent } from './content';
import type { BlogData, PostCard } from './data';
import { Chips, Empty, fmtDate, ModuleSection, Pager, SearchBar, withQuery } from './ui';

const schema = z.object({
  heading: text(160).optional(),
  description: text(600).optional(),
  postsPerPage: z.number().int().min(3).max(24).default(9),
  showSearch: z.boolean().default(true),
  showCategories: z.boolean().default(true),
});

function Card({ p, href, lang }: { p: PostCard; href: string; lang: string }) {
  return (
    <li className="sf-card sf-post-card">
      {p.cover ? <Img image={p.cover} ratio="landscape" /> : null}
      <div className="sf-item-body">
        <p className="sf-meta">
          <time dateTime={p.date}>{fmtDate(p.date, lang)}</time>
          {p.categories[0] ? <span> · {p.categories[0].name}</span> : null}
          {p.membersOnly ? <span className="sf-pill">Members</span> : null}
        </p>
        <h3 className="sf-h3">
          <a href={href}>{p.title}</a>
        </h3>
        {p.excerpt ? <p className="sf-muted">{p.excerpt}</p> : null}
      </div>
    </li>
  );
}

export const blogBlock = defineBlock({
  type: 'blog',
  name: 'Blog posts',
  description: 'Your published posts with categories, search and pages. Each post gets its own address on this page.',
  category: 'content',
  region: 'page',
  module: 'blog',
  detail: true,
  variants: [
    { id: 'grid', name: 'Grid', description: 'Cards in a grid.' },
    { id: 'list', name: 'List', description: 'One post per row.' },
  ],
  defaultVariant: 'grid',
  defaultTone: 'default',
  contentSchema: schema,
  defaultContent: { heading: 'Latest posts' },
  render(ctx) {
    const c = ctx.content;
    const lang = ctx.site.language;
    const r = ctx.route;
    const postHref = (slug: string) => `${r.detailBase}/${slug}`;
    const isPost = (ctx.data as BlogData | undefined)?.mode === 'post';
    return (
      <ModuleSection<BlogData> ctx={ctx} block="blog" heading={isPost ? undefined : c.heading} description={isPost ? undefined : c.description}>
        {(d) => {
          if (d.mode === 'post') {
            const p = d.post;
            return (
              <article className="sf-article">
                <p>
                  <a className="sf-back" href={r.pageHref}>
                    ← All posts
                  </a>
                </p>
                <h1 className="sf-h1">{p.title}</h1>
                <p className="sf-meta">
                  <time dateTime={p.date}>{fmtDate(p.date, lang)}</time>
                  {p.author ? <span> · {p.author}</span> : null}
                  {p.categories.map((cat) => (
                    <span key={cat.slug}>
                      {' · '}
                      <a href={withQuery(r.pageHref, { category: cat.slug })}>{cat.name}</a>
                    </span>
                  ))}
                </p>
                {p.cover ? <Img image={p.cover} ratio="wide" eager /> : null}
                {p.body ? (
                  <RichContent blocks={p.body} title={p.title} />
                ) : (
                  <div className="sf-gate">
                    {p.excerpt ? <p className="sf-lead">{p.excerpt}</p> : null}
                    <p>This post is for members.</p>
                    {p.loginHref ? (
                      <a className="sf-btn sf-btn--primary" href={p.loginHref}>
                        Sign in or join
                      </a>
                    ) : null}
                  </div>
                )}
                {p.tags.length ? (
                  <ul className="sf-chips" aria-label="Tags">
                    {p.tags.map((t) => (
                      <li key={t}>
                        <a href={withQuery(r.pageHref, { tag: t })}>#{t}</a>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {d.related.length ? (
                  <aside className="sf-related" aria-label="Related posts">
                    <h2 className="sf-h3">Related posts</h2>
                    <ul className="sf-grid sf-grid--3">
                      {d.related.map((rp) => (
                        <Card key={rp.slug} p={rp} href={postHref(rp.slug)} lang={lang} />
                      ))}
                    </ul>
                  </aside>
                ) : null}
              </article>
            );
          }
          const keep = { category: d.category, tag: d.tag, q: d.q };
          return (
            <>
              {c.showSearch || c.showCategories ? (
                <div className="sf-toolbar">
                  {c.showCategories ? <Chips items={d.categories} active={d.category} href={(s) => withQuery(r.pageHref, { category: s, q: d.q })} /> : null}
                  {c.showSearch ? <SearchBar scope={ctx.id} action={r.pageHref} q={d.q} keep={{ category: d.category }} label="Search posts" /> : null}
                </div>
              ) : null}
              {d.tag ? <p className="sf-muted">Tagged “{d.tag}” · <a href={r.pageHref}>Show all</a></p> : null}
              {d.posts.length === 0 ? (
                <Empty>{d.q || d.category || d.tag ? 'No posts match your search.' : 'No posts have been published yet.'}</Empty>
              ) : (
                <ul className={ctx.variant === 'list' ? 'sf-stack' : 'sf-grid sf-grid--3'}>
                  {d.posts.map((p) => (
                    <Card key={p.slug} p={p} href={postHref(p.slug)} lang={lang} />
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
