import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Unit tests (src/**/*.test.ts), React component/integration tests
// (src/**/*.test.tsx) + the harness suite (tests/harness/**/*.test.js).
// The Playwright browser E2E lives in e2e/*.spec.ts and is run separately via
// `npm run test:e2e` — exclude it here so the two test runners don't collide.
//
// Default environment stays 'node' (the vast majority of tests are pure
// framework-free lib logic — no need to pay jsdom's setup cost for those).
// .test.tsx files that render React components opt into jsdom individually
// via a `// @vitest-environment jsdom` pragma at the top of the file.
export default defineConfig({
  // tsconfig.json sets "jsx": "preserve" (Next.js does its own SWC JSX
  // transform at build time) — Vite's default (oxc) transform can't handle
  // JSX left as "preserve", so .test.tsx files need this override for
  // Vitest's own transform. Test-runner-only; does not touch the Next.js
  // build or tsconfig.json.
  oxc: { jsx: 'automatic' },
  // Mirrors tsconfig.json's "@/*" -> "./src/*" path alias, which Vite/Vitest
  // doesn't read from tsconfig.json automatically (unlike tsc/Next.js).
  //
  // `server-only` is aliased to a no-op stub: its real package throws unless
  // resolved through Next.js's own "react-server" export condition, which
  // plain Vitest doesn't set — see src/test/stubs/server-only.ts for the
  // full explanation. This lets `src/lib/*.ts` files keep `import
  // 'server-only'` (the file stays genuinely server-only inside the Next.js
  // build) while still being importable by a unit test that only exercises
  // their pure/non-I/O exports.
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      'server-only': fileURLToPath(new URL('./src/test/stubs/server-only.ts', import.meta.url)),
    },
  },
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'tests/harness/**/*.test.js'],
    exclude: ['e2e/**', 'node_modules/**', 'playwright-report/**', 'test-results/**'],
  },
});
