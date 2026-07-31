/**
 * THE MASTRA SURFACE LOCK — the sibling of `packages/core/test/proofs/surface-lock.test.ts`.
 *
 * `@looprun-ai/mastra` is the package the tutorial imports from first (`looprun/mastra`), and its
 * barrel is TWO things at once:
 *
 *   · its OWN contract — the 7 mastra rows of the placement table in `docs/superpowers/specs/2026-07-28-tutorial-outline-final.md`
 *     §4: chapter 02 (3) + chapter 03 (2) + chapter 05 (2). Changing this list changes what looprun
 *     promises and must move the outline in the same commit;
 *   · plus `export * from '@looprun-ai/core'`, because chapters 02–04 teach core symbols through the
 *     `looprun/mastra` specifier (outline §3). That half is locked by core's own surface lock — here
 *     we only assert it still flows through, whole and unrenamed.
 *
 * Mastra has NO `/internal` subpath (controller ruling): the symbols with an `internal`/`delete`
 * verdict in inventory §7.2 simply stop being exported and stay module-local, so this lock has a
 * single entry point to check. `NOT_EXPORTED` transcribes those verdicts as a positive assertion —
 * a re-export would be a silent contract regression that no other test in the repo would catch.
 *
 * Mechanism (copied from core's lock): the TypeScript compiler API over `src/`, so the assertion
 * covers types as well as values and needs no build step of its own.
 */
import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const MASTRA_INDEX = join(HERE, '..', 'src', 'index.ts');
const CORE_INDEX = join(HERE, '..', '..', 'core', 'src', 'index.ts');

// ── Chapter 02 (3) ───────────────────────────────────────────────────────────
const TAUGHT_02 = ['LoopRunAgent', 'LoopRunAgentConfig', 'LoopRunOptions'];
// ── Chapter 05 (2) ───────────────────────────────────────────────────────────
const TAUGHT_05 = ['RuntimeDeps', 'runSpecConversation'];
// ── Chapter 06 (2) — moved from 03 by the outline §7 amendment ───────────────
const TAUGHT_06 = ['StateView', 'worldFromTools'];

const TAUGHT = [...TAUGHT_02, ...TAUGHT_05, ...TAUGHT_06].sort();

/** Inventory §7.2, verdict `internal` or `delete` — module-local, never on the barrel. */
const NOT_EXPORTED = [
  'CompiledSpec', 'DEFAULT_MAX_STEPS', 'DEFAULT_REDRIVES', 'GuardHooks', 'LoopRunResultMeta',
  'LoopRunSession', 'SessionStore', 'WorldFactory', 'buildTerminalTools', 'buildWorldTools',
  'compileSpec', 'createLoopRunAgent', 'jsonSchemaToZodObject', 'jsonTypeToZod', 'makeGuardHooks',
  'makeInputProcessors', 'repeatedToolCallStop', 'surfaceFingerprint',
];

/** Every name the module exports — values AND types, aliases resolved by the checker. */
function exportsOf(entry: string): string[] {
  const program = ts.createProgram([entry], {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    strict: true,
    skipLibCheck: true,
    noEmit: true,
  });
  const checker = program.getTypeChecker();
  const sf = program.getSourceFile(entry);
  if (!sf) throw new Error(`entry not found: ${entry}`);
  const mod = checker.getSymbolAtLocation(sf);
  if (!mod) throw new Error(`not a module: ${entry}`);
  return checker.getExportsOfModule(mod).map((s) => s.name).sort();
}

describe('mastra surface lock — the barrel is the tutorial contract', () => {
  const mastraExports = exportsOf(MASTRA_INDEX);
  const coreExports = exportsOf(CORE_INDEX);
  const own = mastraExports.filter((n) => !coreExports.includes(n));

  it('the taught mastra surface is exactly the outline §4 mastra rows (7)', () => {
    expect(TAUGHT.length).toBe(7);
    expect(TAUGHT_02.length).toBe(3);
    expect(TAUGHT_05.length).toBe(2);
    expect(TAUGHT_06.length).toBe(2);
    expect(own).toEqual(TAUGHT);
  });

  it('re-exports the whole @looprun-ai/core public barrel, unrenamed', () => {
    // `CORE_INDEX` is core's `src/index.ts` — resolved by PATH, not through the package specifier,
    // so this lane needs no build and says nothing about `dist`. It asserts the source barrels agree;
    // the built core barrel is core's own surface lock's business.
    expect(coreExports.length).toBeGreaterThan(0);
    expect(mastraExports.filter((n) => coreExports.includes(n))).toEqual(coreExports);
  });

  it('@looprun-ai/mastra exports the 7 taught names plus the core re-export, and nothing else', () => {
    expect(mastraExports).toEqual([...TAUGHT, ...coreExports].sort());
  });

  it('the inventory §7.2 internal/delete verdicts are NOT on the barrel', () => {
    expect(mastraExports.filter((n) => NOT_EXPORTED.includes(n))).toEqual([]);
  });

  it('no taught name collides with a core name (the re-export would shadow it)', () => {
    expect(TAUGHT.filter((n) => coreExports.includes(n))).toEqual([]);
  });

  // SELF-TEST: a lock that cannot fail locks nothing.
  it('detects a drifted surface (self-test)', () => {
    expect(mastraExports).not.toEqual([...TAUGHT, ...coreExports, 'aSymbolNobodyExports'].sort());
  });
});
