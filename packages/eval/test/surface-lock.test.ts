/**
 * THE EVAL SURFACE LOCK — the sibling of `packages/core/test/proofs/surface-lock.test.ts`,
 * `packages/mastra/test/surface-lock.test.ts` and `packages/models/test/surface-lock.test.ts`.
 *
 * `@looprun-ai/eval` promises exactly the 19 eval rows of `docs/superpowers/specs/2026-07-28-tutorial-outline-final.md` §4
 * (chapter 05): the subject-directory contract (7) plus the measured loop (12). Changing this list
 * changes what looprun promises and must move the outline in the same commit.
 *
 * ELEVEN of the nineteen are also reached by the PUBLISHED `looprun-eval` bin, which does
 * `await import('@looprun-ai/eval')` and calls them off the namespace — it imports the PACKAGE, not
 * the module files, so every symbol it touches is public by that fact (inventory §3, the
 * published-bin rule). BIN_CALLED is transcribed from `packages/eval/bin/looprun-eval.mjs`'s actual
 * `api.<name>` accesses and asserted separately: a future trim must not break the CLI silently.
 *
 * Eval has NO `/internal` subpath (same ruling as mastra and models): the inventory §7.4 `delete`
 * verdicts stop being exported and stay module-local — in-package code and this package's tests
 * import the module files directly. `NOT_EXPORTED` transcribes those verdicts as a positive
 * assertion.
 *
 * Mechanism (copied from core's lock): the TypeScript compiler API over `src/`.
 */
import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const EVAL_INDEX = join(HERE, '..', 'src', 'index.ts');
const EVAL_BIN = join(HERE, '..', 'bin', 'looprun-eval.mjs');

// ── 5.3 The subject directory contract (7) ───────────────────────────────────
const TAUGHT_SUBJECT = [
  'loadSubject', 'Subject', 'SubjectCase', 'CaseTurn', 'CaseInvariants', 'ReqCall', 'RubricItem',
];
// ── 5.4 The `looprun-eval` CLI, as functions (12) ────────────────────────────
const TAUGHT_CLI = [
  'runCommand', 'foldCommand', 'certCommand', 'lintPaths', 'lintSpecLaws', 'lintSpecExecution',
  'lintSpecQuality', 'lintSubject', 'mintSeal', 'verifySeal', 'agentForCase', 'stripGovernance',
];

const TAUGHT = [...TAUGHT_SUBJECT, ...TAUGHT_CLI].sort();

/**
 * Type-closure riders (outline §7): `export type` and nothing more, NOT taught, NOT part of the 19.
 * The outline's §5 keeps them out of the taught contract by the annotation rule (object-literal
 * arguments and inferred results need no name), but a consumer building with `declaration: true`
 * must still be able to NAME them.
 */
const RIDERS = [
  'RunCommandOptions', 'FoldCommandOptions', 'CertCommandOptions', 'CertSummary', 'CertBand', 'LintViolation',
  'UngovernedBundle', 'Seal', 'SealTarget', 'SealVerification',
];

/** Inventory §7.4, verdict `delete` — module-local, never on the barrel. */
const NOT_EXPORTED = [
  'validateSubject', 'checkTrunkStatic', 'readDeclaredTarget', 'DeclaredTarget', 'runCase',
  'toolCallMatches', 'evaluateInvariants', 'CaseDump', 'DumpTurn', 'DumpToolCall',
  'InvariantVerdict', 'RunCaseOptions', 'selectModel', 'SelectedModel', 'TargetSelection',
  'foldVerdicts', 'renderResultsMd', 'readJsonl', 'FoldResult', 'FoldRow', 'VerdictLine',
  'buildCert', 'CertOptions', 'lintSource', 'BANNED_TOKENS', 'computeArtifactHash', 'sealedFiles',
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

/** What the bin actually reaches on the imported namespace (`const api = await import(...)`). */
function binCalledSymbols(): string[] {
  const src = readFileSync(EVAL_BIN, 'utf8');
  return [...new Set([...src.matchAll(/\bapi\.([A-Za-z_$][\w$]*)/g)].map((m) => m[1]))].sort();
}

describe('eval surface lock — the barrel is the tutorial contract', () => {
  const evalExports = exportsOf(EVAL_INDEX);

  it('the taught surface is exactly the outline §4 eval rows (19)', () => {
    expect(TAUGHT.length).toBe(19);
    expect(TAUGHT_SUBJECT.length).toBe(7);
    expect(TAUGHT_CLI.length).toBe(12);
    expect(evalExports.filter((n) => !RIDERS.includes(n))).toEqual(TAUGHT);
  });

  it('exports the 19 taught names plus the type-closure riders, and nothing else', () => {
    expect(evalExports).toEqual([...TAUGHT, ...RIDERS].sort());
  });

  it('every symbol the published `looprun-eval` bin calls is still exported', () => {
    // Read from the bin itself — the rule is about what the CLI does, not about a list we maintain.
    const called = binCalledSymbols();
    expect(called.length).toBe(11);
    expect(called.filter((n) => !evalExports.includes(n))).toEqual([]);
  });

  it('the inventory §7.4 delete verdicts are NOT on the barrel', () => {
    expect(evalExports.filter((n) => NOT_EXPORTED.includes(n))).toEqual([]);
  });

  // SELF-TEST: a lock that cannot fail locks nothing.
  it('detects a drifted surface (self-test)', () => {
    expect(evalExports).not.toEqual([...TAUGHT, ...RIDERS, 'aSymbolNobodyExports'].sort());
  });
});
