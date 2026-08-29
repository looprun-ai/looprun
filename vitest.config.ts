/** The root runner walks the packages; the house gates under tests/ are node scripts
 *  (`node tests/<name>.test.mjs`, chained by `pnpm gates`) and answer with an exit code,
 *  not a suite — collecting them here would fail them for having no `test()` to run. */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', 'tests/**']
  }
});
