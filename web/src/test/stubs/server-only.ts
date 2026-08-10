// Vitest-only stub for the `server-only` package.
//
// The real `server-only` package unconditionally throws on import unless
// resolved through Next.js's own "react-server" export condition — see
// node_modules/server-only/index.js. Plain Vitest (vitest.config.ts) never
// sets that condition, so any `src/lib/*.ts` file that does
// `import 'server-only'` (correctly, per its real server-only contract in the
// Next.js build) would otherwise crash every unit test that transitively
// imports it — even tests that only exercise pure/non-I/O exports of that
// file.
//
// vitest.config.ts aliases the `server-only` specifier to this file (a no-op
// module) for the test runner only. This does NOT weaken the real guarantee:
// the actual Next.js build still uses the real `server-only` package and
// still fails the build if a server-only module is ever imported from a
// Client Component.
export {};
