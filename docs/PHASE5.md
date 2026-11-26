# Phase 5 — Visual Website Editor

Open a saved project from the dashboard at `/editor/<id>` and edit the real website on a canvas. Nothing is regenerated when a project is opened; the stored `site` is used as is.

## Architecture
- `packages/editor` (pure, no React): immutable operations on the engine's normalized `Website`. Every content change is re-validated by the block's own `contentSchema` from the block registry, so the editor can never write something the engine cannot render. Editing forms are generated from `z.toJSONSchema(contentSchema)`; a new block registered in the engine is editable without editor changes. Also: history (snapshots, grouping of rapid typing), page/section/navigation/design ops, slug rules, integrity checks, text sanitizing (plain text only, control characters removed).
- Canvas = the real `SiteRenderer` in `preview` mode (the same renderer as the public site). Sections carry `data-sf-section` in preview mode only. Clicks are captured: links and submits never navigate; selection and inline editing use an overlay layer that is separate from the site's DOM.
- Persistence (`packages/platform`): `saveSite` (PATCH `/api/projects/:id/site`, body `{revision, site}`) and `resetSite` (POST `.../site/reset`). Ownership is checked first (a stranger gets 404 for any body), then size, then engine validation, then an optimistic-concurrency update (`revision`); a stale revision is a 409 and nothing is overwritten. No schema change: migrations 0001/0002 already had `site`, `site_version`, `meta`, `revision`. `meta.editor.editedAt` marks a customized website, so the configurator no longer regenerates it behind the user's back.
- Autosave (`use-site-sync`): debounced, one save in flight, honest states (saved / unsaved / saving / offline / conflict / signed out / not found / failed), retry, local backup in `localStorage` offered for restore after a crash, conflict choice (load latest or overwrite).

## What can be edited
Text (panel and inline, plain text), images (URL or placeholder, alt text), links/buttons, sections (add from registry with search and categories, duplicate with new ids, reorder by drag and by buttons, hide, delete with Undo, variants, spacing, alignment, background), pages (create from layouts, rename, slug validation, home page uniqueness, visibility, SEO, duplicate, delete, reorder), navigation (page links and external URLs, validated), design (palette, individual colors with hex/picker/contrast hint/reset, style preset), website settings. Desktop/tablet/mobile preview uses the real container-query responsive logic. Under 1024px the panels become bottom sheets.

Shortcuts: Ctrl/Cmd+Z, Shift+Ctrl/Cmd+Z or Ctrl+Y, Ctrl/Cmd+S, Alt+P (preview), Esc, ? (help). Undo/redo never fires while typing in a field.

## Honest limitations
- Text is plain text (engine strings are plain): no bold/italic/lists.
- Typography, radius, spacing and shadows come only from the engine's style presets; there is no per-element font control.
- No image upload: there is no storage yet. Images are https URLs or the built-in placeholders, and the UI says so.
- Verified against embedded Postgres (PGlite) only, not a live Supabase instance. Email uses the outbox transport.
- Publishing, hosting and billing are not part of this phase.
