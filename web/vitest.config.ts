import { defineConfig } from 'vitest/config';

// Unit/harness tests only (src/**/*.test.ts). The Playwright browser E2E lives in
// e2e/*.spec.ts and is run separately via `npm run test:e2e` — exclude it here so
// the two test runners don't collide.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['e2e/**', 'node_modules/**', 'playwright-report/**', 'test-results/**'],
  },
});
