/**
 * THE MODELS SURFACE LOCK — the sibling of `packages/core/test/proofs/surface-lock.test.ts` and
 * `packages/mastra/test/surface-lock.test.ts`.
 *
 * `@looprun-ai/models` promises exactly the 8 models rows of `docs/tutorial/00-outline.md` §4:
 * chapter 05 teaches `geminiFlashLiteThinkOff`, chapter 06 the local-model seven. Changing this
 * list changes what looprun promises and must move the outline in the same commit.
 *
 * THREE of the eight are also called by the PUBLISHED `looprun` bin through a dynamic package
 * import — `packages/looprun/bin/looprun.mjs` does `await import('@looprun-ai/models')` and then
 * `models.resolveAlias(…)` (`:42,66,88,102`), `new models.LlamaCppRuntime()` (`:68,94,103`) and
 * `models.localModelStatus(…)` (`:41`). That is the published-bin rule (inventory §3): a bin that
 * imports the PACKAGE, not the module files, makes every symbol it reaches public by that fact.
 * BIN_CALLED below is asserted separately, so a future trim cannot break the CLI silently.
 *
 * Models has NO `/internal` subpath (same ruling as mastra): the inventory §7.3 `delete` verdicts
 * simply stop being exported and stay module-local. `NOT_EXPORTED` transcribes those verdicts as a
 * positive assertion — a re-export would be a contract regression nothing else here would catch.
 *
 * Mechanism (copied from core's lock): the TypeScript compiler API over `src/`, so the assertion
 * covers types as well as values and needs no build step of its own.
 */
import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const MODELS_INDEX = join(HERE, '..', 'src', 'index.ts');

// ── Chapter 05 (1) ───────────────────────────────────────────────────────────
const TAUGHT_05 = ['geminiFlashLiteThinkOff'];
// ── Chapter 06 (7) ───────────────────────────────────────────────────────────
const TAUGHT_06 = [
  'LlamaCppRuntime', 'LocalModelOptions', 'LocalModelSpec', 'ModelRuntimePort',
  'localModel', 'localModelStatus', 'resolveAlias',
];

const TAUGHT = [...TAUGHT_05, ...TAUGHT_06].sort();

/**
 * Type-closure riders (outline §7): exported `export type` and nothing more, NOT taught, NOT part
 * of the 8. `localModelStatus` returns `Promise<RuntimeStatus>` and `ModelRuntimePort.ensureServer`
 * an `EnsureServerResult` — a consumer with `declaration: true` cannot name either without these.
 */
const RIDERS = ['EnsureServerResult', 'RuntimeStatus'];

/** Called off the namespace by the published `looprun` bin — public BY THAT FACT (inventory §3). */
const BIN_CALLED = ['LlamaCppRuntime', 'localModelStatus', 'resolveAlias'];

/** Inventory §7.3, verdict `delete` — module-local, never on the barrel. */
const NOT_EXPORTED = [
  'MODEL_ALIASES', 'QWEN35_4B', 'QWEN35_RAM8', 'QWEN36_RAM16', 'QWEN36_RAM24', 'QWEN36_RAM32',
  'downloadModel', 'downloadUrl', 'launchFlags', 'localModelClient', 'modelPath', 'serverBaseURL',
  'slotStateDir', 'LooprunLocalModelSpec',
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

describe('models surface lock — the barrel is the tutorial contract', () => {
  const modelsExports = exportsOf(MODELS_INDEX);

  it('the taught surface is exactly the outline §4 models rows (8)', () => {
    expect(TAUGHT.length).toBe(8);
    expect(TAUGHT_05.length).toBe(1);
    expect(TAUGHT_06.length).toBe(7);
    expect(modelsExports.filter((n) => !RIDERS.includes(n))).toEqual(TAUGHT);
  });

  it('exports the 8 taught names plus the type-closure riders, and nothing else', () => {
    expect(modelsExports).toEqual([...TAUGHT, ...RIDERS].sort());
  });

  it('every symbol the published `looprun` bin calls is still exported', () => {
    expect(BIN_CALLED.filter((n) => !modelsExports.includes(n))).toEqual([]);
  });

  it('the inventory §7.3 delete verdicts are NOT on the barrel', () => {
    expect(modelsExports.filter((n) => NOT_EXPORTED.includes(n))).toEqual([]);
  });

  // SELF-TEST: a lock that cannot fail locks nothing.
  it('detects a drifted surface (self-test)', () => {
    expect(modelsExports).not.toEqual([...TAUGHT, ...RIDERS, 'aSymbolNobodyExports'].sort());
  });
});
