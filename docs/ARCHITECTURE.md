# Architecture

- pnpm monorepo: `apps/web` (Next.js App Router, strict TypeScript, Tailwind v4) and `packages/engine`.
- `packages/engine` is pure and framework-free: config schema (versioned from day one via `CONFIG_SCHEMA_VERSION`), design tokens, block registry and renderers. Marketing, the app and published sites all import it, so preview and production share one renderer.
- Public sites (Phase 6): host-based middleware rewrites `*.saitify.ro` to a public route that reads a published snapshot. Reserved subdomains and takeover protection are designed in that phase.
- Not introduced yet: Supabase (Phase 4), Stripe (Phase 7), email.
