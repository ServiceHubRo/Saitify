import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  webServer: [{ command: 'node e2e/stripe-mock.mjs', url: 'http://127.0.0.1:3199/__calls', reuseExistingServer: !process.env.CI }, {
    // Fresh embedded Postgres and mail outbox for every run (see docs/PHASE4.md). Never used outside tests.
    command: 'rm -rf .e2e-data && mkdir -p .e2e-data && pnpm --filter web start --port 3100',
    url: 'http://localhost:3100',
    reuseExistingServer: !process.env.CI,
    env: {
      PLAYGROUND_ENABLED: 'true',
      SAITIFY_DB: 'pglite',
      PGLITE_DIR: `${process.cwd()}/.e2e-data/db`,
      EMAIL_TRANSPORT: 'outbox',
      EMAIL_OUTBOX_FILE: `${process.cwd()}/.e2e-data/outbox.jsonl`,
      APP_URL: 'http://localhost:3100',
      // Published sites are served at <name>.localhost:3100 (browsers resolve *.localhost to loopback).
      SITE_BASE_DOMAIN: 'localhost:3100',
      SITE_SCHEME: 'http',
      RATE_LIMIT_IP_HEADER: 'x-test-ip',
      // Billing: administrator by verified email; Stripe's HTTP API replaced by a local stand-in (see e2e/stripe-mock.mjs).
      ADMIN_EMAILS: 'billing-admin@example.com',
      STRIPE_SECRET_KEY: 'sk_test_e2e_mock_key',
      STRIPE_API_HOST: '127.0.0.1',
      STRIPE_API_PORT: '3199',
      STRIPE_API_PROTOCOL: 'http',
      STRIPE_WEBHOOK_SECRET: 'whsec_e2e_secret',
    },
  }],
  use: {
    baseURL: 'http://localhost:3100',
    // Optional override for environments with a pre-installed Chromium.
    launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH || undefined },
  },
  projects: [
    { name: 'desktop-1440', use: { viewport: { width: 1440, height: 900 } } },
    { name: 'laptop-1280', use: { viewport: { width: 1280, height: 800 } } },
    { name: 'tablet-768', use: { viewport: { width: 768, height: 1024 } } },
    { name: 'mobile-390', use: { viewport: { width: 390, height: 844 } } },
    { name: 'mobile-360', use: { viewport: { width: 360, height: 740 } } },
  ],
});
