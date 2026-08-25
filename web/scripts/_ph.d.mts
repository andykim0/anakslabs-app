/**
 * Type surface for `_ph.mjs`, which is an esbuild artifact of
 * `src/lib/us-demo/publish-hypothesis.ts` and is gitignored (see baseline.ts's
 * header for the bundling command). Without this file, a clean checkout —
 * which is every Vercel build — fails `next build`'s typecheck at
 * baseline.ts:18 with "Cannot find module './_ph.mjs'", which is exactly what
 * broke every production deploy between 2026-08-12 and 2026-08-26.
 *
 * A type-only re-export from the bundle's own source, so the declared
 * signature can never drift from the real one. Nothing executes at typecheck
 * time; the runtime import still requires the artifact to have been built.
 */
export { buildUsDemoStructureComparisons } from '../src/lib/us-demo/publish-hypothesis';
