import { defineConfig } from 'vitest/config';

/** Subject directories live in sibling repos and import @looprun-ai/next-core by
 *  name from their own node_modules link; vitest transforms that linked TS source. */
export default defineConfig({
  cacheDir: 'node_modules/.vite-eval',
  test: {
    cache: false,
    server: { deps: { inline: [/@looprun-ai\/next-core/] } }
  }
});
