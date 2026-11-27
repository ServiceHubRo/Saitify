import { z } from 'zod';
import { defineBlock } from '../registry/types';
import { Img } from '../render/parts';
import { text } from '../schema/common';
import type { CartData, CartLine, CartTotals, ProductCard, StoreData } from './data';
import { ActionFields, Chips, Empty, Field, FormMessage, ModuleSection, money, Pager, SearchBar, withQuery } from './ui';

const SORTS = [
  { id: 'featured', label: 'Featured' },
  { id: 'newest', label: 'Newest' },
  { id: 'price-asc', label: 'Price: low to high' },
  { id: 'price-desc', label: 'Price: high to low' },
  { id: 'name', label: 'Name' },
];

const storeSchema = z.object({
  heading: text(160).optional(),
  description: text(600).optional(),
  productsPerPage: z.number().int().min(4).max(48).default(12),
  showSearch: z.boolean().default(true),
  showCategories: z.boolean().default(true),
  featuredOnly: z.boolean().default(false),
});

function Price({ price, compareAt, currency, lang }: { price: number; compareAt?: number; currency: string; lang: string }) {
  return (
    <p className="sf-product-price">
      <span>{money(price, currency, lang)}</span>
      {compareAt && compareAt > price ? (
        <s className="sf-muted">
          <span className="sf-visually-hidden">Was </span>
          {money(compareAt, currency, lang)}
        </s>
      ) : null}
    </p>
  );
}

function ProductItem({ p, href, currency, lang }: { p: ProductCard; href: string; currency: string; lang: string }) {
  return (
    <li className="sf-card sf-product-card">
      <a href={href} className="sf-card-link" aria-label={p.title}>
        <Img image={p.image ?? { src: `placeholder:${p.slug}`, alt: '' }} ratio="square" />
      </a>
      <div className="sf-item-body">
        <h3 className="sf-h3">
          <a href={href}>{p.title}</a>
        </h3>
        <Price price={p.price} compareAt={p.compareAt} currency={currency} lang={lang} />
        {!p.available ? <p className="sf-pill sf-pill--muted">Sold out</p> : null}
      </div>
    </li>
  );
}

function CartLink({ href, count }: { href: string | null; count: number }) {
  if (!href) return null;
  return (
    <a className="sf-btn sf-btn--secondary sf-cart-link" href={href}>
      Cart ({count})
    </a>
  );
}

export const storeBlock = defineBlock({
  type: 'store',
  name: 'Product catalog',
  description: 'Products from your store with categories, search, sorting and product pages with “Add to cart”.',
  category: 'conversion',
  region: 'page',
  module: 'store',
  detail: true,
  variants: [{ id: 'grid', name: 'Grid', description: 'Product cards in a grid.' }],
  defaultVariant: 'grid',
  defaultTone: 'default',
  contentSchema: storeSchema,
  defaultContent: { heading: 'Shop' },
  render(ctx) {
    const c = ctx.content;
    const lang = ctx.site.language;
    const r = ctx.route;
    const isProduct = (ctx.data as StoreData | undefined)?.mode === 'product';
    return (
      <ModuleSection<StoreData> ctx={ctx} block="store" heading={isProduct ? undefined : c.heading} description={isProduct ? undefined : c.description}>
        {(d) => {
          if (d.mode === 'product') {
            const p = d.product;
            const images = p.images.length ? p.images : [{ src: `placeholder:${p.slug}`, alt: '' }];
            return (
              <article className="sf-product">
                <p className="sf-product-top">
                  <a className="sf-back" href={r.pageHref}>
                    ← All products
                  </a>
                  <CartLink href={d.cartHref} count={d.cartCount} />
                </p>
                <div className="sf-product-grid">
                  <div className="sf-gallery-stack">
                    {images.map((img, i) => (
                      <Img key={`${img.src}-${i}`} image={img} ratio="square" eager={i === 0} />
                    ))}
                  </div>
                  <div className="sf-product-info">
                    <h1 className="sf-h2">{p.title}</h1>
                    <Price price={p.price} compareAt={p.compareAt} currency={d.currency} lang={lang} />
                    {p.sku ? <p className="sf-meta">SKU {p.sku}</p> : null}
                    {d.added ? (
                      <p className="sf-notice sf-notice--ok" role="status">
                        Added to your cart. {d.cartHref ? <a href={d.cartHref}>View cart</a> : null}
                      </p>
                    ) : null}
                    <FormMessage state={d.state} />
                    {p.available ? (
                      <form className="sf-form sf-buy" method="post" action={d.action.url}>
                        <ActionFields action={d.action} />
                        <input type="hidden" name="product" value={p.slug} />
                        {p.variants.length ? (
                          <fieldset className="sf-field">
                            <legend>Option</legend>
                            <div className="sf-choices">
                              {p.variants.map((v, i) => (
                                <label key={v.id} className="sf-choice">
                                  <input type="radio" name="variant" value={v.id} disabled={!v.available} defaultChecked={i === p.variants.findIndex((x) => x.available)} required />
                                  <span>
                                    {v.title} · {money(v.price, d.currency, lang)}
                                    {!v.available ? ' (sold out)' : ''}
                                  </span>
                                </label>
                              ))}
                            </div>
                          </fieldset>
                        ) : null}
                        <Field scope={ctx.id} name="quantity" label="Quantity" type="number" value="1" min={1} max={99} state={d.state} />
                        <button type="submit" className="sf-btn sf-btn--primary">
                          Add to cart
                        </button>
                      </form>
                    ) : (
                      <p className="sf-notice">This product is sold out.</p>
                    )}
                    {p.description ? (
                      <div className="sf-prose">
                        {p.description.split(/\n{2,}/).map((para, i) => (
                          <p key={i}>{para}</p>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              </article>
            );
          }
          const keep = { category: d.category, q: d.q, sort: d.sort === 'featured' ? undefined : d.sort };
          return (
            <>
              <div className="sf-toolbar">
                {c.showCategories ? <Chips items={d.categories} active={d.category} href={(s) => withQuery(r.pageHref, { category: s, q: d.q })} /> : null}
                <div className="sf-toolbar-row">
                  {c.showSearch ? <SearchBar scope={ctx.id} action={r.pageHref} q={d.q} keep={{ category: d.category, sort: keep.sort }} label="Search products" /> : null}
                  <form method="get" action={r.pageHref} className="sf-sort">
                    {d.category ? <input type="hidden" name="category" value={d.category} /> : null}
                    {d.q ? <input type="hidden" name="q" value={d.q} /> : null}
                    <label htmlFor={`sort-${ctx.id}`}>Sort</label>
                    <select id={`sort-${ctx.id}`} name="sort" defaultValue={d.sort}>
                      {SORTS.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                    <button type="submit" className="sf-btn sf-btn--secondary">
                      Apply
                    </button>
                  </form>
                  <CartLink href={d.cartHref} count={d.cartCount} />
                </div>
              </div>
              {d.products.length === 0 ? (
                <Empty>{d.q || d.category ? 'No products match your search.' : 'No products are available yet.'}</Empty>
              ) : (
                <ul className="sf-grid sf-grid--4">
                  {d.products.map((p) => (
                    <ProductItem key={p.slug} p={p} href={`${r.detailBase}/${p.slug}`} currency={d.currency} lang={lang} />
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

function Lines({ lines, currency, lang, editable, action }: { lines: CartLine[]; currency: string; lang: string; editable?: boolean; action?: { url: string } }) {
  return (
    <ul className="sf-cart-lines">
      {lines.map((l) => (
        <li key={l.key} className="sf-cart-line">
          <div>
            <p className="sf-cart-title">{l.href ? <a href={l.href}>{l.title}</a> : l.title}</p>
            {l.variantTitle ? <p className="sf-meta">{l.variantTitle}</p> : null}
            <p className="sf-meta">
              {money(l.unit, currency, lang)} × {l.qty}
            </p>
            {l.problem ? <p className="sf-field-error">{l.problem}</p> : null}
          </div>
          <div className="sf-cart-side">
            <p className="sf-cart-amount">{money(l.line, currency, lang)}</p>
            {editable && action ? (
              <>
                <label className="sf-visually-hidden" htmlFor={`q-${l.key}`}>
                  Quantity for {l.title}
                </label>
                <input id={`q-${l.key}`} className="sf-qty" type="number" name={`qty:${l.key}`} defaultValue={l.qty} min={0} max={l.max ?? 99} />
                <button type="submit" name="remove" value={l.key} className="sf-linkbtn">
                  Remove
                </button>
              </>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

function Totals({ t, currency, lang }: { t: CartTotals; currency: string; lang: string }) {
  return (
    <dl className="sf-totals">
      <div>
        <dt>Subtotal</dt>
        <dd>{money(t.subtotal, currency, lang)}</dd>
      </div>
      <div>
        <dt>Delivery</dt>
        <dd>{t.shipping === 0 ? 'Free' : money(t.shipping, currency, lang)}</dd>
      </div>
      <div className="sf-totals-sum">
        <dt>Total</dt>
        <dd>{money(t.total, currency, lang)}</dd>
      </div>
    </dl>
  );
}

const ORDER_STATUS: Record<string, string> = { pending: 'Received', processing: 'Being prepared', shipped: 'Shipped', completed: 'Completed', canceled: 'Canceled' };
const PAYMENT_STATUS: Record<string, string> = { awaiting: 'Awaiting payment', paid: 'Paid', refunded: 'Refunded' };

export const cartBlock = defineBlock({
  type: 'cart',
  name: 'Cart and checkout',
  description: 'The shopping cart, checkout form and order confirmation of your store. Add it to one page, for example “Cart”.',
  category: 'conversion',
  region: 'page',
  module: 'store',
  detail: true,
  variants: [{ id: 'default', name: 'Standard', description: 'Cart lines with a summary.' }],
  defaultVariant: 'default',
  defaultTone: 'default',
  contentSchema: z.object({ heading: text(160).optional() }),
  defaultContent: { heading: 'Your cart' },
  render(ctx) {
    const lang = ctx.site.language;
    const d0 = ctx.data as CartData | undefined;
    const heading = d0?.mode === 'checkout' ? 'Checkout' : d0?.mode === 'order' ? undefined : ctx.content.heading;
    return (
      <ModuleSection<CartData> ctx={ctx} block="cart" heading={heading} level={d0?.mode === 'checkout' ? 1 : 2}>
        {(d) => {
          if (d.mode === 'missing') return <Empty>We could not find this order. Check the link in your confirmation.</Empty>;
          if (d.mode === 'order') {
            const o = d.order;
            return (
              <div className="sf-card sf-order">
                <h1 className="sf-h2">Thank you, {o.customerName}</h1>
                <p className="sf-lead">Order #{o.number} was received.</p>
                <p>
                  <span className="sf-pill">{ORDER_STATUS[o.status] ?? o.status}</span> <span className="sf-pill sf-pill--muted">{PAYMENT_STATUS[o.paymentStatus] ?? o.paymentStatus}</span>
                </p>
                <p className="sf-muted">Payment: {o.paymentMethod}</p>
                {o.instructions ? <p className="sf-notice">{o.instructions}</p> : null}
                <Lines lines={o.lines} currency={d.currency} lang={lang} />
                <Totals t={o.totals} currency={d.currency} lang={lang} />
                <p className="sf-hint">Keep this page’s address to check your order later.</p>
              </div>
            );
          }
          if (d.mode === 'checkout') {
            return (
              <div className="sf-checkout">
                <form className="sf-form" method="post" action={d.action.url} noValidate>
                  <ActionFields action={d.action} />
                  <FormMessage state={d.state} />
                  <fieldset className="sf-fieldset">
                    <legend className="sf-h3">Your details</legend>
                    <Field scope={ctx.id} name="name" label="Full name" required autoComplete="name" state={d.state} />
                    <Field scope={ctx.id} name="email" label="Email" type="email" required autoComplete="email" state={d.state} />
                    <Field scope={ctx.id} name="phone" label="Phone" type="tel" required autoComplete="tel" state={d.state} />
                  </fieldset>
                  {d.requireDelivery ? (
                    <fieldset className="sf-fieldset">
                      <legend className="sf-h3">Delivery address</legend>
                      <Field scope={ctx.id} name="address" label="Street and number" required autoComplete="street-address" state={d.state} />
                      <Field scope={ctx.id} name="city" label="City" required autoComplete="address-level2" state={d.state} />
                      <Field scope={ctx.id} name="postcode" label="Postal code" autoComplete="postal-code" state={d.state} />
                      <Field scope={ctx.id} name="country" label="Country" required autoComplete="country-name" state={d.state} />
                    </fieldset>
                  ) : null}
                  <fieldset className="sf-field">
                    <legend className="sf-h3">Payment</legend>
                    <div className="sf-choices">
                      {d.paymentMethods.map((m, i) => (
                        <label key={m.id} className="sf-choice">
                          <input type="radio" name="payment" value={m.id} defaultChecked={(d.state?.values.payment ?? d.paymentMethods[0]?.id) === m.id || (i === 0 && !d.state)} required />
                          <span>
                            {m.label}
                            {m.note ? <span className="sf-hint"> {m.note}</span> : null}
                          </span>
                        </label>
                      ))}
                    </div>
                    {d.state?.errors.payment ? <p className="sf-field-error">{d.state.errors.payment}</p> : null}
                  </fieldset>
                  <Field scope={ctx.id} name="notes" label="Notes for the seller (optional)" type="textarea" state={d.state} />
                  <button type="submit" className="sf-btn sf-btn--primary">
                    Place order
                  </button>
                  <p className="sf-hint">No payment is taken on this website. You pay with the method you choose above.</p>
                </form>
                <aside className="sf-card sf-summary" aria-label="Order summary">
                  <h2 className="sf-h3">Summary</h2>
                  <Lines lines={d.lines} currency={d.currency} lang={lang} />
                  <Totals t={d.totals} currency={d.currency} lang={lang} />
                  <a className="sf-back" href={d.cartHref}>
                    ← Edit cart
                  </a>
                </aside>
              </div>
            );
          }
          if (d.lines.length === 0) {
            return (
              <div className="sf-empty-cart">
                <Empty>Your cart is empty.</Empty>
                {d.shopHref ? (
                  <a className="sf-btn sf-btn--primary" href={d.shopHref}>
                    Continue shopping
                  </a>
                ) : null}
              </div>
            );
          }
          return (
            <div className="sf-checkout">
              <form method="post" action={d.action.url} className="sf-form">
                <ActionFields action={d.action} />
                <Lines lines={d.lines} currency={d.currency} lang={lang} editable action={d.action} />
                <button type="submit" className="sf-btn sf-btn--secondary">
                  Update cart
                </button>
              </form>
              <aside className="sf-card sf-summary" aria-label="Cart summary">
                <Totals t={d.totals} currency={d.currency} lang={lang} />
                {d.canCheckout ? (
                  <a className="sf-btn sf-btn--primary" href={d.checkoutHref}>
                    Go to checkout
                  </a>
                ) : (
                  <p className="sf-notice">Some items need your attention before checkout.</p>
                )}
                {d.shopHref ? (
                  <a className="sf-back" href={d.shopHref}>
                    Continue shopping
                  </a>
                ) : null}
              </aside>
            </div>
          );
        }}
      </ModuleSection>
    );
  },
});
