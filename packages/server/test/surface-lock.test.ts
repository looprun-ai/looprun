/**
 * THE SERVER SURFACE LOCK — the sibling of `packages/core/test/proofs/surface-lock.test.ts`,
 * `packages/mastra/test/surface-lock.test.ts` and `packages/models/test/surface-lock.test.ts`.
 *
 * `@looprun-ai/server` promises exactly the 4 server rows of `docs/tutorial/00-outline.md` §4
 * (chapter 06, "Serve it"): the factory, its two companion types, and the streamed turn event.
 * Changing this list changes what looprun promises and must move the outline in the same commit.
 *
 * The `meta` decision (Task 7b): `TurnEvent.meta` is a `LoopRunResultMeta`, this package's pinned
 * MIRROR of a type that is internal to `@looprun-ai/mastra` (which has no `/internal` subpath).
 * It is exported here as a type-closure RIDER rather than inlined structurally, so the mirror keeps
 * exactly one name — the one `packages/server/test/meta-mirror.test.ts` pins against mastra's.
 *
 * Server has NO `/internal` subpath: the inventory §7.5 `delete` verdicts stop being exported and
 * stay module-local (`./handler.js`, `./session.js`), which is where in-package code and this
 * package's tests import them from. `NOT_EXPORTED` transcribes those verdicts as a positive
 * assertion.
 *
 * Mechanism (copied from core's lock): the TypeScript compiler API over `src/`.
 */
import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SERVER_INDEX = join(HERE, '..', 'src', 'index.ts');

// ── Chapter 06.1 (4) ─────────────────────────────────────────────────────────
const TAUGHT = ['ModelServer', 'ModelServerConfig', 'TurnEvent', 'createModelServer'].sort();

/**
 * Type-closure riders (outline §7): `export type` and nothing more, NOT taught, NOT part of the 4.
 * `TurnEvent.meta` → `LoopRunResultMeta`; `ModelServerConfig.resolveSession` →
 * `(body: CompletionRequestBody, …)` → `WireMessage[]`.
 */
const RIDERS = ['CompletionRequestBody', 'LoopRunResultMeta', 'WireMessage'];

/** Inventory §7.5, verdict `delete` — module-local, never on the barrel. */
const NOT_EXPORTED = [
  'createOpenAiHandler', 'DEFAULT_CONTEXT_LENGTH', 'SESSION_HEADER', 'fingerprintSession',
  'lastUserText', 'resolveSessionId', 'LoopRunEnvelopeMeta',
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

describe('server surface lock — the barrel is the tutorial contract', () => {
  const serverExports = exportsOf(SERVER_INDEX);

  it('the taught surface is exactly the outline §4 server rows (4)', () => {
    expect(TAUGHT.length).toBe(4);
    expect(serverExports.filter((n) => !RIDERS.includes(n))).toEqual(TAUGHT);
  });

  it('exports the 4 taught names plus the type-closure riders, and nothing else', () => {
    expect(serverExports).toEqual([...TAUGHT, ...RIDERS].sort());
  });

  it('`LoopRunResultMeta` is exported, so `TurnEvent.meta` is nameable downstream', () => {
    expect(serverExports).toContain('LoopRunResultMeta');
  });

  it('the inventory §7.5 delete verdicts are NOT on the barrel', () => {
    expect(serverExports.filter((n) => NOT_EXPORTED.includes(n))).toEqual([]);
  });

  // SELF-TEST: a lock that cannot fail locks nothing.
  it('detects a drifted surface (self-test)', () => {
    expect(serverExports).not.toEqual([...TAUGHT, ...RIDERS, 'aSymbolNobodyExports'].sort());
  });
});
