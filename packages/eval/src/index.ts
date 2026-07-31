/**
 * @looprun-ai/eval — the public API: exactly the 19 eval rows of `docs/superpowers/specs/2026-07-28-tutorial-outline-final.md` §4
 * (chapter 05 — the subject directory contract, then the measured loop).
 *
 * Eleven of them are ALSO reached by the published `looprun-eval` bin, which does
 * `await import('@looprun-ai/eval')` and calls them off the namespace — the package, not the module
 * files. That makes the bin a second, independent reason those eleven stay here: `runCommand`
 * `foldCommand` `certCommand` `mintSeal` `verifySeal` `lintPaths` `loadSubject` `lintSpecLaws`
 * `lintSpecExecution` `lintSpecQuality` `lintSubject`.
 *
 * Eval has NO `/internal` subpath: the case runner, the fold/cert internals, the provider selection
 * and the lint primitives stay module-local — in-package code and this package's tests import
 * `./run.js`, `./fold.js`, `./cert.js`, `./provider.js`, `./lint.js`, `./seal.js` and `./subject.js`
 * directly. Locked by `packages/eval/test/surface-lock.test.ts`.
 */
export { loadSubject, agentForCase } from './subject.js';
export type { Subject, SubjectCase, CaseTurn, CaseInvariants, ReqCall, RubricItem } from './subject.js';
export { stripGovernance } from './ungoverned.js';
export { runCommand, foldCommand, certCommand } from './commands.js';
export { lintPaths, lintSpecLaws, lintSpecExecution } from './lint.js';
export { lintSpecQuality } from './lint-spec-quality.js';
export { lintSubject } from './lint-subject.js';
export { mintSeal, verifySeal } from './seal.js';

/**
 * TYPE-CLOSURE RIDERS (outline §7) — not taught, not part of the 19, not surface anybody chose.
 * They are the transitive type closure of the value signatures above: the three `*CommandOptions`
 * and `CertSummary` (the `looprun-eval` verbs), `LintViolation` (`lintPaths`), `UngovernedBundle`
 * (`stripGovernance`), `SealTarget` / `Seal` / `SealVerification` (`mintSeal` / `verifySeal`).
 * The outline's §5 keeps them out of the taught contract by the annotation rule — every one is
 * either an object-literal argument or an inferred result — but a consumer building with
 * `declaration: true` must still be able to NAME them (`TS4023`/`TS2742`).
 */
export type { RunCommandOptions, FoldCommandOptions, CertCommandOptions } from './commands.js';
export type { CertSummary } from './cert.js';
export type { LintViolation } from './lint.js';
export type { UngovernedBundle } from './ungoverned.js';
export type { Seal, SealTarget, SealVerification } from './seal.js';
