# Phase 2: Universal Website Engine

Package: `packages/engine`. Playground: `/playground` (apps/web), local or `PLAYGROUND_ENABLED=true`, never indexed.

## Model
`Website` (identity, design, settings, navigation, metadata, status, regions, pages) > `Page` (slug, type, SEO, visibility, order, config, sections) > `Section` (block type, variant, content, style overrides, visibility, hideOn devices). Schemas: `src/schema`. Page types are an open string (`home`, `standard`, `custom` known). Website types are a list, extensible.

## Blocks (14)
header, hero, text, about, services, features, gallery, testimonials, stats, cta, faq, contact, location, footer. Each: 2-3 real variants, Zod content schema, default content, default tone. Register new ones with `defineBlock` + `registry.register`; the renderer has no block-specific code. A restaurant menu is the `services` block (items with price). The location block links to OpenStreetMap and says plainly that no interactive map is connected. Contact shows details only; it is not a form.

## Design system
Tokens as `--sf-*` CSS variables: colors, typography, radius, shadows, buttons, container, section spacing. 3 palettes (modern, premium, bold; text pairs tested for contrast >= 4.5) and 2 styles (minimal, premium). Per-site color overrides are validated hex values.

## Validation and rendering
`validateWebsite(input)` never throws: unknown blocks, invalid content, bad variants, duplicate ids, broken navigation and wrong regions are dropped or repaired and reported as `Issue[]` (reusable by a future editor). `SiteRenderer` validates on every render, isolates blocks that throw, shows diagnostics only in `preview` mode, and renders text as text (no HTML interpretation, safe link and image patterns).

## Responsiveness and accessibility
Container queries on `.sf-root`, so layouts follow the width they are given. Semantic landmarks, one h1 per page (hidden fallback when a page has no hero), native `<details>` for FAQ and mobile menu (no client JS), alt text on images, focus outlines, reduced-motion respected.

## Not included
No ecommerce, blog, booking, forms backend, editor, persistence or real image upload. Placeholder images are generated gradients (`placeholder:<name>`).
