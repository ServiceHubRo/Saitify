import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  webServer: {
    command: 'pnpm --filter web start --port 3100',
    url: 'http://localhost:3100',
    reuseExistingServer: !process.env.CI,
    env: { PLAYGROUND_ENABLED: 'true' },
  },
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
