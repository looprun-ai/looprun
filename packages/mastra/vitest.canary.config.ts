/**
 * The SLM-canary vitest lane — ISOLATED from the default lanes on purpose.
 *
 * `include` matches ONLY `canary/**\/*.canary.ts` (never a `.test.ts`), so `pnpm test` and
 * `pnpm test:proofs` cannot pick these up. A real local model is slow, so the timeouts are generous
 * and the run is strictly SEQUENTIAL (one thread, no file parallelism) — one shared server, no races.
 *
 * Driven by `pnpm proofs:canary` (which checks model availability first). Never wired into CI.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['canary/**/*.canary.ts'],
    testTimeout: 600_000,
    hookTimeout: 600_000,
    fileParallelism: false,
    pool: 'threads',
    poolOptions: { threads: { singleThread: true, minThreads: 1, maxThreads: 1 } },
  },
});
