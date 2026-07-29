/**
 * DECLARATION-EMIT PORTABILITY — the law that `pnpm -r build` cannot see.
 *
 * A package's public types must be NAMEABLE by a downstream library that itself compiles with
 * `declaration: true`. Cutting a barrel down to a contract breaks that silently: `validateSpec`
 * still compiles here, but a consumer writing `export const w = validateSpec(spec)` gets
 * `TS4023: … is using name 'SpecWarning' from external module … but cannot be named`. Nothing in
 * this monorepo catches it, because every package emits declarations only for ITS OWN sources.
 *
 * So this proof compiles two real consumer modules (`test/fixtures/declaration-consumer/`) from a
 * temp directory whose `node_modules/@looprun-ai/core` symlinks to this package — module resolution
 * therefore goes through the REAL `exports` map, which means this test also proves the `.` and
 * `./internal` conditions in package.json resolve and point at emitted `.d.ts` files.
 *
 * The fix it guards is the TYPE-CLOSURE RIDER at the bottom of `src/index.ts` and `src/internal.ts`.
 * If a later task drops a rider, this goes red with the exact name it may not drop.
 */
import { describe, expect, it, beforeAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, symlinkSync, copyFileSync, writeFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = join(HERE, '..', '..');
const FIXTURES = join(PKG, 'test', 'fixtures', 'declaration-consumer');
const TSC = join(PKG, 'node_modules', 'typescript', 'bin', 'tsc');

const CONSUMERS = ['public-consumer.ts', 'internal-consumer.ts'];

/** Newest mtime under a directory tree — used to decide whether `dist` is stale. */
function newestMtime(dir: string): number {
  let newest = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    newest = Math.max(newest, entry.isDirectory() ? newestMtime(p) : statSync(p).mtimeMs);
  }
  return newest;
}

/** The consumer resolves through `exports`, so the declarations must exist and be current. */
function ensureDeclarations(): void {
  const entry = join(PKG, 'dist', 'index.d.ts');
  const internal = join(PKG, 'dist', 'internal.d.ts');
  const fresh =
    existsSync(entry) &&
    existsSync(internal) &&
    Math.min(statSync(entry).mtimeMs, statSync(internal).mtimeMs) >= newestMtime(join(PKG, 'src'));
  if (fresh) return;
  const built = spawnSync(process.execPath, [TSC, '-p', join(PKG, 'tsconfig.build.json')], {
    cwd: PKG,
    encoding: 'utf8',
  });
  if (built.status !== 0) throw new Error(`could not build declarations:\n${built.stdout}${built.stderr}`);
}

let result: { status: number | null; output: string };

beforeAll(() => {
  ensureDeclarations();

  const work = mkdtempSync(join(tmpdir(), 'looprun-decl-'));
  mkdirSync(join(work, 'node_modules', '@looprun-ai'), { recursive: true });
  symlinkSync(PKG, join(work, 'node_modules', '@looprun-ai', 'core'), 'dir');
  for (const f of CONSUMERS) copyFileSync(join(FIXTURES, f), join(work, f));
  writeFileSync(
    join(work, 'package.json'),
    JSON.stringify({ name: 'decl-consumer', private: true, type: 'module', version: '0.0.0' }, null, 2),
  );
  writeFileSync(
    join(work, 'tsconfig.json'),
    JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2022',
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          strict: true,
          skipLibCheck: true,
          // THE POINT OF THE WHOLE FILE: emit declarations for a consumer of this package.
          declaration: true,
          emitDeclarationOnly: true,
          outDir: 'out',
          types: [],
        },
        include: CONSUMERS,
      },
      null,
      2,
    ),
  );

  const run = spawnSync(process.execPath, [TSC, '-p', 'tsconfig.json'], { cwd: work, encoding: 'utf8' });
  result = { status: run.status, output: `${run.stdout ?? ''}${run.stderr ?? ''}` };
}, 120_000);

describe('declaration-emit portability of the public entry points', () => {
  it('a consumer compiling with declaration:true can name every type both barrels reach', () => {
    expect(
      result.output.trim(),
      'a type reachable from a public signature is not exported — add it to the type-closure rider ' +
        `block in src/index.ts (or src/internal.ts):\n${result.output}`,
    ).toBe('');
    expect(result.status).toBe(0);
  });

  // SELF-TEST: the proof must be able to FAIL, or it is decoration. TS4023/TS2742 are exactly the
  // diagnostics the rider exists to prevent, so assert the harness reports them when they occur.
  it('reports TS4023/TS2742 rather than swallowing them (self-test)', () => {
    const work = mkdtempSync(join(tmpdir(), 'looprun-decl-neg-'));
    mkdirSync(join(work, 'lib'), { recursive: true });
    // A module that exports a value whose type is declared but NOT exported — the exact shape the
    // rider prevents.
    writeFileSync(join(work, 'lib', 'hidden.ts'), 'interface Hidden { a: string }\nexport function make(): Hidden { return { a: "" } }\n');
    writeFileSync(join(work, 'consumer.ts'), 'import { make } from "./lib/hidden.js";\nexport const v = make();\n');
    writeFileSync(
      join(work, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', strict: true,
          skipLibCheck: true, declaration: true, emitDeclarationOnly: true, outDir: 'out', types: [],
        },
        include: ['consumer.ts'],
      }),
    );
    writeFileSync(join(work, 'package.json'), JSON.stringify({ name: 'neg', type: 'module', version: '0.0.0' }));
    const run = spawnSync(process.execPath, [TSC, '-p', 'tsconfig.json'], { cwd: work, encoding: 'utf8' });
    expect(`${run.stdout ?? ''}${run.stderr ?? ''}`).toMatch(/TS4023|TS2742/);
  }, 120_000);
});
