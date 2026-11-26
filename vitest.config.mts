import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/**/src/**/*.test.{ts,tsx}', 'apps/**/lib/**/*.test.ts', 'apps/**/src/**/*.test.ts'],
  },
});
