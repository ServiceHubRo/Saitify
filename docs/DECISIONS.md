# Decisions

- **D-001** pnpm workspaces monorepo, Next.js App Router, Tailwind v4, Vitest, Playwright.
- **D-002** `packages/ui` and `packages/config` from the planned layout are deferred until they have real content (no empty packages). Shared TS config lives in `tsconfig.base.json`.
- **D-003** OPEN: design token hex values are placeholders (Midnight, Violet, Blue, Lavender, Cloud, Secondary). Replace in `apps/web/app/tokens.css` and `packages/engine/src/index.ts` once the brand spec is confirmed.
- **D-004** OPEN: host and DNS for `saitify.ro` (Vercel suggested for wildcard subdomains). Needed for Phase 6.
- **D-005** Logo: S mark supplied by Eduard, redrawn as SVG in `apps/web/public/logo.svg` (also `app/icon.svg` favicon) on a gradient sampled from his artwork.
