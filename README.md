# Saitlify

SaaS platform for non-technical users to create and publish websites.

## Develop

```bash
nvm use
pnpm install
pnpm dev        # http://localhost:3000
pnpm lint && pnpm typecheck && pnpm test && pnpm build
pnpm e2e        # needs `pnpm build` first and Playwright browsers
```

## Layout

- `apps/web` Next.js app (marketing, app, public-site route in later phases)
- `packages/engine` pure config schema, tokens, renderer (no editor dependencies)
- `docs/` architecture, decisions, phase checklist

Current status: Phase 0 (foundation). See `docs/PHASES.md`.
